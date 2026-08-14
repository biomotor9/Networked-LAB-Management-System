import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../../db";
import { sessions, teamMembers, users } from "../../../../../../db/schema";
import { recordAudit } from "../../../../../lib/auth/audit";
import { requireUser } from "../../../../../lib/auth/session";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser({ owner: true });
  const { id } = await params;
  if (id === actor.id) return NextResponse.json({ error: "不能停用当前管理员账户。" }, { status: 400 });
  const payload = await request.json() as { disabled?: boolean };
  const membership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, actor.teamId), eq(teamMembers.userId, id))).limit(1);
  if (!membership.length) return NextResponse.json({ error: "用户不存在。" }, { status: 404 });
  const disabled = payload.disabled === true;
  await db.update(users).set({ disabled, updatedAt: new Date() }).where(eq(users.id, id));
  if (disabled) await db.delete(sessions).where(eq(sessions.userId, id));
  await recordAudit({ action: disabled ? "user.disabled" : "user.enabled", targetType: "user", targetId: id, actorUserId: actor.id, teamId: actor.teamId });
  return NextResponse.json({ ok: true });
}

