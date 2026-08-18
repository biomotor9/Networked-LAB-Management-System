import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { attachments } from "../../../../../db/schema";
import { recordAudit } from "../../../../lib/auth/audit";
import { requireUser } from "../../../../lib/auth/session";
import { attachmentStorage } from "../../../../lib/attachments/storage";
import { projectAccessResponse, readProjectAccess } from "../../../../lib/projects/access";
import { projectIdFromRequest } from "../../../../lib/workspace/project-access";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  const actor = await requireUser();
  let projectId: string; let access;
  try { projectId = projectIdFromRequest(request); access = await readProjectAccess(actor, projectId); }
  catch (error) { return projectAccessResponse(error) ?? NextResponse.json({ error: "请选择项目。" }, { status: 400 }); }
  const { id } = await context.params;
  const [attachment] = await db.select().from(attachments).where(and(eq(attachments.projectId, projectId), eq(attachments.id, id))).limit(1);
  if (!attachment) return NextResponse.json({ error: "附件不存在。" }, { status: 404 });
  if (!access.isTeamAdmin && access.projectRole !== "lead" && attachment.createdBy !== actor.id) return NextResponse.json({ error: "只有上传者、项目负责人或团队管理员可以删除附件。" }, { status: 403 });
  const [deleted] = await db.delete(attachments).where(and(eq(attachments.projectId, projectId), eq(attachments.id, id))).returning();
  await attachmentStorage.remove(deleted.storageKey).catch(() => undefined);
  await recordAudit({ action: "attachment.delete", targetType: "attachment", targetId: id, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { planId: deleted.planId, originalName: deleted.originalName, sha256: deleted.sha256 } });
  return NextResponse.json({ deleted: true });
}
