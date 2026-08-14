import assert from "node:assert/strict";
import test from "node:test";
import { hasDependencyPath, wouldCreateDependencyCycle } from "../app/features/dependencies/dependency-graph";
import { parseMarkdownBlocks, serializeMarkdownBlocks } from "../app/features/notebook/markdown-codec";
import { canReparentPlan, collectDescendantIds } from "../app/features/plans/plan-tree";
import type { Dependency, Plan } from "../app/features/workspace/model";

function plan(id: string, parentId: string | null): Plan {
  return {
    id,
    parentId,
    title: id,
    domain: "综合",
    status: "未开始",
    summary: "",
    objective: "",
    success: "",
    tags: [],
    updatedAt: "刚刚",
  };
}

test("collects a complete plan subtree and rejects hierarchy cycles", () => {
  const plans = [plan("root", null), plan("child", "root"), plan("leaf", "child"), plan("other", null)];
  assert.deepEqual([...collectDescendantIds(plans, "root")].sort(), ["child", "leaf", "root"]);
  assert.equal(canReparentPlan(plans, "root", "leaf"), false);
  assert.equal(canReparentPlan(plans, "leaf", "other"), true);
  assert.equal(canReparentPlan(plans, "leaf", "child"), false);
});

test("detects dependency paths and prevents a new directed cycle", () => {
  const dependencies: Dependency[] = [
    { id: "d1", sourceId: "a", targetId: "b" },
    { id: "d2", sourceId: "b", targetId: "c" },
  ];
  assert.equal(hasDependencyPath(dependencies, "a", "c"), true);
  assert.equal(hasDependencyPath(dependencies, "c", "a"), false);
  assert.equal(wouldCreateDependencyCycle(dependencies, "c", "a"), true);
  assert.equal(wouldCreateDependencyCycle(dependencies, "a", "c"), false);
  assert.equal(wouldCreateDependencyCycle(dependencies, "a", "a"), true);
});

test("round-trips supported Markdown block types", () => {
  const markdown = [
    "# 实验标题",
    "> 背景说明",
    "- [x] 完成准备",
    "1. 第一步",
    "2. 第二步",
    "```",
    "const value = 1;",
    "```",
    "![结果图](data:image/png;base64,abc)",
  ].join("\n");
  const blocks = parseMarkdownBlocks(markdown);
  assert.deepEqual(blocks.map((block) => block.type), ["h1", "quote", "task", "ordered", "ordered", "code", "image"]);
  assert.equal(serializeMarkdownBlocks(blocks), markdown);
});

