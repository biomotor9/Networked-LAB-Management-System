import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { attachments, plans } from "../../../../db/schema";
import { MAX_PROJECT_ATTACHMENT_BYTES, normalizeAttachmentName, validateAttachmentSize } from "../../../features/attachments/validation";
import { recordAudit } from "../../../lib/auth/audit";
import { requireUser } from "../../../lib/auth/session";
import { attachmentStorage } from "../../../lib/attachments/storage";
import { getOrCreateTeamProject } from "../../../lib/workspace/project-access";

export const runtime = "nodejs";

function normalizeMimeType(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized) ? normalized : "application/octet-stream";
}

export async function POST(request: Request) {
  const actor = await requireUser();
  const project = await getOrCreateTeamProject(actor);
  const form = await request.formData();
  const planId = String(form.get("planId") || "");
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择要上传的附件。" }, { status: 400 });
  try { validateAttachmentSize(file.size); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "附件大小无效。" }, { status: 400 }); }
  const planKey = `${project.id}:${planId}`;
  const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.key, planKey)).limit(1);
  if (!plan) return NextResponse.json({ error: "计划不存在。" }, { status: 404 });

  const id = randomUUID();
  const storageKey = `${project.id}/${id}`;
  const originalName = normalizeAttachmentName(file.name);
  const mimeType = normalizeMimeType(file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await attachmentStorage.write(storageKey, bytes);
  try {
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${project.id}:attachments`}))`);
      const [usage] = await tx.select({ total: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::int` }).from(attachments).where(eq(attachments.projectId, project.id));
      if (Number(usage?.total ?? 0) + file.size > MAX_PROJECT_ATTACHMENT_BYTES) throw new Error("团队附件总量已达到 1 GB 限制。");
      const [row] = await tx.insert(attachments).values({
        key: `${project.id}:${id}`, id, projectId: project.id, planKey, planId,
        originalName, storageKey, mimeType, sizeBytes: file.size, sha256, createdBy: actor.id,
      }).returning();
      return row;
    });
    await recordAudit({ action: "attachment.upload", targetType: "attachment", targetId: id, actorUserId: actor.id, teamId: actor.teamId, metadata: { planId, originalName, sizeBytes: file.size, sha256 } });
    return NextResponse.json({ attachment: {
      id: created.id, planId: created.planId, originalName: created.originalName, mimeType: created.mimeType,
      sizeBytes: created.sizeBytes, sha256: created.sha256, createdAt: created.createdAt.toISOString(),
      contentUrl: `/api/workspace/attachments/${encodeURIComponent(created.id)}/content`,
    } }, { status: 201 });
  } catch (error) {
    await attachmentStorage.remove(storageKey).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "附件上传失败。" }, { status: 400 });
  }
}
