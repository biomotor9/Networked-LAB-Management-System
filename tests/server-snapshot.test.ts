import assert from "node:assert/strict";
import test from "node:test";
import { validatePlanDependencySnapshot } from "../app/features/workspace/server-snapshot";

const plan = (id: string, parentId: string | null = null) => ({ id, parentId, title: id, domain: "综合", status: "未开始", summary: "", objective: "", success: "", tags: [], updatedAt: "刚刚" });

test("accepts a valid team plan snapshot", () => {
  const result = validatePlanDependencySnapshot({ plans: [plan("a"), plan("b")], dependencies: [{ id: "d", sourceId: "a", targetId: "b", arrowStyle: "虚线箭头" }] });
  assert.equal(result.plans.length, 2);
  assert.equal(result.dependencies.length, 1);
});

test("rejects hierarchy cycles, dependency cycles and cross-level edges", () => {
  assert.throws(() => validatePlanDependencySnapshot({ plans: [plan("a", "b"), plan("b", "a")], dependencies: [] }), /层级/);
  assert.throws(() => validatePlanDependencySnapshot({ plans: [plan("a"), plan("b")], dependencies: [{ id: "d1", sourceId: "a", targetId: "b" }, { id: "d2", sourceId: "b", targetId: "a" }] }), /依赖/);
  assert.throws(() => validatePlanDependencySnapshot({ plans: [plan("a"), plan("b", "a")], dependencies: [{ id: "d", sourceId: "a", targetId: "b" }] }), /同一层级/);
});
