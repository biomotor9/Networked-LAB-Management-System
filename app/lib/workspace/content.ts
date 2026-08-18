import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { attachments, documents, entries } from "../../../db/schema";
import type { Attachment, Entry, ServerDocument } from "../../features/workspace/model";

export async function readProjectContent(projectId: string): Promise<{
  documents: Record<string, ServerDocument>;
  entries: Entry[];
  attachments: Attachment[];
}> {
  const [storedDocuments, storedEntries, storedAttachments] = await Promise.all([
    db.select().from(documents).where(eq(documents.projectId, projectId)),
    db.select().from(entries).where(eq(entries.projectId, projectId)).orderBy(asc(entries.date), asc(entries.createdAt)),
    db.select().from(attachments).where(eq(attachments.projectId, projectId)).orderBy(asc(attachments.createdAt)),
  ]);
  return {
    documents: Object.fromEntries(storedDocuments.map((document) => [document.planId, {
      content: document.content,
      version: document.version,
      updatedAt: document.updatedAt.toISOString(),
    }])),
    entries: storedEntries.map((entry) => ({
      id: entry.id,
      planId: entry.planId,
      date: entry.date,
      type: entry.type as Entry["type"],
      title: entry.title,
      content: entry.content,
      version: entry.version,
    })),
    attachments: storedAttachments.map((attachment) => ({
      id: attachment.id,
      planId: attachment.planId,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      sha256: attachment.sha256,
      createdAt: attachment.createdAt.toISOString(),
      contentUrl: `/api/workspace/attachments/${encodeURIComponent(attachment.id)}/content?projectId=${encodeURIComponent(projectId)}`,
    })),
  };
}
