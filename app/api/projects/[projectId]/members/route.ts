import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { projectMembers, teamMembers, users } from "../../../../../db/schema";
import { recordAudit } from "../../../../lib/auth/audit";
import { requireUser } from "../../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../../lib/projects/access";
import { readProjectDetail } from "../../../../lib/projects/queries";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, context: Context) {
  const actor = await requireUser(); const { projectId } = await context.params;
  let access;
  try { access = await requireProjectAccess(actor, projectId, "manage"); } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  if (access.project.archivedAt) return NextResponse.json({ error: "请先恢复归档项目。" }, { status: 409 });
  const payload = await request.json() as { userId?: unknown; role?: unknown };
  if (typeof payload.userId !== "string" || !payload.userId) return NextResponse.json({ error: "请选择团队成员。" }, { status: 400 });
  if (payload.role !== "member" && payload.role !== "viewer") return NextResponse.json({ error: "成员角色无效。" }, { status: 400 });
  const [teamMember] = await db.select({ id: users.id }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, actor.teamId), eq(teamMembers.userId, payload.userId), eq(users.disabled, false))).limit(1);
  if (!teamMember) return NextResponse.json({ error: "该用户不是当前团队的有效成员。" }, { status: 400 });
  const [existing] = await db.select({ role: projectMembers.role }).from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, payload.userId))).limit(1);
  if (existing?.role === "lead") return NextResponse.json({ error: "不能通过添加成员操作更改当前负责人，请使用负责人转交。" }, { status: 409 });
  await db.insert(projectMembers).values({ projectId, userId: payload.userId, role: payload.role, addedBy: actor.id })
    .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: payload.role, addedBy: actor.id, updatedAt: new Date() } });
  await recordAudit({ action: "project.member_added", targetType: "user", targetId: payload.userId, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { role: payload.role } });
  return NextResponse.json({ project: await readProjectDetail(actor, projectId) });
}
