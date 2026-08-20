import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBoardItems,
  filterBoardItems,
  sortBoardItems,
  validatePlanStatusPatch,
  type BoardFilters,
  type BoardPlanSource,
  type BoardProject,
} from "../app/features/dashboard/model";

const projects: BoardProject[] = [
  { id: "active", name: "活跃项目", status: "进行中", version: 3, role: "member" },
  { id: "planning", name: "筹备项目", status: "筹备中", version: 1, role: "viewer" },
  { id: "done", name: "完成项目", status: "已完成", version: 2, role: "lead" },
];

const plan = (id: string, projectId: string, patch: Partial<BoardPlanSource> = {}): BoardPlanSource => ({
  id,
  projectId,
  parentId: null,
  title: id,
  domain: "综合",
  status: "进行中",
  summary: "",
  tags: [],
  updatedAt: "2026-08-18T10:00:00.000Z",
  version: 1,
  ...patch,
});

test("builds personal board cards with hierarchy, blockers and permissions", () => {
  const plans = [
    plan("root", "active", { status: "未开始", title: "一级实验" }),
    plan("source", "active", { status: "进行中" }),
    plan("urgent", "active", { parentId: "root", status: "紧急", title: "紧急验证" }),
    plan("watch", "planning", { status: "持续关注" }),
    plan("finished", "active", { status: "已完成" }),
    plan("hidden", "done", { status: "紧急" }),
  ];
  const items = buildBoardItems({ projects, plans, dependencies: [{ projectId: "active", sourceId: "source", targetId: "urgent" }] });
  assert.deepEqual(items.map((item) => item.id), ["source", "urgent", "watch"]);
  assert.deepEqual(items.find((item) => item.id === "urgent")?.path, ["一级实验"]);
  assert.equal(items.find((item) => item.id === "urgent")?.blockingCount, 1);
  assert.equal(items.find((item) => item.id === "urgent")?.canEdit, true);
  assert.equal(items.find((item) => item.id === "watch")?.canEdit, false);
});

test("filters board cards by project scope, metadata, search and due date", () => {
  const items = buildBoardItems({ projects, plans: [
    plan("active-card", "active", { title: "蛋白复测", tags: ["蛋白"], plannedCompletionDate: "2026-08-19" }),
    plan("planning-card", "planning", { domain: "湿实验", status: "等待", plannedCompletionDate: "2026-08-25" }),
  ], dependencies: [] });
  const base: BoardFilters = { query: "", projectId: "", projectScope: "active", domain: "全部", tag: "", due: "全部" };
  assert.deepEqual(filterBoardItems(items, base, new Date("2026-08-20T12:00:00Z")).map((item) => item.id), ["active-card"]);
  assert.deepEqual(filterBoardItems(items, { ...base, projectScope: "all", domain: "湿实验", due: "七天内" }, new Date("2026-08-20T12:00:00Z")).map((item) => item.id), ["planning-card"]);
  assert.deepEqual(filterBoardItems(items, { ...base, query: "蛋白", due: "已逾期" }, new Date("2026-08-20T12:00:00Z")).map((item) => item.id), ["active-card"]);
});

test("sorts dated work first and surfaces stale monitoring cards", () => {
  const items = buildBoardItems({ projects, plans: [
    plan("later", "active", { plannedCompletionDate: "2026-09-10", updatedAt: "2026-08-19T00:00:00.000Z" }),
    plan("earlier", "active", { plannedCompletionDate: "2026-08-22", updatedAt: "2026-08-18T00:00:00.000Z" }),
    plan("watch-new", "active", { status: "持续关注", updatedAt: "2026-08-19T00:00:00.000Z" }),
    plan("watch-old", "active", { status: "持续关注", updatedAt: "2026-08-10T00:00:00.000Z" }),
  ], dependencies: [] });
  assert.deepEqual(sortBoardItems(items.filter((item) => item.status === "进行中"), "进行中").map((item) => item.id), ["earlier", "later"]);
  assert.deepEqual(sortBoardItems(items.filter((item) => item.status === "持续关注"), "持续关注").map((item) => item.id), ["watch-old", "watch-new"]);
});

test("validates bounded status patch input", () => {
  assert.deepEqual(validatePlanStatusPatch({ status: "等待", planVersion: 2, projectVersion: 4 }), { status: "等待", planVersion: 2, projectVersion: 4 });
  assert.throws(() => validatePlanStatusPatch({ status: "未知", planVersion: 2, projectVersion: 4 }), /状态/);
  assert.throws(() => validatePlanStatusPatch({ status: "等待", planVersion: 0, projectVersion: 4 }), /节点版本/);
});
