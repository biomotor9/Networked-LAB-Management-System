import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { projects } from "../../../db/schema";
import type { AuthenticatedUser } from "../auth/session";

export async function getOrCreateTeamProject(actor: AuthenticatedUser) {
  const [existing] = await db.select().from(projects).where(eq(projects.teamId, actor.teamId)).limit(1);
  if (existing) return existing;
  const project = { id: randomUUID(), teamId: actor.teamId, name: "默认实验项目", createdBy: actor.id };
  await db.insert(projects).values(project).onConflictDoNothing({ target: projects.teamId });
  return (await db.select().from(projects).where(eq(projects.teamId, actor.teamId)).limit(1))[0];
}
