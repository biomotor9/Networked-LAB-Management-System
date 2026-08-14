import { entryTypes, type Entry } from "./model";

export const MAX_DOCUMENT_LENGTH = 5_000_000;
export const MAX_ENTRY_CONTENT_LENGTH = 100_000;

export function validateDocumentContent(value: unknown): string {
  if (typeof value !== "string") throw new Error("Markdown 正文格式无效。");
  if (value.length > MAX_DOCUMENT_LENGTH) throw new Error("Markdown 正文超过 5 MB 限制；图片请等待附件功能上线后上传。");
  return value;
}

export function validateEntry(value: unknown, allowedPlanIds?: Set<string>): Entry {
  if (!value || typeof value !== "object") throw new Error("实验事件格式无效。");
  const candidate = value as Partial<Entry>;
  if (typeof candidate.id !== "string" || !candidate.id || candidate.id.length > 200) throw new Error("实验事件 ID 无效。");
  if (typeof candidate.planId !== "string" || !candidate.planId || (allowedPlanIds && !allowedPlanIds.has(candidate.planId))) throw new Error("实验事件引用了不存在的计划。");
  if (typeof candidate.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)) throw new Error("实验事件日期无效。");
  if (!entryTypes.includes(candidate.type!)) throw new Error("实验事件类型无效。");
  if (typeof candidate.title !== "string" || !candidate.title.trim() || candidate.title.length > 300) throw new Error("实验事件标题无效。");
  if (typeof candidate.content !== "string" || candidate.content.length > MAX_ENTRY_CONTENT_LENGTH) throw new Error("实验事件内容无效或超过 100 KB 限制。");
  return {
    id: candidate.id,
    planId: candidate.planId,
    date: candidate.date,
    type: candidate.type!,
    title: candidate.title.trim(),
    content: candidate.content,
    version: Number.isInteger(candidate.version) && Number(candidate.version) >= 0 ? Number(candidate.version) : 0,
  };
}

export function validateWorkspaceContent(
  value: unknown,
  allowedPlanIds: Set<string>,
): { documents: Record<string, string>; entries: Entry[] } {
  if (!value || typeof value !== "object") throw new Error("工作区内容格式无效。");
  const root = value as { documents?: unknown; entries?: unknown };
  if (!root.documents || typeof root.documents !== "object" || Array.isArray(root.documents)) throw new Error("Markdown 文档集合无效。");
  if (!Array.isArray(root.entries) || root.entries.length > 50_000) throw new Error("实验事件集合无效或超过容量限制。");

  const documents: Record<string, string> = {};
  for (const [planId, content] of Object.entries(root.documents)) {
    if (!allowedPlanIds.has(planId)) throw new Error("Markdown 文档引用了不存在的计划。");
    documents[planId] = validateDocumentContent(content);
  }

  const ids = new Set<string>();
  const entries = root.entries.map((entry) => {
    const parsed = validateEntry(entry, allowedPlanIds);
    if (ids.has(parsed.id)) throw new Error("实验事件 ID 重复。");
    ids.add(parsed.id);
    return parsed;
  });
  return { documents, entries };
}
