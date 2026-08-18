import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { emergencyEditSessions } from "../../../../../db/schema";
import { recordAudit } from "../../../../lib/auth/audit";
import { requireUser } from "../../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../../lib/projects/access";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  const actor = await requireUser(); const { projectId } = await context.params;
  try { await requireProjectAccess(actor, projectId, "view"); } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  if (actor.role !== "owner") return NextResponse.json({ active: false });
  const [session] = await db.select({ reason: emergencyEditSessions.reason, expiresAt: emergencyEditSessions.expiresAt })
    .from(emergencyEditSessions).where(and(
      eq(emergencyEditSessions.projectId, projectId), eq(emergencyEditSessions.userId, actor.id),
      gt(emergencyEditSessions.expiresAt, new Date()), isNull(emergencyEditSessions.endedAt),
    )).limit(1);
  return NextResponse.json({ active: Boolean(session), reason: session?.reason, expiresAt: session?.expiresAt.toISOString() });
}

export async function POST(request: Request, context: Context) {
  const actor = await requireUser(); const { projectId } = await context.params;
  let access;
  try { access = await requireProjectAccess(actor, projectId, "view"); } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  if (actor.role !== "owner") return NextResponse.json({ error: "只有团队管理员可以启动应急编辑。" }, { status: 403 });
  if (access.project.archivedAt) return NextResponse.json({ error: "请先恢复归档项目。" }, { status: 409 });
  const payload = await request.json() as { reason?: unknown };
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!reason || reason.length > 1000) return NextResponse.json({ error: "请填写 1–1000 个字符的应急编辑原因。" }, { status: 400 });
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await db.update(emergencyEditSessions).set({ endedAt: new Date() }).where(and(
    eq(emergencyEditSessions.projectId, projectId), eq(emergencyEditSessions.userId, actor.id), isNull(emergencyEditSessions.endedAt),
  ));
  await db.insert(emergencyEditSessions).values({ id: randomUUID(), projectId, userId: actor.id, reason, expiresAt });
  await recordAudit({ action: "project.emergency_edit_started", targetType: "project", targetId: projectId, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { reason, expiresAt: expiresAt.toISOString() } });
  return NextResponse.json({ active: true, reason, expiresAt: expiresAt.toISOString() });
}

export async function DELETE(_request: Request, context: Context) {
  const actor = await requireUser(); const { projectId } = await context.params;
  try { await requireProjectAccess(actor, projectId, "view"); } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  if (actor.role !== "owner") return NextResponse.json({ error: "只有团队管理员可以结束应急编辑。" }, { status: 403 });
  const now = new Date();
  await db.update(emergencyEditSessions).set({ endedAt: now }).where(and(
    eq(emergencyEditSessions.projectId, projectId), eq(emergencyEditSessions.userId, actor.id), isNull(emergencyEditSessions.endedAt),
  ));
  await recordAudit({ action: "project.emergency_edit_ended", targetType: "project", targetId: projectId, projectId, actorUserId: actor.id, teamId: actor.teamId });
  return NextResponse.json({ active: false });
}
