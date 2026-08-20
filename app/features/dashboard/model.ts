import type { ProjectRole, ProjectStatus } from "../projects/model";
import { statuses, type Domain, type Status } from "../workspace/model";

export const boardStatuses = ["紧急", "进行中", "等待", "持续关注"] as const satisfies readonly Status[];
export type BoardStatus = typeof boardStatuses[number];

export type BoardProject = {
  id: string;
  name: string;
  status: ProjectStatus;
  version: number;
  role: ProjectRole;
};

export type BoardPlanSource = {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  domain: Domain;
  status: Status;
  summary: string;
  tags: string[];
  plannedCompletionDate?: string;
  updatedAt: string;
  version: number;
};

export type BoardDependencySource = {
  projectId: string;
  sourceId: string;
  targetId: string;
};

export type BoardItem = BoardPlanSource & {
  status: BoardStatus;
  projectName: string;
  projectStatus: ProjectStatus;
  projectVersion: number;
  path: string[];
  blockingCount: number;
  canEdit: boolean;
};

export type BoardFilters = {
  query: string;
  projectId: string;
  projectScope: "active" | "planning" | "all";
  domain: Domain | "全部";
  tag: string;
  due: "全部" | "已逾期" | "七天内" | "无日期";
};

const statusSet = new Set<Status>(boardStatuses);

function planKey(projectId: string, planId: string): string {
  return `${projectId}\0${planId}`;
}

function buildPath(plan: BoardPlanSource, plansByKey: ReadonlyMap<string, BoardPlanSource>): string[] {
  const result: string[] = [];
  const visited = new Set<string>([plan.id]);
  let parentId = plan.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = plansByKey.get(planKey(plan.projectId, parentId));
    if (!parent) break;
    result.unshift(parent.title);
    parentId = parent.parentId;
  }
  return result;
}

export function buildBoardItems(input: {
  projects: readonly BoardProject[];
  plans: readonly BoardPlanSource[];
  dependencies: readonly BoardDependencySource[];
}): BoardItem[] {
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const plansByKey = new Map(input.plans.map((plan) => [planKey(plan.projectId, plan.id), plan]));
  const blockersByTarget = new Map<string, number>();

  for (const dependency of input.dependencies) {
    const source = plansByKey.get(planKey(dependency.projectId, dependency.sourceId));
    if (!source || source.status === "已完成") continue;
    const targetKey = planKey(dependency.projectId, dependency.targetId);
    blockersByTarget.set(targetKey, (blockersByTarget.get(targetKey) ?? 0) + 1);
  }

  return input.plans.flatMap((plan): BoardItem[] => {
    const project = projectsById.get(plan.projectId);
    if (!project || project.status === "已完成" || !statusSet.has(plan.status)) return [];
    return [{
      ...plan,
      status: plan.status as BoardStatus,
      projectName: project.name,
      projectStatus: project.status,
      projectVersion: project.version,
      path: buildPath(plan, plansByKey),
      blockingCount: blockersByTarget.get(planKey(plan.projectId, plan.id)) ?? 0,
      canEdit: project.role === "lead" || project.role === "member",
    }];
  });
}

function parseDate(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function sortBoardItems(items: readonly BoardItem[], status: BoardStatus): BoardItem[] {
  return [...items].sort((left, right) => {
    const leftDue = parseDate(left.plannedCompletionDate);
    const rightDue = parseDate(right.plannedCompletionDate);
    if (leftDue !== null || rightDue !== null) {
      if (leftDue === null) return 1;
      if (rightDue === null) return -1;
      if (leftDue !== rightDue) return leftDue - rightDue;
    }
    const updatedDifference = Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
    if (Number.isFinite(updatedDifference) && updatedDifference !== 0) return status === "持续关注" ? updatedDifference : -updatedDifference;
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

function projectScopeMatches(status: ProjectStatus, scope: BoardFilters["projectScope"]): boolean {
  if (scope === "active") return status === "进行中";
  if (scope === "planning") return status === "进行中" || status === "筹备中";
  return status !== "已完成";
}

export function filterBoardItems(items: readonly BoardItem[], filters: BoardFilters, today = new Date()): BoardItem[] {
  const todayStart = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const sevenDays = todayStart + 7 * 24 * 60 * 60 * 1000;
  const query = filters.query.trim().toLocaleLowerCase("zh-CN");

  return items.filter((item) => {
    if (!projectScopeMatches(item.projectStatus, filters.projectScope)) return false;
    if (filters.projectId && item.projectId !== filters.projectId) return false;
    if (filters.domain !== "全部" && item.domain !== filters.domain) return false;
    if (filters.tag && !item.tags.includes(filters.tag)) return false;
    if (query && ![item.title, item.summary, item.projectName, ...item.path, ...item.tags].join("\n").toLocaleLowerCase("zh-CN").includes(query)) return false;
    const due = parseDate(item.plannedCompletionDate);
    if (filters.due === "已逾期" && (due === null || due >= todayStart)) return false;
    if (filters.due === "七天内" && (due === null || due < todayStart || due > sevenDays)) return false;
    if (filters.due === "无日期" && due !== null) return false;
    return true;
  });
}

export function validatePlanStatusPatch(value: unknown): { status: Status; planVersion: number; projectVersion: number } {
  if (!value || typeof value !== "object") throw new Error("状态更新数据无效。");
  const input = value as { status?: unknown; planVersion?: unknown; projectVersion?: unknown };
  if (!statuses.includes(input.status as Status)) throw new Error("实验节点状态无效。");
  if (!Number.isInteger(input.planVersion) || Number(input.planVersion) < 1) throw new Error("缺少有效实验节点版本。");
  if (!Number.isInteger(input.projectVersion) || Number(input.projectVersion) < 1) throw new Error("缺少有效项目版本。");
  return { status: input.status as Status, planVersion: Number(input.planVersion), projectVersion: Number(input.projectVersion) };
}
