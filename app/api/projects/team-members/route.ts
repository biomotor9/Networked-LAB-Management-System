import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { teamMembers, users } from "../../../../db/schema";
import { requireUser } from "../../../lib/auth/session";

export async function GET() {
  const actor = await requireUser();
  const members = await db.select({ id: users.id, displayName: users.displayName, email: users.email, teamRole: teamMembers.role })
    .from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, actor.teamId), eq(users.disabled, false)));
  return NextResponse.json({ members });
}
