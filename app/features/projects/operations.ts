export type StoredPlanAccess = { id: string; parentId: string | null; createdBy: string };
export type StoredDependencyAccess = { sourceId: string; targetId: string };

export function validatePlanRemoval(input: {
  storedPlans: StoredPlanAccess[];
  storedDependencies: StoredDependencyAccess[];
  incomingPlanIds: Set<string>;
  actorId: string;
  projectRole: "lead" | "member" | "viewer" | null;
}): string | null {
  const removed = input.storedPlans.filter((plan) => !input.incomingPlanIds.has(plan.id));
  for (const plan of removed) {
    if (input.storedPlans.some((candidate) => candidate.parentId === plan.id)) return "请先移动或删除该计划的下级计划。";
    if (input.storedDependencies.some((dependency) => dependency.sourceId === plan.id || dependency.targetId === plan.id)) return "请先解除该计划的执行依赖。";
    if (input.projectRole === "member" && plan.createdBy !== input.actorId) return "普通项目成员只能删除自己创建的计划。";
  }
  return null;
}
export function findExternalDependencyIds(dependencies: Array<{ id: string; sourceId: string; targetId: string }>, subtreeIds: Set<string>): string[] {
  return dependencies.filter((dependency) => subtreeIds.has(dependency.sourceId) !== subtreeIds.has(dependency.targetId)).map((dependency) => dependency.id);
}
