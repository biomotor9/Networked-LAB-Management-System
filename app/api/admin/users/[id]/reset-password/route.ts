import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../../db";
import { sessions, teamMembers, users } from "../../../../../../db/schema";
import { recordAudit } from "../../../../../lib/auth/audit";
import { generateTemporaryPassword, hashPassword } from "../../../../../lib/auth/password";
import { requireUser } from "../../../../../lib/auth/session";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser({ owner: true });
  const { id } = await params;
  const membership = await db.select().from(teamMembers).where(and(eq(teamMembers.teamId, actor.teamId), eq(teamMembers.userId, id))).limit(1);
  if (!membership.length) return NextResponse.json({ error: "用户不存在。" }, { status: 404 });
  const temporaryPassword = generateTemporaryPassword();
  await db.update(users).set({ passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  await recordAudit({ action: "user.password_reset", targetType: "user", targetId: id, actorUserId: actor.id, teamId: actor.teamId });
  return NextResponse.json({ temporaryPassword });
}

