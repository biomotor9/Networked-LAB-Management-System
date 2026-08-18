import { randomUUID } from "node:crypto";
import { db } from "../../../db";
import { auditEvents } from "../../../db/schema";

export async function recordAudit(input: {
  action: string;
  targetType: string;
  actorUserId?: string | null;
  teamId?: string | null;
  projectId?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditEvents).values({
    id: randomUUID(),
    action: input.action,
    targetType: input.targetType,
    actorUserId: input.actorUserId ?? null,
    teamId: input.teamId ?? null,
    projectId: input.projectId ?? null,
    targetId: input.targetId ?? null,
    metadataJson: JSON.stringify(input.metadata ?? {}),
  });
}
