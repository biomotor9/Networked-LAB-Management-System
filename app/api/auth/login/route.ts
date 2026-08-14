import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { auditEvents, users } from "../../../../db/schema";
import { verifyPassword } from "../../../lib/auth/password";
import { createSession } from "../../../lib/auth/session";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = user && !user.disabled && await verifyPassword(password, user.passwordHash);
  if (!valid) return NextResponse.redirect(new URL("/login?error=credentials", request.url), 303);
  await createSession(user.id);
  await db.insert(auditEvents).values({ id: randomUUID(), actorUserId: user.id, action: "auth.login", targetType: "user", targetId: user.id });
  return NextResponse.redirect(new URL(user.mustChangePassword ? "/change-password" : "/", request.url), 303);
}

