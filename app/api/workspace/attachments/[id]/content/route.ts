import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../db";
import { attachments } from "../../../../../../db/schema";
import { requireUser } from "../../../../../lib/auth/session";
import { attachmentStorage } from "../../../../../lib/attachments/storage";
import { getOrCreateTeamProject } from "../../../../../lib/workspace/project-access";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const actor = await requireUser();
  const project = await getOrCreateTeamProject(actor);
  const { id } = await context.params;
  const [attachment] = await db.select().from(attachments)
    .where(and(eq(attachments.projectId, project.id), eq(attachments.id, id))).limit(1);
  if (!attachment) return new Response("附件不存在。", { status: 404 });
  const etag = `"${attachment.sha256}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  try {
    const data = await attachmentStorage.read(attachment.storageKey);
    const disposition = attachment.mimeType.startsWith("image/") ? "inline" : "attachment";
    return new Response(Buffer.from(data), { headers: {
      "content-type": attachment.mimeType,
      "content-length": String(attachment.sizeBytes),
      "content-disposition": `${disposition}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      etag,
    } });
  } catch {
    return new Response("附件实体文件缺失，请联系管理员从备份恢复。", { status: 410 });
  }
}
