import assert from "node:assert/strict";
import test from "node:test";
import { hasProjectPermission } from "../app/features/projects/access";
import { normalizeProjectName, validateProjectName, validateProjectTags } from "../app/features/projects/model";
import { findExternalDependencyIds, validatePlanRemoval } from "../app/features/projects/operations";

test("normalizes project names for team uniqueness", () => {
  assert.equal(normalizeProjectName("  Alpha 实验  "), "alpha 实验");
  assert.deepEqual(validateProjectName(" 项目 A "), { name: "项目 A", normalizedName: "项目 a" });
  assert.throws(() => validateProjectName("   "), /项目名称/);
});

test("normalizes and limits project tags", () => {
  assert.deepEqual(validateProjectTags([" 蛋白 ", "蛋白", "复测"]), ["蛋白", "复测"]);
  assert.throws(() => validateProjectTags(new Array(101).fill("x")), /过多/);
});

test("enforces project role and archived content permissions", () => {
  assert.equal(hasProjectPermission({ permission: "view", teamAdmin: true, projectRole: null, archived: true, emergencyEdit: false }), true);
  assert.equal(hasProjectPermission({ permission: "edit-content", teamAdmin: true, projectRole: null, archived: false, emergencyEdit: false }), false);
  assert.equal(hasProjectPermission({ permission: "edit-content", teamAdmin: true, projectRole: null, archived: false, emergencyEdit: true }), true);
  assert.equal(hasProjectPermission({ permission: "edit-content", teamAdmin: false, projectRole: "member", archived: true, emergencyEdit: false }), false);
  assert.equal(hasProjectPermission({ permission: "manage", teamAdmin: false, projectRole: "lead", archived: true, emergencyEdit: false }), true);
  assert.equal(hasProjectPermission({ permission: "delete-nonempty", teamAdmin: false, projectRole: "lead", archived: false, emergencyEdit: false }), false);
});

test("enforces safe member plan deletion", () => {
  const plans = [{ id: "root", parentId: null, createdBy: "u1" }, { id: "child", parentId: "root", createdBy: "u1" }, { id: "other", parentId: null, createdBy: "u2" }];
  assert.match(validatePlanRemoval({ storedPlans: plans, storedDependencies: [], incomingPlanIds: new Set(["child", "other"]), actorId: "u1", projectRole: "member" })!, /下级/);
  assert.match(validatePlanRemoval({ storedPlans: plans, storedDependencies: [], incomingPlanIds: new Set(["root", "child"]), actorId: "u1", projectRole: "member" })!, /自己创建/);
  assert.match(validatePlanRemoval({ storedPlans: [plans[2]], storedDependencies: [{ sourceId: "other", targetId: "x" }], incomingPlanIds: new Set(), actorId: "u2", projectRole: "member" })!, /依赖/);
  assert.equal(validatePlanRemoval({ storedPlans: [plans[2]], storedDependencies: [], incomingPlanIds: new Set(), actorId: "u2", projectRole: "member" }), null);
  assert.match(validatePlanRemoval({ storedPlans: [plans[2]], storedDependencies: [], incomingPlanIds: new Set(), actorId: "u2", projectRole: "member", referencedQuestionPlanIds: new Set(["other"]) })!, /问题记录/);
});

test("finds dependencies crossing a moved plan subtree", () => {
  const external = findExternalDependencyIds([{ id: "inside", sourceId: "a", targetId: "b" }, { id: "outside", sourceId: "b", targetId: "c" }], new Set(["a", "b"]));
  assert.deepEqual(external, ["outside"]);
});
