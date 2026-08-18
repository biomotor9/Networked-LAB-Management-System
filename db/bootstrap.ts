import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword, validatePassword } from "../app/lib/auth/password";
import { db } from ".";
import { teamMembers, teams, users } from "./schema";

export async function bootstrapInitialAdmin(): Promise<"created" | "exists" | "skipped"> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return "skipped";
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("BOOTSTRAP_ADMIN_EMAIL is invalid");
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) return "exists";

  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD: ${passwordError}`);

  const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Atlas 管理员";
  const teamName = process.env.BOOTSTRAP_TEAM_NAME?.trim() || "Atlas 测试团队";
  const userId = randomUUID();
  const teamId = randomUUID();
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId, email, displayName, passwordHash, mustChangePassword: true });
    await tx.insert(teams).values({ id: teamId, name: teamName, createdBy: userId });
    await tx.insert(teamMembers).values({ teamId, userId, role: "owner" });
  });
  return "created";
}
