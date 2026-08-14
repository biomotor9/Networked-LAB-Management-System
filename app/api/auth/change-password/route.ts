import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { sessions, users } from "../../../../db/schema";
import { hashPassword, validatePassword, verifyPassword } from "../../../lib/auth/password";
import { createSession, destroyCurrentSession, requireUser } from "../../../lib/auth/session";
import { recordAudit } from "../../../lib/auth/audit";

export async function POST(request: Request) {
  const actor = await requireUser({ allowPasswordChange: true });
  const form = await request.formData();
  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  let error = validatePassword(newPassword);
  if (!user || !await verifyPassword(currentPassword, user.passwordHash)) error = "当前密码不正确。";
  else if (newPassword !== confirmPassword) error = "两次输入的新密码不一致。";
  if (error) return NextResponse.redirect(new URL(`/change-password?error=${encodeURIComponent(error)}`, request.url), 303);
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, actor.id));
  await db.delete(sessions).where(eq(sessions.userId, actor.id));
  await destroyCurrentSession();
  await createSession(actor.id);
  await recordAudit({ action: "auth.password_changed", targetType: "user", targetId: actor.id, actorUserId: actor.id, teamId: actor.teamId });
  return NextResponse.redirect(new URL("/", request.url), 303);
}
