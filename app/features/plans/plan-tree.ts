import type { Plan } from "../workspace/model";

export function collectDescendantIds(plans: readonly Plan[], rootId: string): Set<string> {
  const childrenByParent = new Map<string | null, string[]>();
  for (const plan of plans) {
    const children = childrenByParent.get(plan.parentId) ?? [];
    children.push(plan.id);
    childrenByParent.set(plan.parentId, children);
  }

  const descendants = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const childId of childrenByParent.get(current) ?? []) {
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      queue.push(childId);
    }
  }
  return descendants;
}

export function canReparentPlan(plans: readonly Plan[], planId: string, parentId: string | null): boolean {
  const plan = plans.find((candidate) => candidate.id === planId);
  if (!plan || plan.parentId === parentId || parentId === planId) return false;
  return parentId === null || !collectDescendantIds(plans, planId).has(parentId);
}

