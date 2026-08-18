import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../../db";
import { emergencyEditSessions, projectMembers, projects } from "../../../db/schema";
import { hasProjectPermission, type ProjectPermission } from "../../features/projects/access";
import type { ProjectRole } from "../../features/projects/model";
import type { AuthenticatedUser } from "../auth/session";

export type ProjectCapability = ProjectPermission;

export class ProjectAccessError extends Error {
  constructor(public readonly status: 403 | 404, message: string) { super(message); }
}

export type ProjectAccess = {
  project: typeof projects.$inferSelect;
  projectRole: ProjectRole | null;
  isTeamAdmin: boolean;
  emergencyReason: string | null;
};

export async function readProjectAccess(actor: AuthenticatedUser, projectId: string): Promise<ProjectAccess> {
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.teamId, actor.teamId))).limit(1);
  if (!project) throw new ProjectAccessError(404, "项目不存在或您无权访问。");

  const [memberships, emergencies] = await Promise.all([
    db.select({ role: projectMembers.role }).from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, actor.id))).limit(1),
    actor.role === "owner"
      ? db.select({ reason: emergencyEditSessions.reason }).from(emergencyEditSessions)
        .where(and(
          eq(emergencyEditSessions.projectId, projectId),
          eq(emergencyEditSessions.userId, actor.id),
          gt(emergencyEditSessions.expiresAt, new Date()),
          isNull(emergencyEditSessions.endedAt),
        )).limit(1)
      : Promise.resolve([]),
  ]);

  return {
    project,
    projectRole: memberships[0]?.role as ProjectRole | undefined ?? null,
    isTeamAdmin: actor.role === "owner",
    emergencyReason: emergencies[0]?.reason ?? null,
  };
}

export async function requireProjectAccess(actor: AuthenticatedUser, projectId: string, capability: ProjectCapability): Promise<ProjectAccess> {
  const access = await readProjectAccess(actor, projectId);
  const allowed = hasProjectPermission({ permission: capability, teamAdmin: access.isTeamAdmin, projectRole: access.projectRole, archived: Boolean(access.project.archivedAt), emergencyEdit: Boolean(access.emergencyReason) });
  if (!allowed) throw new ProjectAccessError(403, capability === "edit-content" && access.project.archivedAt
    ? "归档项目为只读，请先恢复项目。"
    : capability === "edit-content" && access.isTeamAdmin
      ? "请先加入项目，或启动有审计记录的管理员应急编辑。"
      : "您没有执行此操作的权限。");
  return access;
}

export function projectAccessResponse(error: unknown): Response | null {
  if (!(error instanceof ProjectAccessError)) return null;
  return Response.json({ error: error.message }, { status: error.status });
}
