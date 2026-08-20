import assert from "node:assert/strict";
import test from "node:test";
import { hasDependencyPath, wouldCreateDependencyCycle } from "../app/features/dependencies/dependency-graph";
import { parseMarkdownBlocks, serializeMarkdownBlocks } from "../app/features/notebook/markdown-codec";
import { buildVisiblePlanTree, canReparentPlan, collectDescendantIds } from "../app/features/plans/plan-tree";
import { resolveCanvasViewport } from "../app/features/workspace/canvas-state";
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

test("scopes saved canvas viewports to the hydrated project", () => {
  const projectAView = { __root__: { x: 120, y: -80, zoom: 1.5 } };
  const switchingToProjectB = resolveCanvasViewport({
    projectId: "project-b",
    hydratedProjectId: "project-a",
    focusId: null,
    viewStates: projectAView,
  });

  assert.equal(switchingToProjectB.viewport, undefined);
  assert.equal(switchingToProjectB.fitView, true);

  const projectBView = { __root__: { x: -20, y: 45, zoom: 0.8 } };
  const hydratedProjectB = resolveCanvasViewport({
    projectId: "project-b",
    hydratedProjectId: "project-b",
    focusId: null,
    viewStates: projectBView,
  });

  assert.deepEqual(hydratedProjectB.viewport, projectBView.__root__);
  assert.notEqual(hydratedProjectB.key, switchingToProjectB.key);
});

test("collects a complete plan subtree and rejects hierarchy cycles", () => {
  const plans = [plan("root", null), plan("child", "root"), plan("leaf", "child"), plan("other", null)];
  assert.deepEqual([...collectDescendantIds(plans, "root")].sort(), ["child", "leaf", "root"]);
  assert.equal(canReparentPlan(plans, "root", "leaf"), false);
  assert.equal(canReparentPlan(plans, "leaf", "other"), true);
  assert.equal(canReparentPlan(plans, "leaf", "child"), false);
});

test("builds an expandable plan tree and reveals matching descendants with their ancestors", () => {
  const root = plan("root", null);
  const child = { ...plan("child", "root"), title: "蛋白筛选" };
  const leaf = { ...plan("leaf", "child"), title: "复测验证" };
  const other = plan("other", null);
  const plans = [root, child, leaf, other];

  assert.deepEqual(buildVisiblePlanTree(plans, new Set()).map(({ plan: item, depth }) => [item.id, depth]), [["root", 0], ["other", 0]]);
  assert.deepEqual(buildVisiblePlanTree(plans, new Set(["root", "child"])).map(({ plan: item, depth }) => [item.id, depth]), [["root", 0], ["child", 1], ["leaf", 2], ["other", 0]]);
  assert.deepEqual(buildVisiblePlanTree(plans, new Set(), "复测").map(({ plan: item, depth }) => [item.id, depth]), [["root", 0], ["child", 1], ["leaf", 2]]);
});

test("sorts sibling plans by operational status without changing their hierarchy", () => {
  const plans = [
    { ...plan("root-done", null), status: "已完成" as const },
    { ...plan("root-urgent", null), status: "紧急" as const },
    { ...plan("child-waiting", "root-urgent"), status: "等待" as const },
    { ...plan("child-active", "root-urgent"), status: "进行中" as const },
    { ...plan("child-active-second", "root-urgent"), status: "进行中" as const },
  ];

  assert.deepEqual(
    buildVisiblePlanTree(plans, new Set(["root-urgent"])).map(({ plan: item, depth }) => [item.id, depth]),
    [["root-urgent", 0], ["child-active", 1], ["child-active-second", 1], ["child-waiting", 1], ["root-done", 0]],
  );
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

test("keeps a new Markdown document blank", () => {
  const blocks = parseMarkdownBlocks("");
  assert.deepEqual(blocks.map(({ type, text }) => ({ type, text })), [{ type: "paragraph", text: "" }]);
  assert.equal(serializeMarkdownBlocks(blocks), "");
});
