import { makeId, type Entry, type Plan } from "../workspace/model";

export type MarkdownBlockType = "paragraph" | "h1" | "h2" | "h3" | "bullet" | "ordered" | "task" | "quote" | "code" | "divider" | "image";
export type MarkdownBlock = { id: string; type: MarkdownBlockType; text: string; checked?: boolean; src?: string };

export function defaultNotebook(plan: Plan, planEntries: Entry[]): string {
  const history = planEntries.length
    ? planEntries.map((entry) => `## ${entry.title}\n\n**${entry.type} · ${entry.date}**\n\n${entry.content}`).join("\n\n---\n\n")
    : "## 实验记录\n\n从这里记录实验设计、过程、结果与分析。";
  return `# ${plan.title}\n\n> ${plan.summary || "填写本计划的背景与范围。"}\n\n## 探索目标\n\n${plan.objective || "- [ ] 填写本次实验需要验证的问题"}\n\n## 成功标准\n\n${plan.success || "- [ ] 填写可判断实验是否成功的标准"}\n\n---\n\n${history}`;
}

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: MarkdownBlock[] = [];
  let inCode = false;
  let code: string[] = [];
  lines.forEach((line) => {
    if (line.startsWith("```")) {
      if (inCode) { blocks.push({ id: makeId("md"), type: "code", text: code.join("\n") }); code = []; }
      inCode = !inCode;
      return;
    }
    if (inCode) { code.push(line); return; }
    const image = line.match(/^!\[([^\]]*)\]\((.+)\)$/);
    if (image) blocks.push({ id: makeId("md"), type: "image", text: image[1], src: image[2] });
    else if (line === "---") blocks.push({ id: makeId("md"), type: "divider", text: "" });
    else if (line.startsWith("### ")) blocks.push({ id: makeId("md"), type: "h3", text: line.slice(4) });
    else if (line.startsWith("## ")) blocks.push({ id: makeId("md"), type: "h2", text: line.slice(3) });
    else if (line.startsWith("# ")) blocks.push({ id: makeId("md"), type: "h1", text: line.slice(2) });
    else if (/^- \[[ xX]\] /.test(line)) blocks.push({ id: makeId("md"), type: "task", checked: !line.startsWith("- [ ]"), text: line.slice(6) });
    else if (/^[-*] /.test(line)) blocks.push({ id: makeId("md"), type: "bullet", text: line.slice(2) });
    else if (/^\d+\. /.test(line)) blocks.push({ id: makeId("md"), type: "ordered", text: line.replace(/^\d+\. /, "") });
    else if (line.startsWith("> ")) blocks.push({ id: makeId("md"), type: "quote", text: line.slice(2) });
    else blocks.push({ id: makeId("md"), type: "paragraph", text: line });
  });
  if (code.length) blocks.push({ id: makeId("md"), type: "code", text: code.join("\n") });
  return blocks.length ? blocks : [{ id: makeId("md"), type: "paragraph", text: "" }];
}

export function serializeMarkdownBlocks(blocks: readonly MarkdownBlock[]): string {
  let ordered = 0;
  return blocks.map((block) => {
    if (block.type !== "ordered") ordered = 0;
    if (block.type === "h1") return `# ${block.text}`;
    if (block.type === "h2") return `## ${block.text}`;
    if (block.type === "h3") return `### ${block.text}`;
    if (block.type === "bullet") return `- ${block.text}`;
    if (block.type === "ordered") { ordered += 1; return `${ordered}. ${block.text}`; }
    if (block.type === "task") return `- [${block.checked ? "x" : " "}] ${block.text}`;
    if (block.type === "quote") return `> ${block.text}`;
    if (block.type === "code") return `\`\`\`\n${block.text}\n\`\`\``;
    if (block.type === "divider") return "---";
    if (block.type === "image") return `![${block.text || "实验图片"}](${block.src ?? ""})`;
    return block.text;
  }).join("\n");
}

