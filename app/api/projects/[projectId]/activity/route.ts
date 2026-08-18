import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { auditEvents, users } from "../../../../../db/schema";
import { requireUser } from "../../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../../lib/projects/access";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  const actor = await requireUser(); const { projectId } = await context.params;
  try { await requireProjectAccess(actor, projectId, "view"); } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  const events = await db.select({
    id: auditEvents.id, action: auditEvents.action, targetType: auditEvents.targetType,
    targetId: auditEvents.targetId, metadataJson: auditEvents.metadataJson,
    createdAt: auditEvents.createdAt, actorName: users.displayName,
  }).from(auditEvents).leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(eq(auditEvents.projectId, projectId)).orderBy(desc(auditEvents.createdAt)).limit(200);
  return NextResponse.json({ events: events.map((event) => ({
    ...event, actorName: event.actorName ?? "系统", createdAt: event.createdAt.toISOString(),
    metadata: JSON.parse(event.metadataJson) as Record<string, unknown>, metadataJson: undefined,
  })) });
}
