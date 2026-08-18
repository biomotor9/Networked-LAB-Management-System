import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../../db";
import { projectMembers, projects, teamMembers, users } from "../../../../../../db/schema";
import { recordAudit } from "../../../../../lib/auth/audit";
import { requireUser } from "../../../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../../../lib/projects/access";
import { readProjectDetail } from "../../../../../lib/projects/queries";

type Context = { params: Promise<{ projectId: string; userId: string }> };

export async function PATCH(request: Request, context: Context) {
  const actor = await requireUser(); const { projectId, userId } = await context.params;
  let access;
  try { access = await requireProjectAccess(actor, projectId, "manage"); } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  if (access.project.archivedAt) return NextResponse.json({ error: "请先恢复归档项目。" }, { status: 409 });
  const payload = await request.json() as { role?: unknown };
  if (payload.role !== "lead" && payload.role !== "member" && payload.role !== "viewer") return NextResponse.json({ error: "成员角色无效。" }, { status: 400 });
  const role = payload.role;
  const [teamMember] = await db.select({ id: users.id }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, actor.teamId), eq(teamMembers.userId, userId), eq(users.disabled, false))).limit(1);
  if (!teamMember) return NextResponse.json({ error: "该用户不是当前团队的有效成员。" }, { status: 400 });
  const [currentMembership] = await db.select({ role: projectMembers.role }).from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1);
  if (currentMembership?.role === "lead" && role !== "lead") return NextResponse.json({ error: "必须将负责人身份转交给另一名成员，不能直接降级当前负责人。" }, { status: 409 });
  await db.transaction(async (tx) => {
    if (role === "lead") {
      await tx.update(projectMembers).set({ role: "member", updatedAt: new Date() })
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, "lead")));
    }
    await tx.insert(projectMembers).values({ projectId, userId, role, addedBy: actor.id })
      .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role, updatedAt: new Date() } });
    await tx.update(projects).set({ version: sql`${projects.version} + 1`, updatedAt: new Date() }).where(eq(projects.id, projectId));
  });
  await recordAudit({ action: role === "lead" ? "project.lead_transferred" : "project.member_role_changed", targetType: "user", targetId: userId, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { role } });
  return NextResponse.json({ project: await readProjectDetail(actor, projectId) });
}

export async function DELETE(_request: Request, context: Context) {
  const actor = await requireUser(); const { projectId, userId } = await context.params;
  let access;
  try { access = await requireProjectAccess(actor, projectId, "manage"); } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  if (access.project.archivedAt) return NextResponse.json({ error: "请先恢复归档项目。" }, { status: 409 });
  const [membership] = await db.select({ role: projectMembers.role }).from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1);
  if (!membership) return NextResponse.json({ error: "项目成员不存在。" }, { status: 404 });
  if (membership.role === "lead") return NextResponse.json({ error: "必须先将负责人身份转交给其他成员。" }, { status: 409 });
  await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  await db.update(projects).set({ version: sql`${projects.version} + 1`, updatedAt: new Date() }).where(eq(projects.id, projectId));
  await recordAudit({ action: "project.member_removed", targetType: "user", targetId: userId, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { role: membership.role } });
  return NextResponse.json({ project: await readProjectDetail(actor, projectId) });
}
