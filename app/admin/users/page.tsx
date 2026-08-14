import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { teamMembers, users } from "../../../db/schema";
import { requireUser } from "../../lib/auth/session";
import AdminUsersClient from "./users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const actor = await requireUser({ owner: true });
  const rows = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName, disabled: users.disabled, mustChangePassword: users.mustChangePassword, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, actor.teamId));
  return <AdminUsersClient teamName={actor.teamName} currentUserId={actor.id} initialUsers={rows.map((row) => ({ ...row, role: row.role as "owner" | "member" }))} />;
}

