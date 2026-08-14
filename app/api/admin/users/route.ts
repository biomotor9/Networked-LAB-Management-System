import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { teamMembers, users } from "../../../../db/schema";
import { recordAudit } from "../../../lib/auth/audit";
import { generateTemporaryPassword, hashPassword } from "../../../lib/auth/password";
import { requireUser } from "../../../lib/auth/session";

export async function POST(request: Request) {
  const actor = await requireUser({ owner: true });
  const payload = await request.json() as { email?: string; displayName?: string };
  const email = payload.email?.trim().toLowerCase() ?? "";
  const displayName = payload.displayName?.trim() ?? "";
  if (!/^\S+@\S+\.\S+$/.test(email) || !displayName) return NextResponse.json({ error: "请填写有效姓名和邮箱。" }, { status: 400 });
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return NextResponse.json({ error: "该邮箱已存在。" }, { status: 409 });
  const temporaryPassword = generateTemporaryPassword();
  const userId = randomUUID();
  const passwordHash = await hashPassword(temporaryPassword);
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, email, displayName, passwordHash, mustChangePassword: true });
    await tx.insert(teamMembers).values({ teamId: actor.teamId, userId, role: "member" });
  });
  await recordAudit({ action: "user.created", targetType: "user", targetId: userId, actorUserId: actor.id, teamId: actor.teamId, metadata: { email } });
  return NextResponse.json({ user: { id: userId, email, displayName, disabled: false, mustChangePassword: true, role: "member" }, temporaryPassword }, { status: 201 });
}

