import type { Plan, Status } from "../workspace/model";

export type VisiblePlanTreeRow = { plan: Plan; depth: number };

export const planStatusPriority: Record<Status, number> = {
  "紧急": 0,
  "持续关注": 1,
  "进行中": 2,
  "等待": 3,
  "未开始": 4,
  "已完成": 5,
  "终止": 6,
};

export function buildVisiblePlanTree(plans: readonly Plan[], expandedIds: ReadonlySet<string>, query = ""): VisiblePlanTreeRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const matchedIds = normalizedQuery ? new Set<string>() : null;

  if (matchedIds) {
    const plansById = new Map(plans.map((plan) => [plan.id, plan]));
    for (const plan of plans) {
      const searchableText = [plan.title, plan.summary, ...plan.tags].join("\n").toLocaleLowerCase("zh-CN");
      if (!searchableText.includes(normalizedQuery)) continue;
      let current: Plan | undefined = plan;
      const lineage = new Set<string>();
      while (current && !lineage.has(current.id)) {
        lineage.add(current.id);
        matchedIds.add(current.id);
        current = current.parentId ? plansById.get(current.parentId) : undefined;
      }
    }
  }

  const childrenByParent = new Map<string | null, Plan[]>();
  const originalOrder = new Map(plans.map((plan, index) => [plan.id, index]));
  for (const plan of plans) {
    const siblings = childrenByParent.get(plan.parentId) ?? [];
    siblings.push(plan);
    childrenByParent.set(plan.parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => planStatusPriority[left.status] - planStatusPriority[right.status]
      || (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0));
  }

  const rows: VisiblePlanTreeRow[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const plan of childrenByParent.get(parentId) ?? []) {
      if (visited.has(plan.id) || (matchedIds && !matchedIds.has(plan.id))) continue;
      visited.add(plan.id);
      rows.push({ plan, depth });
      if (normalizedQuery || expandedIds.has(plan.id)) walk(plan.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

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
