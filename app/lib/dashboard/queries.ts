import "server-only";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../../../db";
import { dependencies, plans, projectMembers, projects } from "../../../db/schema";
import { buildBoardItems, type BoardDependencySource, type BoardPlanSource, type BoardProject } from "../../features/dashboard/model";
import type { Domain, Status } from "../../features/workspace/model";
import type { AuthenticatedUser } from "../auth/session";

export async function readPersonalBoard(actor: AuthenticatedUser): Promise<{ projects: BoardProject[]; items: ReturnType<typeof buildBoardItems> }> {
  const membershipRows = await db.select({
    id: projects.id,
    name: projects.name,
    status: projects.status,
    version: projects.version,
    role: projectMembers.role,
  }).from(projectMembers)
    .innerJoin(projects, and(eq(projects.id, projectMembers.projectId), eq(projects.teamId, actor.teamId)))
    .where(and(eq(projectMembers.userId, actor.id), isNull(projects.archivedAt), ne(projects.status, "已完成")));

  const boardProjects = membershipRows as BoardProject[];
  const projectIds = boardProjects.map((project) => project.id);
  if (!projectIds.length) return { projects: [], items: [] };

  const [planRows, dependencyRows] = await Promise.all([
    db.select({
      id: plans.id,
      projectId: plans.projectId,
      parentId: plans.parentId,
      title: plans.title,
      domain: plans.domain,
      status: plans.status,
      summary: plans.summary,
      tags: plans.tags,
      plannedCompletionDate: plans.plannedCompletionDate,
      updatedAt: plans.updatedAt,
      version: plans.version,
    }).from(plans).where(inArray(plans.projectId, projectIds)),
    db.select({ projectId: dependencies.projectId, sourceId: dependencies.sourcePlanId, targetId: dependencies.targetPlanId })
      .from(dependencies).where(inArray(dependencies.projectId, projectIds)),
  ]);

  const boardPlans: BoardPlanSource[] = planRows.map((plan) => ({
    id: plan.id,
    projectId: plan.projectId,
    parentId: plan.parentId,
    title: plan.title,
    domain: plan.domain as Domain,
    status: plan.status as Status,
    summary: plan.summary,
    tags: plan.tags,
    plannedCompletionDate: plan.plannedCompletionDate ?? undefined,
    updatedAt: plan.updatedAt.toISOString(),
    version: plan.version,
  }));

  return { projects: boardProjects, items: buildBoardItems({ projects: boardProjects, plans: boardPlans, dependencies: dependencyRows as BoardDependencySource[] }) };
}
