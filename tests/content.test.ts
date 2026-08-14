import assert from "node:assert/strict";
import test from "node:test";
import { formatAttachmentSize, normalizeAttachmentName, validateAttachmentSize } from "../app/features/attachments/validation";
import { validateDocumentContent, validateEntry, validateWorkspaceContent } from "../app/features/workspace/content";

test("validates Markdown documents and experiment entries", () => {
  assert.equal(validateDocumentContent("# 实验记录"), "# 实验记录");
  const entry = validateEntry({ id: "e1", planId: "p1", date: "2026-08-14", type: "结果", title: "完成", content: "阳性" }, new Set(["p1"]));
  assert.equal(entry.version, 0);
  assert.equal(entry.title, "完成");
});

test("validates attachment limits and safe display names", () => {
  assert.equal(normalizeAttachmentName("../结果\\图.png"), ".._结果_图.png");
  assert.equal(formatAttachmentSize(1024 * 1024), "1.0 MB");
  assert.doesNotThrow(() => validateAttachmentSize(20 * 1024 * 1024));
  assert.throws(() => validateAttachmentSize(20 * 1024 * 1024 + 1), /20 MB/);
  assert.throws(() => validateAttachmentSize(0), /不能为空/);
});

test("rejects invalid content references and duplicate entries", () => {
  assert.throws(() => validateEntry({ id: "e1", planId: "missing", date: "2026-08-14", type: "结果", title: "完成", content: "" }, new Set(["p1"])), /不存在/);
  assert.throws(() => validateWorkspaceContent({ documents: { missing: "# 文档" }, entries: [] }, new Set(["p1"])), /不存在/);
  assert.throws(() => validateWorkspaceContent({ documents: {}, entries: [
    { id: "e1", planId: "p1", date: "2026-08-14", type: "结果", title: "一", content: "" },
    { id: "e1", planId: "p1", date: "2026-08-14", type: "结果", title: "二", content: "" },
  ] }, new Set(["p1"])), /重复/);
});
