import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { attachments } from "../../../../../db/schema";
import { recordAudit } from "../../../../lib/auth/audit";
import { requireUser } from "../../../../lib/auth/session";
import { attachmentStorage } from "../../../../lib/attachments/storage";
import { getOrCreateTeamProject } from "../../../../lib/workspace/project-access";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  const actor = await requireUser();
  const project = await getOrCreateTeamProject(actor);
  const { id } = await context.params;
  const [deleted] = await db.delete(attachments)
    .where(and(eq(attachments.projectId, project.id), eq(attachments.id, id)))
    .returning();
  if (!deleted) return NextResponse.json({ error: "附件不存在。" }, { status: 404 });
  await attachmentStorage.remove(deleted.storageKey).catch(() => undefined);
  await recordAudit({ action: "attachment.delete", targetType: "attachment", targetId: id, actorUserId: actor.id, teamId: actor.teamId, metadata: { planId: deleted.planId, originalName: deleted.originalName, sha256: deleted.sha256 } });
  return NextResponse.json({ deleted: true });
}
