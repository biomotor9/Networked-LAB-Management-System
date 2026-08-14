"use client";

import { FormEvent, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Handle,
  MarkerType,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowInstance,
  useNodesState,
  useUpdateNodeInternals,
} from "@xyflow/react";
import {
  arrowStyles,
  defaultNextStatus,
  domains,
  entryTypes,
  localDateString,
  makeId,
  statuses,
  type ArrowStyle,
  type Attachment,
  type Dependency,
  type Domain,
  type Entry,
  type Plan,
  type ServerDocument,
  type Status,
  type ViewportState,
  type WorkspaceData,
} from "./features/workspace/model";
import { canReparentPlan, collectDescendantIds } from "./features/plans/plan-tree";
import { wouldCreateDependencyCycle } from "./features/dependencies/dependency-graph";
import {
  defaultNotebook,
  parseMarkdownBlocks,
  serializeMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownBlockType,
} from "./features/notebook/markdown-codec";
import {
  createBackup,
  LocalWorkspaceRepository,
  readBackupFile,
  type WorkspaceRepository,
} from "./features/persistence/workspace-repository";
import { seedDependencies, seedEntries, seedPlans } from "./data/seed";
import { formatAttachmentSize } from "./features/attachments/validation";
type PlanNodeData = {
  plan: Plan;
  plans: Plan[];
  entries: Entry[];
  dependencies: Dependency[];
  expandedIds: Set<string>;
  recordCount: number;
  childCount: number;
  expanded: boolean;
  getViewport: (id: string) => ViewportState | undefined;
  selectedDependencyId: string | null;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
  onAddChild: (id: string) => void;
  onChangeStatus: (id: string, status: Status) => void;
  onDeletePlan: (id: string) => void;
  onSelectPlan: (id: string) => void;
  onMovePlan: (id: string, position: { x: number; y: number }) => void;
  onReparent: (id: string, parentId: string | null) => void;
  onSaveViewport: (id: string, viewport: ViewportState) => void;
  onSelectDependency: (id: string, event: React.MouseEvent) => void;
  onConnectPlans: (source: string, target: string) => void;
  onBeginHierarchyDrag: (id: string, event: React.PointerEvent<HTMLButtonElement>) => void;
  onMoveHierarchyDrag: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onEndHierarchyDrag: (event: React.PointerEvent<HTMLButtonElement>) => void;
};
type PlanFlowNode = Node<PlanNodeData, "plan">;

function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = { search: "⌕", folder: "▤", chevron: "⌄", add: "+", book: "▱", back: "←", more: "•••", settings: "⚙", branch: "⌞", close: "×" };
  return <span aria-hidden="true">{icons[name] ?? "•"}</span>;
}

function arrowStyleClass(style: ArrowStyle) {
  if (style === "实线箭头") return "solid";
  if (style === "双向箭头") return "both";
  if (style === "无箭头直线") return "plain";
  return "dashed";
}

function ArrowPreset({ style }: { style: ArrowStyle }) {
  return <span className={`arrow-preset ${arrowStyleClass(style)}`} aria-hidden="true"><i /></span>;
}

type MarkdownEditorApi = {
  formatBlock: (type: MarkdownBlockType) => void;
  wrapSelection: (before: string, after: string, placeholder?: string) => void;
  insertDivider: () => void;
  insertImage: (src: string, alt?: string) => void;
};

const MarkdownBlockEditor = forwardRef<MarkdownEditorApi, { source: string; onChange: (value: string) => void; onImageFile: (file: File) => Promise<{ src: string; alt: string }> }>(({ source, onChange, onImageFile }, ref) => {
  const [blocks, setBlocks] = useState<MarkdownBlock[]>(() => parseMarkdownBlocks(source));
  const blocksRef = useRef(blocks);
  const [headings, setHeadings] = useState(() => blocks.filter((block) => block.type === "h1" || block.type === "h2" || block.type === "h3"));
  const [activeId, setActiveId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const updateOutline = (next: MarkdownBlock[]) => {
    const nextHeadings = next.filter((block) => block.type === "h1" || block.type === "h2" || block.type === "h3");
    setHeadings((current) => JSON.stringify(current.map(({ id, type, text }) => ({ id, type, text }))) === JSON.stringify(nextHeadings.map(({ id, type, text }) => ({ id, type, text }))) ? current : nextHeadings);
  };
  const commit = (next: MarkdownBlock[], render = true) => {
    blocksRef.current = next;
    if (render) setBlocks(next);
    updateOutline(next);
    onChange(serializeMarkdownBlocks(next));
  };
  const readBlocksFromDom = () => {
    const elements = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(":scope > [data-block-id]") ?? []);
    return elements.map((element): MarkdownBlock => {
      const type = element.dataset.blockType as MarkdownBlockType;
      const content = element.querySelector<HTMLElement>("[data-editor-content]");
      return { id: element.dataset.blockId!, type, text: (content?.textContent ?? element.dataset.alt ?? "").replace(/\u00a0/g, " "), checked: type === "task" ? !!element.querySelector<HTMLInputElement>(".block-checkbox")?.checked : undefined, src: type === "image" ? element.dataset.src : undefined };
    });
  };
  const syncFromDom = () => {
    const next = readBlocksFromDom();
    if (!next.length) return;
    const structureChanged = next.length !== blocksRef.current.length || next.some((block, index) => block.id !== blocksRef.current[index]?.id || block.type !== blocksRef.current[index]?.type);
    commit(next, structureChanged);
  };
  const selectionBlockId = () => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode instanceof HTMLElement ? selection.anchorNode : selection?.anchorNode?.parentElement;
    return anchor?.closest<HTMLElement>("[data-block-id]")?.dataset.blockId ?? null;
  };
  const focusBlock = (id: string, at = 0) => requestAnimationFrame(() => {
    const element = rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${id}"] [data-editor-content]`);
    if (!element) return;
    element.focus();
    const node = element.firstChild ?? element.appendChild(document.createTextNode(""));
    const range = document.createRange();
    range.setStart(node, Math.min(at, node.textContent?.length ?? 0)); range.collapse(true);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    setActiveId(id);
  });
  const latestBlocks = () => { const next = readBlocksFromDom(); return next.length ? next : blocksRef.current; };
  const patchBlock = (id: string, patch: Partial<MarkdownBlock>, clearContent = false) => {
    const current = latestBlocks();
    if (clearContent) { const content = rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${id}"] [data-editor-content]`); if (content) content.textContent = ""; }
    commit(current.map((block) => block.id === id ? { ...block, ...patch } : block));
  };
  const insertAfter = (id: string, block: MarkdownBlock) => {
    const current = latestBlocks(); const index = current.findIndex((item) => item.id === id);
    const next = [...current]; next.splice(index + 1, 0, block); commit(next); focusBlock(block.id);
  };
  const insertImageAfterActive = (src: string, alt = "实验图片") => {
    const current = latestBlocks();
    const id = selectionBlockId() ?? activeId ?? current[current.length - 1]?.id;
    const image: MarkdownBlock = { id: makeId("md-image"), type: "image", text: alt, src };
    if (!id) commit([image]); else insertAfter(id, image);
  };
  const shortcutType = (text: string): MarkdownBlockType | null => {
    if (text === "# ") return "h1"; if (text === "## ") return "h2"; if (text === "### ") return "h3";
    if (/^[-*] $/.test(text)) return "bullet"; if (/^\d+\. $/.test(text)) return "ordered"; if (text === "> ") return "quote"; return null;
  };
  const readImage = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    void onImageFile(file).then(({ src, alt }) => insertImageAfterActive(src, alt)).catch(() => undefined);
  };
  const replaceSelectedRange = (insertText = "") => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !rootRef.current?.contains(selection.anchorNode)) return false;
    const range = selection.getRangeAt(0);
    const elementFor = (node: globalThis.Node, offset: number, preferPrevious = false) => {
      const element = node instanceof HTMLElement ? node : node.parentElement;
      const direct = element?.closest<HTMLElement>("[data-block-id]");
      if (direct) return direct;
      if (node === rootRef.current) {
        const children = Array.from(rootRef.current.children) as HTMLElement[];
        return children[Math.max(0, Math.min(children.length - 1, offset - (preferPrevious ? 1 : 0)))]?.closest<HTMLElement>("[data-block-id]") ?? null;
      }
      return null;
    };
    const startWrapper = elementFor(range.startContainer, range.startOffset);
    const endWrapper = elementFor(range.endContainer, range.endOffset, true);
    if (!startWrapper || !endWrapper) return false;
    const current = latestBlocks();
    const startIndex = current.findIndex((block) => block.id === startWrapper.dataset.blockId);
    const endIndex = current.findIndex((block) => block.id === endWrapper.dataset.blockId);
    if (startIndex < 0 || endIndex < startIndex) return false;
    const startBlock = current[startIndex]; const endBlock = current[endIndex];
    const textOffset = (content: HTMLElement | null, node: globalThis.Node, offset: number, fallback: number) => {
      if (!content || !content.contains(node)) return fallback;
      const measure = document.createRange(); measure.selectNodeContents(content);
      try { measure.setEnd(node, offset); return measure.toString().length; } catch { return fallback; }
    };
    const startContent = startWrapper.querySelector<HTMLElement>("[data-editor-content]");
    const endContent = endWrapper.querySelector<HTMLElement>("[data-editor-content]");
    const startOffset = textOffset(startContent, range.startContainer, range.startOffset, 0);
    const endOffset = textOffset(endContent, range.endContainer, range.endOffset, endBlock.text.length);
    const prefix = startBlock.type === "image" || startBlock.type === "divider" ? "" : startBlock.text.slice(0, startOffset);
    const suffix = endBlock.type === "image" || endBlock.type === "divider" ? "" : endBlock.text.slice(endOffset);
    const replacement: MarkdownBlock = { ...startBlock, id: makeId("md"), type: startBlock.type === "image" || startBlock.type === "divider" ? "paragraph" : startBlock.type, text: `${prefix}${insertText}${suffix}`, src: undefined };
    const next = [...current.slice(0, startIndex), replacement, ...current.slice(endIndex + 1)];
    commit(next.length ? next : [{ id: makeId("md"), type: "paragraph", text: "" }]);
    focusBlock(replacement.id, prefix.length + insertText.length);
    return true;
  };

  useImperativeHandle(ref, () => ({
    formatBlock(type) { const current = latestBlocks(); const id = selectionBlockId() ?? activeId ?? current[0]?.id; if (id) { patchBlock(id, { type, checked: type === "task" ? false : undefined }); focusBlock(id, current.find((block) => block.id === id)?.text.length ?? 0); } },
    wrapSelection(before, after, placeholder = "文本") {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !rootRef.current?.contains(selection.anchorNode)) return;
      const range = selection.getRangeAt(0); const selected = range.toString() || placeholder;
      if (!selection.isCollapsed) { replaceSelectedRange(`${before}${selected}${after}`); return; }
      range.deleteContents();
      const node = document.createTextNode(`${before}${selected}${after}`); range.insertNode(node); range.setStart(node, before.length); range.setEnd(node, before.length + selected.length); selection.removeAllRanges(); selection.addRange(range); syncFromDom();
    },
    insertDivider() { const current = latestBlocks(); const id = selectionBlockId() ?? activeId ?? current[current.length - 1]?.id; if (id) insertAfter(id, { id: makeId("md"), type: "divider", text: "" }); },
    insertImage: insertImageAfterActive,
  }));

  const handleInput = (event: React.FormEvent<HTMLElement>) => {
    const wrapper = (event.target as HTMLElement).closest<HTMLElement>("[data-block-id]");
    if (!wrapper) { syncFromDom(); return; }
    const id = wrapper.dataset.blockId!; const type = wrapper.dataset.blockType as MarkdownBlockType;
    setActiveId(id);
    const content = wrapper.querySelector<HTMLElement>("[data-editor-content]"); const text = (content?.textContent ?? "").replace(/\u00a0/g, " ");
    const shortcut = shortcutType(text);
    if (type === "bullet" && /^\[[ xX]\] $/.test(text)) { patchBlock(id, { type: "task", checked: /[xX]/.test(text), text: "" }, true); focusBlock(id); }
    else if (shortcut) { patchBlock(id, { type: shortcut, text: "" }, true); focusBlock(id); }
    else syncFromDom();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection) return;
    if (!selection.isCollapsed) {
      if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); replaceSelectedRange(); }
      return;
    }
    const anchor = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode?.parentElement;
    const wrapper = anchor?.closest<HTMLElement>("[data-block-id]"); if (!wrapper) return;
    const id = wrapper.dataset.blockId!; const current = latestBlocks(); const index = current.findIndex((block) => block.id === id); const block = current[index]; if (!block) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); const repeatable = block.type === "bullet" || block.type === "ordered" || block.type === "task";
      if (repeatable && !block.text.trim()) { patchBlock(id, { type: "paragraph", checked: undefined }); focusBlock(id); return; }
      const next: MarkdownBlock = { id: makeId("md"), type: repeatable ? block.type : "paragraph", text: "", checked: block.type === "task" ? false : undefined };
      insertAfter(id, next);
    }
    if (event.key === "Backspace" && !block.text && current.length > 1 && block.type !== "image") {
      event.preventDefault(); const previous = current[index - 1]; commit(current.filter((item) => item.id !== id)); if (previous) focusBlock(previous.id, previous.text.length);
    }
  };

  return <div className="notebook-layout">
    <aside className="notebook-outline"><div><strong>文档大纲</strong><span>{headings.length} 个标题</span></div>{headings.length ? headings.map((block) => <button key={block.id} className={`outline-${block.type}`} onClick={() => focusBlock(block.id)}>{block.text || "未命名标题"}</button>) : <p>尚未添加标题</p>}</aside>
    <section className="block-editor" ref={rootRef} contentEditable suppressContentEditableWarning spellCheck aria-label="Markdown 所见即所得编辑区" onMouseUp={() => { const id = selectionBlockId(); if (id) setActiveId(id); }} onInput={handleInput} onKeyDown={handleKeyDown} onBeforeInput={(event) => {
      const input = event.nativeEvent as InputEvent; const selection = window.getSelection();
      const inputType = typeof input.inputType === "string" ? input.inputType : "";
      if (!selection?.isCollapsed && (inputType.startsWith("delete") || inputType === "insertText")) { event.preventDefault(); replaceSelectedRange(inputType === "insertText" ? input.data ?? "" : ""); }
    }} onPaste={(event) => {
      const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
      if (imageItem) { event.preventDefault(); if (!window.getSelection()?.isCollapsed) replaceSelectedRange(); const file = imageItem.getAsFile(); if (file) readImage(file); }
      else if (!window.getSelection()?.isCollapsed) { event.preventDefault(); replaceSelectedRange(event.clipboardData.getData("text/plain")); }
    }}>
      {blocks.map((block, index) => {
        if (block.type === "divider") return <div data-block-id={block.id} data-block-type="divider" className="editor-divider" contentEditable={false} key={block.id}><hr /><button aria-label="在分隔线后继续输入" onClick={() => insertAfter(block.id, { id: makeId("md"), type: "paragraph", text: "" })}>＋</button></div>;
        if (block.type === "image") return <figure data-block-id={block.id} data-block-type="image" data-src={block.src} data-alt={block.text} className="editor-image" contentEditable={false} key={block.id}><img src={block.src} alt={block.text || "实验图片"} /><figcaption>{block.text || "实验图片"}</figcaption><button aria-label="删除图片" onClick={() => commit(latestBlocks().filter((item) => item.id !== block.id))}>×</button></figure>;
        let order = 0; if (block.type === "ordered") { for (let i = index; i >= 0 && blocks[i].type === "ordered"; i -= 1) order += 1; }
        return <div data-block-id={block.id} data-block-type={block.type} className={`editor-block block-${block.type} ${activeId === block.id ? "active" : ""}`} key={block.id}>
          {block.type === "bullet" && <span className="block-marker" contentEditable={false}>•</span>}{block.type === "ordered" && <span className="block-marker" contentEditable={false}>{order}.</span>}{block.type === "quote" && <span className="block-marker" contentEditable={false}>›</span>}
          {block.type === "task" && <span contentEditable={false}><input className="block-checkbox" type="checkbox" checked={!!block.checked} onChange={(event) => patchBlock(block.id, { checked: event.target.checked })} /></span>}
          <div data-editor-content className="block-content" ref={(element) => { if (element && !element.dataset.initialized) { element.textContent = block.text; element.dataset.initialized = "true"; } }} />
        </div>;
      })}
      <div className="editor-bottom-space" contentEditable={false} onClick={() => { const current = latestBlocks(); const last = current[current.length - 1]; if (last?.type === "image" || last?.type === "divider") insertAfter(last.id, { id: makeId("md"), type: "paragraph", text: "" }); else if (last) focusBlock(last.id, last.text.length); }} />
    </section>
  </div>;
});
MarkdownBlockEditor.displayName = "MarkdownBlockEditor";

function dependencyEdges(dependencies: Dependency[], visibleIds: Set<string>, selectedDependencyId: string | null = null): Edge[] {
  return dependencies.filter((item) => visibleIds.has(item.sourceId) && visibleIds.has(item.targetId)).map((item) => {
    const arrowStyle = item.arrowStyle ?? "虚线箭头";
    const hasEnd = arrowStyle !== "无箭头直线";
    const hasStart = arrowStyle === "双向箭头";
    return {
      id: item.id,
      source: item.sourceId,
      target: item.targetId,
      selected: item.id === selectedDependencyId,
      label: item.label?.trim() || undefined,
      animated: arrowStyle === "虚线箭头",
      style: { stroke: "#2878ff", strokeWidth: 2, strokeDasharray: arrowStyle === "虚线箭头" ? "7 5" : undefined },
      labelStyle: { fill: "#2878ff", fontSize: 10, fontWeight: 700 },
      markerStart: hasStart ? { type: MarkerType.ArrowClosed, color: "#2878ff", width: 17, height: 17 } : undefined,
      markerEnd: hasEnd ? { type: MarkerType.ArrowClosed, color: "#2878ff", width: 17, height: 17 } : undefined,
    };
  });
}

function makePlanNode(plan: Plan, index: number, data: Omit<PlanNodeData, "plan" | "recordCount" | "childCount" | "expanded">, previousPosition?: { x: number; y: number }): PlanFlowNode {
  return {
    id: plan.id,
    type: "plan",
    position: previousPosition ?? { x: plan.graphX ?? index * 400 + 50, y: plan.graphY ?? 80 + (index % 2) * 70 },
    data: {
      ...data,
      plan,
      recordCount: data.entries.filter((entry) => entry.planId === plan.id).length,
      childCount: data.plans.filter((child) => child.parentId === plan.id).length,
      expanded: data.expandedIds.has(plan.id),
    },
  };
}

function PlanGraphNode({ data, selected }: NodeProps<PlanFlowNode>) {
  const { plan, childCount = 0, onFocus = () => undefined, onAddChild = () => undefined } = data;
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => { updateNodeInternals(plan.id); }, [data.expanded, plan.id, updateNodeInternals]);
  const nextStatus = defaultNextStatus(plan.status);
  return (
    <article data-plan-drop-id={plan.id} className={`graph-node domain-border-${plan.domain} ${data.expanded ? "inline-expanded" : ""} ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="graph-handle" />
      <header className={`graph-node-banner graph-status-${plan.status}`}><h3>{plan.title}</h3><div className="node-title-actions"><button className={`expand-level nodrag expand-status-${plan.status}`} aria-label={childCount > 0 ? `${data.expanded ? "收起" : "展开"} ${plan.title} 的子级计划` : `为 ${plan.title} 创建子级计划`} onClick={(event) => { event.stopPropagation(); if (childCount > 0) data.onToggle(plan.id); else onAddChild(plan.id); }}>{childCount > 0 ? (data.expanded ? "收起" : "展开") : "+"}</button><button className={`focus-level nodrag expand-status-${plan.status}`} aria-label={`聚焦查看 ${plan.title}`} title="聚焦查看" onClick={(event) => { event.stopPropagation(); onFocus(plan.id); }}>⤢</button></div></header>
      <div className="graph-node-body"><p>{plan.summary || "尚未填写探索说明。"}</p></div>
      {data.expanded && childCount > 0 && <InlinePlanCanvas parentData={data} />}
      <footer className={`node-dates graph-date-${plan.status}`}><time>{plan.status === "已完成" ? (plan.completedAt || "未记录") : (plan.plannedCompletionDate || "未设置")}</time></footer>
      <div className="node-hover-actions nodrag nowheel" onClick={(event) => event.stopPropagation()}>
        <div className="status-action-group">
          <button className={`status-quick-action action-status-${nextStatus}`} title={`切换为${nextStatus}`} onClick={() => { setStatusMenuOpen(false); data.onChangeStatus(plan.id, nextStatus); }}>{nextStatus}</button>
          <button className={`status-menu-trigger action-status-${nextStatus}`} aria-label={`选择 ${plan.title} 的状态`} aria-expanded={statusMenuOpen} onClick={() => setStatusMenuOpen((open) => !open)}>⌄</button>
          {statusMenuOpen && <div className="node-status-menu" role="menu">{statuses.filter((status) => status !== plan.status).map((status) => <button key={status} role="menuitem" className={`status-option status-option-${status}`} onClick={() => { data.onChangeStatus(plan.id, status); setStatusMenuOpen(false); }}><i />{status}</button>)}</div>}
        </div>
        <button className="node-delete-action" aria-label={`删除 ${plan.title}`} onClick={() => data.onDeletePlan(plan.id)}>删除</button>
      </div>
      <Handle type="source" position={Position.Right} className="graph-handle" />
    </article>
  );
}

const nodeTypes = { plan: PlanGraphNode };

function InlinePlanCanvas({ parentData }: { parentData: PlanNodeData }) {
  const { plan, plans, entries } = parentData;
  const childPlans = useMemo(() => plans.filter((candidate) => candidate.parentId === plan.id), [plans, plan.id]);
  const canvasRef = useRef<HTMLDivElement>(null);

  return <div className="inline-child-shell" ref={canvasRef} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
    <div className="inline-child-caption"><span>子级计划画布</span><small>拖出边界可提升一级</small></div>
    <div className="inline-child-canvas">
      <div className="inline-plan-grid">
        {childPlans.map((child) => {
          const grandchildCount = plans.filter((candidate) => candidate.parentId === child.id).length;
          const recordCount = entries.filter((entry) => entry.planId === child.id).length;
          return <article
            key={child.id}
            data-plan-drop-id={child.id}
            className={`inline-plan-card domain-border-${child.domain}`}
          >
            <div className={`inline-plan-status graph-status-${child.status}`} />
            <button className="inline-plan-main" onClick={() => parentData.onSelectPlan(child.id)}><strong>{child.title}</strong><p>{child.summary || "尚未填写探索说明。"}</p></button>
            <div className="inline-plan-meta"><span>{recordCount} 条记录</span>{grandchildCount > 0 && <span>{grandchildCount} 个子级</span>}<div>{grandchildCount > 0 && <button aria-label={`${parentData.expandedIds.has(child.id) ? "收起" : "展开"} ${child.title}`} onClick={() => parentData.onToggle(child.id)}>{parentData.expandedIds.has(child.id) ? "收起" : "展开"}</button>}<button className="inline-drag-handle" aria-label={`拖动 ${child.title} 调整层级`} title="按住并拖动以调整层级" onClick={(event) => event.preventDefault()} onPointerDown={(event) => parentData.onBeginHierarchyDrag(child.id, event)} onPointerMove={parentData.onMoveHierarchyDrag} onPointerUp={parentData.onEndHierarchyDrag} onPointerCancel={parentData.onEndHierarchyDrag}>⠿</button></div></div>
            {grandchildCount > 0 && parentData.expandedIds.has(child.id) && <div className="inline-grandchildren">{plans.filter((candidate) => candidate.parentId === child.id).map((grandchild) => <button key={grandchild.id} onClick={() => parentData.onSelectPlan(grandchild.id)}>{grandchild.title}</button>)}</div>}
          </article>;
        })}
      </div>
    </div>
  </div>;
}

export default function WorkspaceClient({ viewer }: { viewer: { displayName: string; role: "owner" | "member" } }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [entries, setEntries] = useState(seedEntries);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "graph">("graph");
  const [graphFocus, setGraphFocus] = useState<string | null>(null);
  const [graphNodes, setGraphNodes, onGraphNodesChange] = useNodesState<PlanFlowNode>([]);
  const [graphNotice, setGraphNotice] = useState("");
  const [selectedDependencyId, setSelectedDependencyId] = useState<string | null>(null);
  const [graphExpanded, setGraphExpanded] = useState<Set<string>>(new Set(["p1"]));
  const [viewStates, setViewStates] = useState<Record<string, ViewportState>>({});
  const viewStatesRef = useRef<Record<string, ViewportState>>({});
  const [notebookDocs, setNotebookDocs] = useState<Record<string, string>>({});
  const [documentSaveStatus, setDocumentSaveStatus] = useState<Record<string, string>>({});
  const [notebookEditorId, setNotebookEditorId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<"overview" | "entries" | "attachments">("overview");
  const notebookEditorRef = useRef<MarkdownEditorApi>(null);
  const notebookImageInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const workspaceRepositoryRef = useRef<WorkspaceRepository | null>(null);
  const projectVersionRef = useRef(1);
  const lastServerSnapshotRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const documentVersionsRef = useRef<Record<string, number>>({});
  const documentSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const documentSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const graphInstanceRef = useRef<ReactFlowInstance<PlanFlowNode, Edge> | null>(null);
  const [hierarchyDrag, setHierarchyDrag] = useState<{ id: string; x: number; y: number; pointerId: number } | null>(null);
  const hierarchyDragRef = useRef<{ id: string; x: number; y: number; pointerId: number } | null>(null);
  const [edgeMenuPosition, setEdgeMenuPosition] = useState({ x: 16, y: 16 });
  const [edgeStyleMenuOpen, setEdgeStyleMenuOpen] = useState(false);
  const graphCanvasRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["p0", "p1", "p4", "p6", "p8", "p12", "p15"]));
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<Domain | "全部领域">("全部领域");
  const [sidebarRoot, setSidebarRoot] = useState<string | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>("p2");
  const [showCreate, setShowCreate] = useState(false);
  const [newParent, setNewParent] = useState<string | null>(null);
  const [createAndFocus, setCreateAndFocus] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [localMigrationData, setLocalMigrationData] = useState<WorkspaceData | null>(null);
  const [localContentMigrationData, setLocalContentMigrationData] = useState<WorkspaceData | null>(null);
  const [storageMessage, setStorageMessage] = useState("正在读取团队项目…");

  useEffect(() => { viewStatesRef.current = viewStates; }, [viewStates]);

  useEffect(() => () => {
    Object.values(documentSaveTimersRef.current).forEach((timer) => clearTimeout(timer));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const repository = new LocalWorkspaceRepository(window.localStorage);
    workspaceRepositoryRef.current = repository;
    void Promise.all([
      repository.load().catch(() => null),
      fetch("/api/workspace", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("团队项目读取失败。");
        return response.json() as Promise<{ project: { version: number }; plans: Plan[]; dependencies: Dependency[]; documents: Record<string, ServerDocument>; entries: Entry[]; attachments: Attachment[] }>;
      }),
    ]).then(([saved, server]) => {
      if (cancelled) return;
      setPlans(server.plans);
      setDependencies(server.dependencies);
      setEntries(server.entries);
      setAttachments(server.attachments);
      setNotebookDocs(Object.fromEntries(Object.entries(server.documents).map(([planId, document]) => [planId, document.content])));
      documentVersionsRef.current = Object.fromEntries(Object.entries(server.documents).map(([planId, document]) => [planId, document.version]));
      projectVersionRef.current = server.project.version;
      lastServerSnapshotRef.current = JSON.stringify({ plans: server.plans, dependencies: server.dependencies });
      setServerReady(true);
      if (saved) {
        setGraphExpanded(new Set(saved.graphExpanded));
        setViewStates(saved.viewStates);
        if (!server.plans.length && saved.plans.length) setLocalMigrationData(saved);
        if (!server.entries.length && !Object.keys(server.documents).length && (saved.entries.length || Object.keys(saved.notebookDocs).length)) setLocalContentMigrationData(saved);
      }
      setStorageMessage(server.plans.length ? "已连接团队项目" : "团队项目为空，可导入备份或恢复示例");
    }).catch(() => {
      if (cancelled) return;
      setStorageMessage("团队项目无法读取，请检查网络后刷新");
    }).finally(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const repository = workspaceRepositoryRef.current;
    if (!hydrated || !repository) return;
    const data = { plans, entries, dependencies, graphExpanded: Array.from(graphExpanded), viewStates, notebookDocs } satisfies WorkspaceData;
    void repository.save(data).then(() => {
      // 本机只保留文档草稿、界面状态和可导出的缓存；计划事实源是服务器。
    }).catch(() => {
      setStorageMessage("本机草稿保存失败，请立即导出备份");
    });
  }, [plans, entries, dependencies, graphExpanded, viewStates, notebookDocs, hydrated]);

  useEffect(() => {
    if (!hydrated || !serverReady) return;
    const serialized = JSON.stringify({ plans, dependencies });
    if (serialized === lastServerSnapshotRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const snapshot = { plans, dependencies };
      saveChainRef.current = saveChainRef.current.then(async () => {
        setStorageMessage("正在保存到团队服务器…");
        const response = await fetch("/api/workspace/replace", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: projectVersionRef.current, ...snapshot }) });
        const result = await response.json() as { project?: { version: number }; plans?: Plan[]; dependencies?: Dependency[]; error?: string; code?: string };
        if (!response.ok || !result.project || !result.plans || !result.dependencies) {
          setStorageMessage(result.code === "VERSION_CONFLICT" ? "其他成员已修改项目，请刷新页面后继续" : (result.error ?? "服务器保存失败"));
          return;
        }
        projectVersionRef.current = result.project.version;
        lastServerSnapshotRef.current = JSON.stringify({ plans: result.plans, dependencies: result.dependencies });
        setStorageMessage("已保存到团队服务器");
      }).catch(() => setStorageMessage("服务器保存失败，请检查网络"));
    }, 650);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [plans, dependencies, hydrated, serverReady]);

  const updateNotebookDocument = (planId: string, content: string) => {
    setNotebookDocs((current) => ({ ...current, [planId]: content }));
    if (!hydrated || !serverReady) return;
    if (documentSaveTimersRef.current[planId]) clearTimeout(documentSaveTimersRef.current[planId]);
    setDocumentSaveStatus((current) => ({ ...current, [planId]: "等待保存…" }));
    documentSaveTimersRef.current[planId] = setTimeout(() => {
      documentSaveChainRef.current = documentSaveChainRef.current.then(async () => {
        setDocumentSaveStatus((current) => ({ ...current, [planId]: "正在保存到团队服务器…" }));
        const response = await fetch(`/api/workspace/documents/${encodeURIComponent(planId)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: documentVersionsRef.current[planId] ?? 0, content }),
        });
        const result = await response.json() as { document?: ServerDocument; error?: string; code?: string };
        if (!response.ok || !result.document) {
          const message = result.code === "VERSION_CONFLICT" ? "保存冲突，本机草稿已保留" : (result.error ?? "文档保存失败，本机草稿已保留");
          setDocumentSaveStatus((current) => ({ ...current, [planId]: message }));
          setStorageMessage(message);
          return;
        }
        documentVersionsRef.current[planId] = result.document.version;
        setDocumentSaveStatus((current) => ({ ...current, [planId]: "已保存到团队服务器" }));
      }).catch(() => {
        setDocumentSaveStatus((current) => ({ ...current, [planId]: "网络错误，本机草稿已保留" }));
      });
    }, 800);
  };

  const exportBackup = () => {
    const data: WorkspaceData = { plans, entries, dependencies, graphExpanded: Array.from(graphExpanded), viewStates, notebookDocs };
    const backup = createBackup(data);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `atlas-eln-${localDateString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStorageMessage("本地备份已导出");
  };

  const replaceTeamPlans = async (data: Pick<WorkspaceData, "plans" | "dependencies">) => {
    const response = await fetch("/api/workspace/replace", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: projectVersionRef.current, plans: data.plans, dependencies: data.dependencies }) });
    const result = await response.json() as { project?: { version: number }; plans?: Plan[]; dependencies?: Dependency[]; error?: string };
    if (!response.ok || !result.project || !result.plans || !result.dependencies) throw new Error(result.error ?? "团队项目导入失败。");
    projectVersionRef.current = result.project.version;
    lastServerSnapshotRef.current = JSON.stringify({ plans: result.plans, dependencies: result.dependencies });
    setPlans(result.plans);
    setDependencies(result.dependencies);
    return result;
  };

  const replaceTeamContent = async (data: Pick<WorkspaceData, "entries" | "notebookDocs">, mode: "replace" | "if-empty") => {
    const response = await fetch("/api/workspace/content/replace", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, documents: data.notebookDocs, entries: data.entries }),
    });
    const result = await response.json() as { documents?: Record<string, ServerDocument>; entries?: Entry[]; error?: string };
    if (!response.ok || !result.documents || !result.entries) throw new Error(result.error ?? "团队内容迁移失败。");
    setNotebookDocs(Object.fromEntries(Object.entries(result.documents).map(([planId, document]) => [planId, document.content])));
    documentVersionsRef.current = Object.fromEntries(Object.entries(result.documents).map(([planId, document]) => [planId, document.version]));
    setEntries(result.entries);
    return result;
  };

  const migrateLocalPlans = async () => {
    if (!localMigrationData || !window.confirm(`检测到本机保存的 ${localMigrationData.plans.length} 个计划。是否将其迁移到当前团队项目？`)) return;
    try {
      await replaceTeamPlans(localMigrationData);
      if (localMigrationData.entries.length || Object.keys(localMigrationData.notebookDocs).length) await replaceTeamContent(localMigrationData, "if-empty");
      setLocalMigrationData(null);
      setLocalContentMigrationData(null);
      setStorageMessage("本机计划已迁移到团队服务器");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "本机计划迁移失败");
    }
  };

  const migrateLocalContent = async () => {
    if (!localContentMigrationData || !window.confirm(`检测到本机保存的 ${Object.keys(localContentMigrationData.notebookDocs).length} 份文档和 ${localContentMigrationData.entries.length} 条事件。是否迁移到团队服务器？`)) return;
    try {
      await replaceTeamContent(localContentMigrationData, "if-empty");
      setLocalContentMigrationData(null);
      setStorageMessage("本机文档和事件已迁移到团队服务器");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "本机内容迁移失败");
    }
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const data = readBackupFile(parsed);
      if (!window.confirm(`将用备份中的 ${data.plans.length} 个计划替换团队服务器中的当前计划，同时恢复本机文档和记录，是否继续？`)) return;
      await replaceTeamPlans(data);
      await replaceTeamContent(data, "replace");
      setGraphExpanded(new Set(data.graphExpanded));
      setViewStates(data.viewStates);
      setGraphFocus(null);
      setSelectedId(null);
      setStorageMessage("计划、文档和实验事件已导入团队服务器");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "备份恢复失败");
    }
  };

  const selected = plans.find((plan) => plan.id === selectedId) ?? null;
  const selectedDependency = dependencies.find((item) => item.id === selectedDependencyId) ?? null;
  const childrenOf = (id: string | null) => plans.filter((plan) => plan.parentId === id);
  const descendantSetOf = (id: string) => collectDescendantIds(plans, id);

  const descendantIds = useMemo(() => {
    if (sidebarRoot === "all") return null;
    return collectDescendantIds(plans, sidebarRoot);
  }, [plans, sidebarRoot]);

  const matchedIds = useMemo(() => {
    const query = search.trim().toLowerCase();
    const direct = plans.filter((plan) => {
      const inRoot = !descendantIds || descendantIds.has(plan.id);
      const inDomain = domainFilter === "全部领域" || plan.domain === domainFilter;
      const inSearch = !query || [plan.title, plan.summary, ...plan.tags].join(" ").toLowerCase().includes(query);
      return inRoot && inDomain && inSearch;
    });
    const ids = new Set(direct.map((plan) => plan.id));
    direct.forEach((plan) => {
      let parent = plans.find((candidate) => candidate.id === plan.parentId);
      while (parent) { ids.add(parent.id); parent = plans.find((candidate) => candidate.id === parent?.parentId); }
    });
    return ids;
  }, [plans, search, domainFilter, descendantIds]);

  const visibleRows = useMemo(() => {
    const rows: Array<{ plan: Plan; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
      plans.filter((plan) => plan.parentId === parentId).forEach((plan) => {
        if (!matchedIds.has(plan.id)) return;
        rows.push({ plan, depth });
        const forcedOpen = search.trim() || domainFilter !== "全部领域";
        if (expanded.has(plan.id) || forcedOpen) walk(plan.id, depth + 1);
      });
    };
    walk(null, 0);
    return rows;
  }, [plans, matchedIds, expanded, search, domainFilter]);

  const saveViewport = (id: string, viewport: ViewportState) => setViewStates((current) => {
    const previous = current[id];
    if (previous && Math.abs(previous.x - viewport.x) < 0.01 && Math.abs(previous.y - viewport.y) < 0.01 && Math.abs(previous.zoom - viewport.zoom) < 0.001) return current;
    return { ...current, [id]: viewport };
  });
  const toggleGraphExpand = (id: string) => setGraphExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const movePlan = (id: string, position: { x: number; y: number }) => setPlans((current) => current.map((plan) => plan.id === id ? { ...plan, graphX: position.x, graphY: position.y } : plan));
  const reparentPlan = (id: string, parentId: string | null) => {
    if (!canReparentPlan(plans, id, parentId)) return;
    const nextPlans = plans.map((plan) => plan.id === id ? { ...plan, parentId, updatedAt: "刚刚", graphX: undefined, graphY: undefined } : plan);
    const parentById = new Map(nextPlans.map((plan) => [plan.id, plan.parentId]));
    setPlans(nextPlans);
    setDependencies((current) => current.filter((dependency) => parentById.get(dependency.sourceId) === parentById.get(dependency.targetId)));
    if (parentId) setGraphExpanded((current) => new Set(current).add(parentId));
    setGraphNotice(parentId ? "已移入新的父级计划，跨层级连线已清理" : "已提升一级，跨层级连线已清理");
    setTimeout(() => setGraphNotice(""), 2200);
  };
  const beginHierarchyDrag = (id: string, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextDrag = { id, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    hierarchyDragRef.current = nextDrag;
    setHierarchyDrag(nextDrag);
  };
  const moveHierarchyDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const currentDrag = hierarchyDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const nextDrag = { ...currentDrag, x: event.clientX, y: event.clientY };
    hierarchyDragRef.current = nextDrag;
    setHierarchyDrag(nextDrag);
  };
  const finishHierarchyDrag = () => {
    const currentDrag = hierarchyDragRef.current;
    if (!currentDrag) return;
    const elementBelow = document.elementFromPoint(currentDrag.x, currentDrag.y) as HTMLElement | null;
    const targetId = elementBelow?.closest<HTMLElement>("[data-plan-drop-id]")?.dataset.planDropId;
    if (targetId && targetId !== currentDrag.id) reparentPlan(currentDrag.id, targetId);
    else if (elementBelow?.closest("[data-plan-canvas]")) reparentPlan(currentDrag.id, graphFocus);
    hierarchyDragRef.current = null;
    setHierarchyDrag(null);
  };
  const endHierarchyDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const currentDrag = hierarchyDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finishHierarchyDrag();
  };
  useEffect(() => {
    if (!hierarchyDrag?.id) return;
    const trackPointer = (event: PointerEvent) => {
      const currentDrag = hierarchyDragRef.current;
      if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
      const nextDrag = { ...currentDrag, x: event.clientX, y: event.clientY };
      hierarchyDragRef.current = nextDrag;
      setHierarchyDrag(nextDrag);
    };
    const releasePointer = (event: PointerEvent) => {
      const currentDrag = hierarchyDragRef.current;
      if (currentDrag?.pointerId === event.pointerId) finishHierarchyDrag();
    };
    const trackMouse = (event: MouseEvent) => {
      const currentDrag = hierarchyDragRef.current;
      if (!currentDrag) return;
      const nextDrag = { ...currentDrag, x: event.clientX, y: event.clientY };
      hierarchyDragRef.current = nextDrag;
      setHierarchyDrag(nextDrag);
    };
    const releaseMouse = () => { if (hierarchyDragRef.current) finishHierarchyDrag(); };
    window.addEventListener("pointermove", trackPointer);
    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);
    window.addEventListener("mousemove", trackMouse);
    window.addEventListener("mouseup", releaseMouse);
    return () => {
      window.removeEventListener("pointermove", trackPointer);
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
      window.removeEventListener("mousemove", trackMouse);
      window.removeEventListener("mouseup", releaseMouse);
    };
  }, [hierarchyDrag?.id, graphFocus, plans]);
  const selectDependencyAt = (id: string, event: React.MouseEvent) => {
    const bounds = graphCanvasRef.current?.getBoundingClientRect();
    if (bounds) {
      const editorWidth = 300;
      const editorHeight = 260;
      setEdgeMenuPosition({
        x: Math.max(12, Math.min(event.clientX - bounds.left + 14, bounds.width - editorWidth - 12)),
        y: Math.max(12, Math.min(event.clientY - bounds.top + 14, bounds.height - editorHeight - 12)),
      });
    }
    setSelectedDependencyId(id);
    setEdgeStyleMenuOpen(false);
  };

  useEffect(() => {
    setGraphNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]));
      const query = search.trim().toLowerCase();
      const levelPlans = plans.filter((plan) => plan.parentId === graphFocus).filter((plan) => {
        const children = plans.filter((child) => child.parentId === plan.id);
        const domainMatch = domainFilter === "全部领域" || plan.domain === domainFilter || children.some((child) => child.domain === domainFilter);
        const textMatch = !query || [plan.title, plan.summary, ...plan.tags, ...children.flatMap((child) => [child.title, child.summary, ...child.tags])].join(" ").toLowerCase().includes(query);
        return domainMatch && textMatch;
      });
      const sharedData: Omit<PlanNodeData, "plan" | "recordCount" | "childCount" | "expanded"> = {
        plans,
        entries,
        dependencies,
        expandedIds: graphExpanded,
        getViewport: (id: string) => viewStatesRef.current[id],
        selectedDependencyId,
        onToggle: toggleGraphExpand,
        onFocus: (id: string) => setGraphFocus(id),
        onAddChild: (id: string) => { setNewParent(id); setCreateAndFocus(false); setShowCreate(true); },
        onChangeStatus: changePlanStatus,
        onDeletePlan: deletePlan,
        onSelectPlan: (id: string) => { setSelectedDependencyId(null); setSelectedId(id); },
        onMovePlan: movePlan,
        onReparent: reparentPlan,
        onSaveViewport: saveViewport,
        onSelectDependency: selectDependencyAt,
        onConnectPlans: (source: string, target: string) => tryAddDependency(source, target),
        onBeginHierarchyDrag: beginHierarchyDrag,
        onMoveHierarchyDrag: moveHierarchyDrag,
        onEndHierarchyDrag: endHierarchyDrag,
      };
      return levelPlans.map((plan, index) => makePlanNode(plan, index, sharedData, positions.get(plan.id)));
    });
  }, [plans, entries, dependencies, graphExpanded, selectedDependencyId, graphFocus, search, domainFilter, setGraphNodes]);

  const graphEdges = useMemo<Edge[]>(() => {
    return dependencyEdges(dependencies, new Set(graphNodes.map((node) => node.id)), selectedDependencyId);
  }, [dependencies, graphNodes, selectedDependencyId]);

  function tryAddDependency(source: string, target: string) {
    if (source === target || dependencies.some((item) => item.sourceId === source && item.targetId === target)) return;
    if (wouldCreateDependencyCycle(dependencies, source, target)) { setGraphNotice("已阻止：前置关系不能形成循环"); setTimeout(() => setGraphNotice(""), 2400); return; }
    const next: Dependency = { id: makeId("dependency"), sourceId: source, targetId: target, arrowStyle: "虚线箭头" };
    const all = [...dependencies, next];
    setDependencies(all); setGraphNotice("已创建执行依赖"); setTimeout(() => setGraphNotice(""), 1800);
  }

  const onConnect = (connection: Connection) => {
    if (connection.source && connection.target) tryAddDependency(connection.source, connection.target);
  };

  const toggleExpand = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const updatePlan = (id: string, patch: Partial<Plan>) => {
    setPlans((current) => current.map((plan) => plan.id === id ? { ...plan, ...patch, updatedAt: "刚刚" } : plan));
  };

  function changePlanStatus(id: string, status: Status) {
    setPlans((current) => current.map((plan) => {
      if (plan.id !== id) return plan;
      const completedAt = status === "已完成" && plan.status !== "已完成" ? localDateString() : plan.completedAt;
      return { ...plan, status, completedAt, updatedAt: "刚刚" };
    }));
  }

  function deletePlan(id: string) {
    const plan = plans.find((candidate) => candidate.id === id);
    if (!plan) return;
    const deletingIds = descendantSetOf(id);
    const childCount = deletingIds.size - 1;
    const prompt = childCount > 0
      ? `确定删除“${plan.title}”及其 ${childCount} 个子级计划吗？相关实验记录和连线也会一并删除。`
      : `确定删除“${plan.title}”吗？相关实验记录和连线也会一并删除。`;
    if (!window.confirm(prompt)) return;
    setPlans((current) => current.filter((candidate) => !deletingIds.has(candidate.id)));
    setEntries((current) => current.filter((entry) => !deletingIds.has(entry.planId)));
    setAttachments((current) => current.filter((attachment) => !deletingIds.has(attachment.planId)));
    setDependencies((current) => current.filter((dependency) => !deletingIds.has(dependency.sourceId) && !deletingIds.has(dependency.targetId)));
    setNotebookDocs((current) => Object.fromEntries(Object.entries(current).filter(([planId]) => !deletingIds.has(planId))));
    setGraphExpanded((current) => new Set(Array.from(current).filter((planId) => !deletingIds.has(planId))));
    if (selectedId && deletingIds.has(selectedId)) setSelectedId(null);
    if (notebookEditorId && deletingIds.has(notebookEditorId)) setNotebookEditorId(null);
  }

  const createPlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const id = makeId("plan");
    const parentId = String(data.get("parentId") || "") || null;
    const prerequisiteId = String(data.get("prerequisiteId") || "") || null;
    const plan: Plan = {
      id, parentId, title: String(data.get("title")), domain: data.get("domain") as Domain,
      status: "未开始", summary: String(data.get("summary") || ""), objective: "", success: "", tags: [], updatedAt: "刚刚",
      plannedCompletionDate: String(data.get("plannedCompletionDate") || "") || undefined,
    };
    setPlans((current) => [...current, plan]);
    if (prerequisiteId) setDependencies((current) => [...current, { id: makeId("dependency"), sourceId: prerequisiteId, targetId: id, arrowStyle: "虚线箭头" }]);
    if (parentId) {
      setExpanded((current) => new Set(current).add(parentId));
      setGraphExpanded((current) => new Set(current).add(parentId));
    }
    setSelectedId(id); setShowCreate(false);
    if (createAndFocus && parentId) setGraphFocus(parentId);
    setCreateAndFocus(false); setNewParent(null);
  };

  const createPlanAt = (clientX: number, clientY: number) => {
    const position = graphInstanceRef.current?.screenToFlowPosition({ x: clientX, y: clientY });
    if (!position) return;
    const id = makeId("plan");
    const plan: Plan = { id, parentId: graphFocus, title: "未命名计划", domain: "综合", status: "未开始", summary: "双击创建的新探索方向。", objective: "", success: "", tags: [], updatedAt: "刚刚", graphX: position.x, graphY: position.y };
    setPlans((current) => [...current, plan]);
    if (graphFocus) setGraphExpanded((current) => new Set(current).add(graphFocus));
    setSelectedId(id);
  };

  const openMarkdownEditor = (planId: string) => {
    const plan = plans.find((candidate) => candidate.id === planId);
    if (!plan) return;
    if (!notebookDocs[planId]) updateNotebookDocument(planId, defaultNotebook(plan, entries.filter((entry) => entry.planId === planId)));
    setNotebookEditorId(planId);
    setSelectedId(null);
  };

  const createEntry = async (event: FormEvent<HTMLFormElement>, planId: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStorageMessage("正在保存实验事件…");
    try {
      const response = await fetch("/api/workspace/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId,
          date: String(data.get("date") || localDateString()),
          type: String(data.get("type") || "过程"),
          title: String(data.get("title") || ""),
          content: String(data.get("content") || ""),
        }),
      });
      const result = await response.json() as { entry?: Entry; error?: string };
      if (!response.ok || !result.entry) throw new Error(result.error ?? "实验事件保存失败。");
      setEntries((current) => [...current, result.entry!]);
      form.reset();
      const dateInput = form.elements.namedItem("date") as HTMLInputElement | null;
      if (dateInput) dateInput.value = localDateString();
      setStorageMessage("实验事件已保存到团队服务器");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "实验事件保存失败");
    }
  };

  const deleteEntry = async (entry: Entry) => {
    if (!window.confirm(`确定删除实验事件“${entry.title}”吗？`)) return;
    try {
      const response = await fetch(`/api/workspace/entries/${encodeURIComponent(entry.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: entry.version ?? 0 }),
      });
      const result = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !result.deleted) throw new Error(result.error ?? "实验事件删除失败。");
      setEntries((current) => current.filter((candidate) => candidate.id !== entry.id));
      setStorageMessage("实验事件已删除");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "实验事件删除失败");
    }
  };

  const restoreExample = async () => {
    if (!window.confirm("这会用演示计划、文档和实验事件替换团队服务器中的当前内容，是否继续？")) return;
    try {
      await replaceTeamPlans({ plans: seedPlans, dependencies: seedDependencies });
      await replaceTeamContent({ entries: seedEntries, notebookDocs: {} }, "replace");
      setGraphExpanded(new Set(["p1"]));
      setViewStates({});
      setGraphFocus(null);
      setStorageMessage("演示计划和实验事件已恢复到团队服务器");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "恢复示例失败");
    }
  };

  const uploadAttachment = async (file: File, planId: string): Promise<Attachment> => {
    const form = new FormData();
    form.set("planId", planId);
    form.set("file", file);
    const response = await fetch("/api/workspace/attachments", { method: "POST", body: form });
    const result = await response.json() as { attachment?: Attachment; error?: string };
    if (!response.ok || !result.attachment) throw new Error(result.error ?? "附件上传失败。");
    setAttachments((current) => [...current, result.attachment!]);
    return result.attachment;
  };

  const uploadPlanAttachment = async (event: FormEvent<HTMLFormElement>, planId: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || !file.size) return;
    setStorageMessage("正在上传附件…");
    try {
      await uploadAttachment(file, planId);
      form.reset();
      setStorageMessage("附件已保存到团队服务器");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "附件上传失败");
    }
  };

  const deleteAttachment = async (attachment: Attachment) => {
    if (!window.confirm(`确定删除附件“${attachment.originalName}”吗？Markdown 中已有的引用不会自动移除。`)) return;
    try {
      const response = await fetch(`/api/workspace/attachments/${encodeURIComponent(attachment.id)}`, { method: "DELETE" });
      const result = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !result.deleted) throw new Error(result.error ?? "附件删除失败。");
      setAttachments((current) => current.filter((candidate) => candidate.id !== attachment.id));
      setStorageMessage("附件已删除");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "附件删除失败");
    }
  };

  const insertNotebookImage = async (file?: File) => {
    if (!file || !file.type.startsWith("image/") || !notebookEditorPlan) return;
    setDocumentSaveStatus((current) => ({ ...current, [notebookEditorPlan.id]: "正在上传图片…" }));
    try {
      const attachment = await uploadAttachment(file, notebookEditorPlan.id);
      notebookEditorRef.current?.insertImage(attachment.contentUrl, attachment.originalName || "实验图片");
      setDocumentSaveStatus((current) => ({ ...current, [notebookEditorPlan.id]: "图片已上传，正在保存正文…" }));
    } catch (error) {
      setDocumentSaveStatus((current) => ({ ...current, [notebookEditorPlan.id]: error instanceof Error ? `图片上传错误：${error.message}` : "图片上传错误" }));
    }
  };

  const roots = childrenOf(null);
  const selectedEntries = entries.filter((entry) => entry.planId === selected?.id);
  const selectedAttachments = attachments.filter((attachment) => attachment.planId === selected?.id);
  const notebookEditorPlan = plans.find((plan) => plan.id === notebookEditorId) ?? null;
  const graphFocusTrail = useMemo(() => {
    const trail: Plan[] = [];
    let current = plans.find((plan) => plan.id === graphFocus);
    while (current) { trail.unshift(current); current = plans.find((plan) => plan.id === current?.parentId); }
    return trail;
  }, [plans, graphFocus]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <nav className="topnav" aria-label="项目导航"><button className="active">计划管理</button><button>项目记录</button><button>数据概览</button></nav>
        <div className="top-actions"><span className="viewer-name">{viewer.displayName}</span>{viewer.role === "owner" && <a href="/admin/users">账户管理</a>}<form action="/api/auth/logout" method="post"><button type="submit" className="logout-button">退出</button></form></div>
      </header>

      <aside className="sidebar">
        <section><h2>快速访问</h2><button className={`side-link ${sidebarRoot === "all" ? "active" : ""}`} onClick={() => { setSidebarRoot("all"); setGraphFocus(null); }}><Icon name="folder" /> 所有计划 <span>{plans.length}</span></button></section>
        <section className="sidebar-projects">
          <div className="section-heading"><h2>计划层级</h2><button aria-label="新建顶级计划" onClick={() => { setNewParent(null); setCreateAndFocus(false); setShowCreate(true); }}><Icon name="add" /> 新建</button></div>
          <label className="side-search"><Icon name="search" /><input placeholder="搜索顶级计划" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <div className="root-list">
            {roots.map((root) => <button key={root.id} className={sidebarRoot === root.id ? "active" : ""} onClick={() => { setSidebarRoot(root.id); setGraphFocus(root.id); }}><span className={`root-mark domain-${root.domain}`} /> <span className="root-name">{root.title}</span><span>{childrenOf(root.id).length}</span></button>)}
          </div>
        </section>
        <div className="sidebar-note"><strong>团队服务器</strong><p>计划、正文、事件和附件会保存到服务器；仍建议定期导出与备份。</p></div>
      </aside>

      <section className="workspace">
        <div className="toolbar">
          <label className="search-field"><Icon name="search" /><input aria-label="搜索计划" placeholder="输入名称、描述或标签" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="select-field"><select aria-label="筛选领域" value={domainFilter} onChange={(event) => setDomainFilter(event.target.value as Domain | "全部领域")}><option>全部领域</option>{domains.map((domain) => <option key={domain}>{domain}</option>)}</select><Icon name="chevron" /></label>
          <div className="toolbar-actions"><span className={`storage-status ${storageMessage.includes("失败") || storageMessage.includes("无法") || storageMessage.includes("刷新") || storageMessage.includes("冲突") ? "error" : ""}`}>{storageMessage}</span>{localMigrationData && <button className="secondary-button migration-button" onClick={() => void migrateLocalPlans()}>迁移本机计划</button>}{localContentMigrationData && <button className="secondary-button migration-button" onClick={() => void migrateLocalContent()}>迁移本机文档</button>}<button className="secondary-button" onClick={exportBackup}>导出备份</button><button className="secondary-button" onClick={() => backupInputRef.current?.click()}>导入备份</button><input ref={backupInputRef} className="backup-file-input" type="file" accept="application/json,.json" onChange={(event) => { void importBackup(event.target.files?.[0]); event.target.value = ""; }} /><button className="secondary-button" onClick={() => void restoreExample()}>恢复示例</button><div className="view-switch"><button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>列表</button><button className={viewMode === "graph" ? "active" : ""} onClick={() => setViewMode("graph")}>网络图</button></div><button className="primary-button" onClick={() => { setNewParent(sidebarRoot === "all" ? null : sidebarRoot); setCreateAndFocus(false); setShowCreate(true); }}><Icon name="add" /> 新建计划 <Icon name="chevron" /></button></div>
        </div>

        {viewMode === "list" ? <><div className="table-wrap">
          <table>
            <thead><tr><th className="check-col"><input type="checkbox" aria-label="选择全部" /></th><th>计划名称</th><th>领域</th><th>状态</th><th>标签</th><th>所属父级</th><th>前置计划</th><th>记录</th><th className="action-col">操作</th></tr></thead>
            <tbody>
              {visibleRows.map(({ plan, depth }) => {
                const childCount = childrenOf(plan.id).length;
                const count = entries.filter((entry) => entry.planId === plan.id).length;
                return <tr key={plan.id} className={selectedId === plan.id ? "selected-row" : ""}>
                  <td><input type="checkbox" aria-label={`选择 ${plan.title}`} /></td>
                  <td><div className="plan-cell" style={{ paddingLeft: `${depth * 26}px` }}>
                    {childCount > 0 ? <button className={`tree-toggle ${expanded.has(plan.id) ? "open" : ""}`} onClick={() => toggleExpand(plan.id)} aria-label={expanded.has(plan.id) ? "折叠" : "展开"}>›</button> : <span className="tree-spacer" />}
                    <span className={`plan-icon domain-${plan.domain}`}><Icon name="branch" /></span>
                    <button className="plan-title" onClick={() => setSelectedId(plan.id)}>{plan.title}</button>
                    {childCount > 0 && <span className="child-count">{childCount} 个子计划</span>}
                  </div><p className="row-summary" style={{ marginLeft: `${depth * 26 + 58}px` }}>{plan.summary}</p></td>
                  <td><span className={`domain-pill domain-${plan.domain}`}>{plan.domain}</span></td>
                  <td><span className={`status status-${plan.status}`}>{plan.status}</span></td>
                  <td><div className="tag-list">{plan.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}{plan.tags.length === 0 && <button>＋</button>}</div></td>
                  <td className="parent-cell">{plans.find((p) => p.id === plan.parentId)?.title ?? "—"}</td>
                  <td className="prerequisite-cell">{dependencies.filter((item) => item.targetId === plan.id).map((item) => plans.find((candidate) => candidate.id === item.sourceId)?.title).filter(Boolean).join("、") || "—"}</td>
                  <td><button className="record-link" onClick={() => openMarkdownEditor(plan.id)}><Icon name="book" /> {count}</button></td>
                  <td><button className="more-button" aria-label="更多操作"><Icon name="more" /></button></td>
                </tr>;
              })}
            </tbody>
          </table>
          {visibleRows.length === 0 && <div className="empty-state"><span>⌕</span><h3>没有找到匹配的计划</h3><p>尝试清除搜索词或领域筛选。</p></div>}
        </div>
        <footer className="table-footer"><span>自动保存于当前浏览器 · 可导出 JSON 备份</span><span>第 1–{visibleRows.length} 条 / 共 {visibleRows.length} 条 <b>1</b> 20 条/页</span></footer></> :
        <section className="graph-workspace" aria-label="实验计划网络图">
          <div className="graph-guide">
            <div className="graph-breadcrumb">{graphFocus && <button className="minimize-view" title="缩小并返回父级画布" aria-label="缩小并返回父级画布" onClick={() => setGraphFocus(plans.find((plan) => plan.id === graphFocus)?.parentId ?? null)}>⤡</button>}<strong>{graphFocusTrail.length ? graphFocusTrail.map((plan) => plan.title).join(" / ") : "顶级计划网络"}</strong></div>
          </div>
          <div className="graph-canvas" data-plan-canvas ref={graphCanvasRef} onDoubleClickCapture={(event) => { const target = event.target as HTMLElement; if (target.classList.contains("react-flow__pane")) createPlanAt(event.clientX, event.clientY); }}>
            <ReactFlow
              key={graphFocus ?? "__root__"}
              nodes={graphNodes}
              edges={graphEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onGraphNodesChange}
              onNodeClick={(_, node) => { setSelectedDependencyId(null); setEdgeStyleMenuOpen(false); setSelectedId(node.id); }}
              onNodeDoubleClick={(_, node) => openMarkdownEditor(node.id)}
              onEdgeClick={(event, edge) => { event.stopPropagation(); selectDependencyAt(edge.id, event); }}
              onPaneClick={() => { setSelectedDependencyId(null); setEdgeStyleMenuOpen(false); }}
              onNodeDragStop={(event, node) => {
                movePlan(node.id, node.position);
                const center = { x: node.position.x + (node.measured?.width ?? 330) / 2, y: node.position.y + (node.measured?.height ?? 174) / 2 };
                const target = graphNodes.find((candidate) => candidate.id !== node.id && candidate.data.expanded && center.x >= candidate.position.x && center.x <= candidate.position.x + (candidate.measured?.width ?? 330) && center.y >= candidate.position.y && center.y <= candidate.position.y + (candidate.measured?.height ?? 174));
                if (target) reparentPlan(node.id, target.id);
                else if (graphFocus) {
                  const bounds = graphCanvasRef.current?.getBoundingClientRect();
                  const pointer = "clientX" in event ? event : event.changedTouches[0];
                  if (bounds && pointer && (pointer.clientX < bounds.left || pointer.clientX > bounds.right || pointer.clientY < bounds.top || pointer.clientY > bounds.bottom)) reparentPlan(node.id, plans.find((plan) => plan.id === graphFocus)?.parentId ?? null);
                }
              }}
              onConnect={onConnect}
              onInit={(instance) => { graphInstanceRef.current = instance; }}
              onEdgesDelete={(deleted) => { setDependencies((current) => current.filter((item) => !deleted.some((edge) => edge.id === item.id))); if (deleted.some((edge) => edge.id === selectedDependencyId)) setSelectedDependencyId(null); }}
              deleteKeyCode={["Backspace", "Delete"]}
              onMoveEnd={(event, viewport) => { if (event) saveViewport(graphFocus ?? "__root__", viewport); }}
              defaultViewport={viewStates[graphFocus ?? "__root__"]}
              fitView={!viewStates[graphFocus ?? "__root__"]}
              fitViewOptions={{ padding: 0.18, maxZoom: 1.05 }}
              minZoom={0.1}
              maxZoom={8}
              snapToGrid
              snapGrid={[20, 20]}
              panOnScroll={false}
              zoomOnScroll
              proOptions={{ hideAttribution: true }}
            >
              <Background id="minor-grid" variant={BackgroundVariant.Dots} gap={20} size={1} color="#dbe2ea" />
              <Background id="major-grid" variant={BackgroundVariant.Dots} gap={100} size={2} color="#b9c6d5" />
              <MiniMap pannable zoomable nodeColor={(node) => ({ 机器学习: "#4486dd", 湿实验: "#e89143", 软件: "#7766c7", 硬件: "#c85a65", 综合: "#2ba660" }[(node.data as PlanNodeData).plan.domain])} maskColor="rgba(246,248,251,.72)" />
              <Controls showInteractive={false} />
            </ReactFlow>
            {selectedDependency && <aside className="edge-editor nodrag" aria-label="连线设置" style={{ left: edgeMenuPosition.x, top: edgeMenuPosition.y }}>
              <div className="edge-editor-head"><strong>{plans.find((plan) => plan.id === selectedDependency.sourceId)?.title} → {plans.find((plan) => plan.id === selectedDependency.targetId)?.title}</strong><button aria-label="关闭连线设置" onClick={() => { setSelectedDependencyId(null); setEdgeStyleMenuOpen(false); }}>×</button></div>
              <label>文本描述<input value={selectedDependency.label ?? ""} placeholder="默认不显示文本" onChange={(event) => setDependencies((current) => current.map((item) => item.id === selectedDependency.id ? { ...item, label: event.target.value } : item))} /></label>
              <div className="arrow-style-field"><span>箭头样式</span><button className="arrow-style-trigger" aria-label="选择箭头样式" aria-expanded={edgeStyleMenuOpen} onClick={() => setEdgeStyleMenuOpen((open) => !open)}><ArrowPreset style={selectedDependency.arrowStyle ?? "虚线箭头"} /><span className="arrow-menu-chevron">⌄</span></button>
                {edgeStyleMenuOpen && <div className="arrow-style-menu" role="listbox" aria-label="箭头样式预设">{arrowStyles.map((style) => <button key={style} type="button" role="option" aria-label={style} aria-selected={(selectedDependency.arrowStyle ?? "虚线箭头") === style} title={style} onClick={() => { setDependencies((current) => current.map((item) => item.id === selectedDependency.id ? { ...item, arrowStyle: style } : item)); setEdgeStyleMenuOpen(false); }}><ArrowPreset style={style} /></button>)}</div>}
              </div>
              <button className="delete-edge" onClick={() => { setDependencies((current) => current.filter((item) => item.id !== selectedDependency.id)); setSelectedDependencyId(null); }}>删除连线</button>
            </aside>}
            {graphNotice && <div className="graph-notice">{graphNotice}</div>}
            {hierarchyDrag && <div className="hierarchy-drag-ghost" style={{ left: hierarchyDrag.x + 12, top: hierarchyDrag.y + 12 }}>⠿ {plans.find((plan) => plan.id === hierarchyDrag.id)?.title}</div>}
          </div>
          <footer className="graph-footer"><span>{graphNodes.length} 个节点 · {dependencies.filter((item) => graphNodes.some((node) => node.id === item.sourceId) && graphNodes.some((node) => node.id === item.targetId)).length} 条执行依赖</span><span>单击连线可编辑</span></footer>
        </section>}
      </section>

      {selected && <aside className="drawer" aria-label="计划详情">
        <div className="drawer-head"><div><p>{selected.domain} · {selected.status}</p><h2>{selected.title}</h2></div><button className="icon-button" aria-label="关闭详情" onClick={() => setSelectedId(null)}><Icon name="close" /></button></div>
        <div className="drawer-tabs"><button className={drawerTab === "overview" ? "active" : ""} onClick={() => setDrawerTab("overview")}>计划概览</button><button className={drawerTab === "entries" ? "active" : ""} onClick={() => setDrawerTab("entries")}>事件 <span>{selectedEntries.length}</span></button><button className={drawerTab === "attachments" ? "active" : ""} onClick={() => setDrawerTab("attachments")}>附件 <span>{selectedAttachments.length}</span></button><button onClick={() => openMarkdownEditor(selected.id)}>正文</button></div>
        {drawerTab === "overview" && <div className="drawer-body overview-form">
          <label>计划名称<input value={selected.title} onChange={(e) => updatePlan(selected.id, { title: e.target.value })} /></label>
          <div className="form-grid"><label>领域<select value={selected.domain} onChange={(e) => updatePlan(selected.id, { domain: e.target.value as Domain })}>{domains.map((d) => <option key={d}>{d}</option>)}</select></label><label>状态<select value={selected.status} onChange={(e) => changePlanStatus(selected.id, e.target.value as Status)}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></label></div>
          <div className="form-grid"><label>计划完成日期<input type="date" value={selected.plannedCompletionDate ?? ""} onChange={(e) => updatePlan(selected.id, { plannedCompletionDate: e.target.value || undefined })} /></label><label>实际完成日期<input type="date" value={selected.completedAt ?? ""} readOnly title="切换为已完成时自动记录" /></label></div>
          <label>所属父级计划 <small>表示该计划是父计划中的细分内容</small><select value={selected.parentId ?? ""} onChange={(e) => reparentPlan(selected.id, e.target.value || null)}><option value="">无（顶级计划）</option>{plans.filter((p) => !descendantSetOf(selected.id).has(p.id)).map((p) => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label>
          <div className="prerequisite-editor"><div className="field-title">前置计划 <small>表示必须先完成或开展的计划</small></div><div className="prerequisite-pills">{dependencies.filter((item) => item.targetId === selected.id).map((item) => { const source = plans.find((plan) => plan.id === item.sourceId); return source ? <button key={item.id} onClick={() => setDependencies((current) => current.filter((candidate) => candidate.id !== item.id))}>{source.title} <b>×</b></button> : null; })}{dependencies.every((item) => item.targetId !== selected.id) && <span>暂无前置计划</span>}</div><select value="" onChange={(event) => { if (event.target.value) tryAddDependency(event.target.value, selected.id); }}><option value="">＋ 添加前置计划</option>{plans.filter((plan) => plan.id !== selected.id && !dependencies.some((item) => item.sourceId === plan.id && item.targetId === selected.id)).map((plan) => <option value={plan.id} key={plan.id}>{plan.title}</option>)}</select></div>
          <label>简要描述<textarea rows={3} value={selected.summary} onChange={(e) => updatePlan(selected.id, { summary: e.target.value })} /></label>
          <label>探索目标<textarea rows={4} value={selected.objective} onChange={(e) => updatePlan(selected.id, { objective: e.target.value })} /></label>
          <label>成功标准<textarea rows={4} value={selected.success} onChange={(e) => updatePlan(selected.id, { success: e.target.value })} /></label>
          <div className="subplans"><div className="subplans-head"><h3>子级计划</h3><button onClick={() => { setNewParent(selected.id); setCreateAndFocus(false); setShowCreate(true); }}><Icon name="add" /> 添加</button></div>{childrenOf(selected.id).map((child) => <button key={child.id} onClick={() => setSelectedId(child.id)}><span className={`root-mark domain-${child.domain}`} /> <span>{child.title}</span><small>{child.status}</small></button>)}{childrenOf(selected.id).length === 0 && <p>尚未拆分子级计划。</p>}</div>
        </div>}
        {drawerTab === "entries" && <div className="drawer-body">
          <form className="new-entry" onSubmit={(event) => void createEntry(event, selected.id)}>
            <div><input name="date" type="date" defaultValue={localDateString()} required /><select name="type" defaultValue="过程">{entryTypes.map((type) => <option key={type}>{type}</option>)}</select></div>
            <input name="title" placeholder="事件标题" required maxLength={300} />
            <textarea name="content" rows={4} placeholder="记录关键过程、结果或决策" maxLength={100000} />
            <button className="primary-button" type="submit">保存事件</button>
          </form>
          <div className="timeline">{selectedEntries.slice().sort((a, b) => b.date.localeCompare(a.date)).map((entry) => <article key={entry.id}><i className="timeline-dot" /><div className="entry-meta"><time>{entry.date}</time><span>{entry.type}</span><button className="entry-delete" onClick={() => void deleteEntry(entry)}>删除</button></div><h3>{entry.title}</h3><p>{entry.content}</p></article>)}{selectedEntries.length === 0 && <div className="notebook-empty"><span>◇</span><p>尚未记录关键事件。</p></div>}</div>
        </div>}
        {drawerTab === "attachments" && <div className="drawer-body">
          <form className="attachment-upload" onSubmit={(event) => void uploadPlanAttachment(event, selected.id)}>
            <label>上传附件<input name="file" type="file" required /></label>
            <small>单个文件不超过 20 MB；团队总容量 1 GB。文件会保存到服务器持久化卷。</small>
            <button className="primary-button" type="submit">上传到服务器</button>
          </form>
          <div className="attachment-list">{selectedAttachments.map((attachment) => <article key={attachment.id}>
            {attachment.mimeType.startsWith("image/") ? <img src={attachment.contentUrl} alt="" /> : <span className="attachment-file-icon">▤</span>}
            <div><a href={attachment.contentUrl} target="_blank" rel="noreferrer">{attachment.originalName}</a><small>{formatAttachmentSize(attachment.sizeBytes)} · SHA-256 {attachment.sha256.slice(0, 12)}…</small></div>
            <button onClick={() => void deleteAttachment(attachment)}>删除</button>
          </article>)}{selectedAttachments.length === 0 && <div className="notebook-empty"><span>▤</span><p>尚未上传附件。</p></div>}</div>
        </div>}
      </aside>}

      {notebookEditorPlan && <section className="markdown-editor-page" aria-label={`${notebookEditorPlan.title} 实验记录编辑器`}>
        <header className="markdown-editor-head"><div><button className="editor-back" onClick={() => { setNotebookEditorId(null); setSelectedId(notebookEditorPlan.id); }}>← 返回计划</button><div><span>实验记录 · Markdown</span><h1>{notebookEditorPlan.title}</h1></div></div><p className={(documentSaveStatus[notebookEditorPlan.id] ?? "").includes("冲突") || (documentSaveStatus[notebookEditorPlan.id] ?? "").includes("错误") ? "error" : ""}><i /> {documentSaveStatus[notebookEditorPlan.id] ?? "已连接团队服务器"}</p></header>
        <div className="markdown-toolbar" role="toolbar" aria-label="Markdown 格式工具"><button title="一级标题" onClick={() => notebookEditorRef.current?.formatBlock("h1")}>H1</button><button title="二级标题" onClick={() => notebookEditorRef.current?.formatBlock("h2")}>H2</button><button title="加粗" onClick={() => notebookEditorRef.current?.wrapSelection("**", "**")}>B</button><button title="斜体" onClick={() => notebookEditorRef.current?.wrapSelection("*", "*")}><em>I</em></button><button title="无序列表" onClick={() => notebookEditorRef.current?.formatBlock("bullet")}>• 列表</button><button title="有序列表" onClick={() => notebookEditorRef.current?.formatBlock("ordered")}>1. 序列</button><button title="任务清单" onClick={() => notebookEditorRef.current?.formatBlock("task")}>☐ 任务</button><button title="引用" onClick={() => notebookEditorRef.current?.formatBlock("quote")}>❯ 引用</button><button title="行内代码" onClick={() => notebookEditorRef.current?.wrapSelection("`", "`")}>&lt;/&gt;</button><button title="代码块" onClick={() => notebookEditorRef.current?.formatBlock("code")}>代码块</button><button title="链接" onClick={() => notebookEditorRef.current?.wrapSelection("[", "](https://)", "链接文字")}>链接</button><button title="插入图片" onClick={() => notebookImageInputRef.current?.click()}>▧ 图片</button><input ref={notebookImageInputRef} className="image-file-input" type="file" accept="image/*" onChange={(event) => { insertNotebookImage(event.target.files?.[0]); event.target.value = ""; }} /><button title="分隔线" onClick={() => notebookEditorRef.current?.insertDivider()}>—</button><span className="toolbar-hint">可直接粘贴剪贴板图片</span></div>
        <main className="markdown-editor-main"><MarkdownBlockEditor key={notebookEditorPlan.id} ref={notebookEditorRef} source={notebookDocs[notebookEditorPlan.id] ?? defaultNotebook(notebookEditorPlan, entries.filter((entry) => entry.planId === notebookEditorPlan.id))} onChange={(value) => updateNotebookDocument(notebookEditorPlan.id, value)} onImageFile={async (file) => {
          setDocumentSaveStatus((current) => ({ ...current, [notebookEditorPlan.id]: "正在上传粘贴的图片…" }));
          try {
            const attachment = await uploadAttachment(file, notebookEditorPlan.id);
            setDocumentSaveStatus((current) => ({ ...current, [notebookEditorPlan.id]: "图片已上传，正在保存正文…" }));
            return { src: attachment.contentUrl, alt: attachment.originalName };
          } catch (error) {
            setDocumentSaveStatus((current) => ({ ...current, [notebookEditorPlan.id]: error instanceof Error ? `图片上传错误：${error.message}` : "图片上传错误" }));
            throw error;
          }
        }} /></main>
      </section>}

      {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowCreate(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title" onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><div><p>NEW EXPLORATION</p><h2 id="create-title">新建探索计划</h2></div><button className="icon-button" aria-label="关闭" onClick={() => setShowCreate(false)}><Icon name="close" /></button></div><form onSubmit={createPlan}><label>计划名称<input name="title" required autoFocus placeholder="例如：候选蛋白复测" /></label><label>所属父级计划 <small>作为该计划的细分子级</small><select name="parentId" defaultValue={newParent ?? ""}><option value="">无（顶级计划）</option>{plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.title}</option>)}</select></label><label>前置计划 <small>需要先开展的计划，可稍后添加多个</small><select name="prerequisiteId" defaultValue=""><option value="">无</option>{plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.title}</option>)}</select></label><div className="form-grid"><label>领域<select name="domain" defaultValue="综合">{domains.map((domain) => <option key={domain}>{domain}</option>)}</select></label><label>计划完成日期<input name="plannedCompletionDate" type="date" /></label></div><label>简要描述<textarea name="summary" rows={3} placeholder="说明这个方向需要探索什么" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>取消</button><button type="submit" className="primary-button">创建计划</button></div></form></section></div>}
    </main>
  );
}
