import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { projectMembers, projects, users } from "../../../db/schema";
import type { ProjectDetail, ProjectMember, ProjectRole, ProjectSummary } from "../../features/projects/model";
import type { AuthenticatedUser } from "../auth/session";
import { requireProjectAccess } from "./access";

type ProjectRow = typeof projects.$inferSelect;

function toSummary(row: ProjectRow, lead: ProjectMember, accessRole: ProjectSummary["accessRole"], projectRole: ProjectRole | null): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    startDate: row.startDate,
    endDate: row.endDate,
    tags: row.tags,
    version: row.version,
    lead: { userId: lead.userId, displayName: lead.displayName },
    accessRole,
    projectRole,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readMembers(projectIds: string[]): Promise<Map<string, ProjectMember[]>> {
  const result = new Map<string, ProjectMember[]>();
  if (!projectIds.length) return result;
  const rows = await db.select({
    projectId: projectMembers.projectId,
    userId: users.id,
    displayName: users.displayName,
    email: users.email,
    disabled: users.disabled,
    role: projectMembers.role,
  }).from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId))
    .where(inArray(projectMembers.projectId, projectIds))
    .orderBy(asc(projectMembers.joinedAt));
  for (const row of rows) {
    const list = result.get(row.projectId) ?? [];
    list.push({ userId: row.userId, displayName: row.displayName, email: row.email, disabled: row.disabled, role: row.role as ProjectRole });
    result.set(row.projectId, list);
  }
  return result;
}

export async function listAccessibleProjects(actor: AuthenticatedUser): Promise<ProjectSummary[]> {
  let projectRows: ProjectRow[];
  const roles = new Map<string, ProjectRole>();
  if (actor.role === "owner") {
    projectRows = await db.select().from(projects).where(eq(projects.teamId, actor.teamId)).orderBy(asc(projects.name));
  } else {
    const rows = await db.select({ project: projects, accessRole: projectMembers.role }).from(projects)
      .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)))
      .where(eq(projects.teamId, actor.teamId)).orderBy(asc(projects.name));
    projectRows = rows.map((row) => row.project);
    rows.forEach((row) => roles.set(row.project.id, row.accessRole as ProjectRole));
  }
  const members = await readMembers(projectRows.map((row) => row.id));
  return projectRows.map((row) => {
    const lead = members.get(row.id)?.find((member) => member.role === "lead");
    if (!lead) throw new Error(`项目 ${row.id} 缺少负责人。`);
    const accessRole = actor.role === "owner" ? "team-admin" : roles.get(row.id)!;
    const projectRole = members.get(row.id)?.find((member) => member.userId === actor.id)?.role ?? null;
    return toSummary(row, lead, accessRole, projectRole);
  });
}

export async function readProjectDetail(actor: AuthenticatedUser, projectId: string): Promise<ProjectDetail> {
  const access = await requireProjectAccess(actor, projectId, "view");
  const members = (await readMembers([projectId])).get(projectId) ?? [];
  const lead = members.find((member) => member.role === "lead");
  if (!lead) throw new Error("项目缺少负责人。");
  return {
    ...toSummary(access.project, lead, access.isTeamAdmin ? "team-admin" : access.projectRole!, access.projectRole),
    members,
    completedAt: access.project.completedAt?.toISOString() ?? null,
    createdAt: access.project.createdAt.toISOString(),
  };
}
