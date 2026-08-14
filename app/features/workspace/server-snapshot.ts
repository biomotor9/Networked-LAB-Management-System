import { arrowStyles, domains, statuses, type Dependency, type Plan } from "./model";
import { wouldCreateDependencyCycle } from "../dependencies/dependency-graph";

export type PlanDependencySnapshot = { plans: Plan[]; dependencies: Dependency[] };

export function validatePlanDependencySnapshot(value: unknown): PlanDependencySnapshot {
  if (!value || typeof value !== "object") throw new Error("工作区数据格式无效。");
  const root = value as { plans?: unknown; dependencies?: unknown };
  if (!Array.isArray(root.plans) || !Array.isArray(root.dependencies)) throw new Error("计划或依赖列表缺失。");
  if (root.plans.length > 10000 || root.dependencies.length > 50000) throw new Error("导入数据超过测试版容量限制。");

  const ids = new Set<string>();
  const plans = root.plans.map((candidate): Plan => {
    if (!candidate || typeof candidate !== "object") throw new Error("计划格式无效。");
    const plan = candidate as Partial<Plan>;
    if (typeof plan.id !== "string" || !plan.id || plan.id.length > 200 || ids.has(plan.id)) throw new Error("计划 ID 缺失或重复。");
    if (typeof plan.title !== "string" || !plan.title.trim() || plan.title.length > 300) throw new Error("计划名称无效。");
    if (!domains.includes(plan.domain!)) throw new Error(`计划“${plan.title}”的领域无效。`);
    if (!statuses.includes(plan.status!)) throw new Error(`计划“${plan.title}”的状态无效。`);
    if (plan.parentId !== null && typeof plan.parentId !== "string") throw new Error("父级计划格式无效。");
    ids.add(plan.id);
    return {
      id: plan.id, parentId: plan.parentId, title: plan.title.trim(), domain: plan.domain!, status: plan.status!,
      summary: String(plan.summary ?? "").slice(0, 20000), objective: String(plan.objective ?? "").slice(0, 20000),
      success: String(plan.success ?? "").slice(0, 20000), tags: Array.isArray(plan.tags) ? plan.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 100) : [],
      updatedAt: typeof plan.updatedAt === "string" ? plan.updatedAt : "刚刚",
      plannedCompletionDate: typeof plan.plannedCompletionDate === "string" ? plan.plannedCompletionDate : undefined,
      completedAt: typeof plan.completedAt === "string" ? plan.completedAt : undefined,
      graphX: typeof plan.graphX === "number" && Number.isFinite(plan.graphX) ? plan.graphX : undefined,
      graphY: typeof plan.graphY === "number" && Number.isFinite(plan.graphY) ? plan.graphY : undefined,
    };
  });

  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  for (const plan of plans) {
    if (plan.parentId && !byId.has(plan.parentId)) throw new Error(`计划“${plan.title}”引用了不存在的父级。`);
    const seen = new Set<string>([plan.id]);
    let parentId = plan.parentId;
    while (parentId) {
      if (seen.has(parentId)) throw new Error("计划层级不能形成循环。");
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }

  const pairs = new Set<string>();
  const dependencyIds = new Set<string>();
  const dependencies: Dependency[] = [];
  for (const candidate of root.dependencies) {
    if (!candidate || typeof candidate !== "object") throw new Error("依赖格式无效。");
    const dependency = candidate as Partial<Dependency>;
    if (typeof dependency.id !== "string" || !dependency.id || dependency.id.length > 200 || dependencyIds.has(dependency.id) || typeof dependency.sourceId !== "string" || typeof dependency.targetId !== "string") throw new Error("依赖字段缺失或 ID 重复。");
    const source = byId.get(dependency.sourceId); const target = byId.get(dependency.targetId);
    if (!source || !target) throw new Error("依赖引用了不存在的计划。");
    if (source.parentId !== target.parentId) throw new Error("执行依赖只能连接同一层级的计划。");
    const pair = `${source.id}\0${target.id}`;
    if (pairs.has(pair)) throw new Error("存在重复依赖。");
    if (wouldCreateDependencyCycle(dependencies, source.id, target.id)) throw new Error("执行依赖不能形成循环。");
    pairs.add(pair);
    dependencyIds.add(dependency.id);
    dependencies.push({ id: dependency.id, sourceId: source.id, targetId: target.id, label: typeof dependency.label === "string" ? dependency.label.slice(0, 1000) : undefined, arrowStyle: arrowStyles.includes(dependency.arrowStyle!) ? dependency.arrowStyle : "虚线箭头" });
  }
  return { plans, dependencies };
}
