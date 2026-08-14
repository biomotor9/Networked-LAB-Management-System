import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { documents, entries, plans } from "../../../../../db/schema";
import { validateWorkspaceContent } from "../../../../features/workspace/content";
import { recordAudit } from "../../../../lib/auth/audit";
import { requireUser } from "../../../../lib/auth/session";
import { readProjectContent } from "../../../../lib/workspace/content";
import { getOrCreateTeamProject } from "../../../../lib/workspace/project-access";

export async function PUT(request: Request) {
  const actor = await requireUser();
  const project = await getOrCreateTeamProject(actor);
  const payload = await request.json() as { mode?: unknown; documents?: unknown; entries?: unknown };
  if (payload.mode !== "replace" && payload.mode !== "if-empty") return NextResponse.json({ error: "内容迁移模式无效。" }, { status: 400 });
  const storedPlans = await db.select({ id: plans.id }).from(plans).where(eq(plans.projectId, project.id));
  let content;
  try { content = validateWorkspaceContent(payload, new Set(storedPlans.map((plan) => plan.id))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "工作区内容无效。" }, { status: 400 }); }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${project.id}:content`}))`);
      if (payload.mode === "if-empty") {
        const documentCount = await tx.select({ count: sql<number>`count(*)::int` }).from(documents).where(eq(documents.projectId, project.id));
        const entryCount = await tx.select({ count: sql<number>`count(*)::int` }).from(entries).where(eq(entries.projectId, project.id));
        if ((documentCount[0]?.count ?? 0) > 0 || (entryCount[0]?.count ?? 0) > 0) throw new Error("CONTENT_NOT_EMPTY");
      }
      await tx.delete(entries).where(eq(entries.projectId, project.id));
      await tx.delete(documents).where(eq(documents.projectId, project.id));
      const documentValues = Object.entries(content.documents).map(([planId, markdown]) => ({
        key: `${project.id}:${planId}`, projectId: project.id, planId, content: markdown, version: 1, updatedBy: actor.id,
      }));
      if (documentValues.length) await tx.insert(documents).values(documentValues);
      if (content.entries.length) await tx.insert(entries).values(content.entries.map((entry) => ({
        key: `${project.id}:${entry.id}`, id: entry.id, projectId: project.id, planKey: `${project.id}:${entry.planId}`, planId: entry.planId,
        date: entry.date, type: entry.type, title: entry.title, content: entry.content, version: 1, createdBy: actor.id, updatedBy: actor.id,
      })));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_NOT_EMPTY") return NextResponse.json({ error: "团队服务器已有文档或事件，未覆盖现有内容。", code: "CONTENT_NOT_EMPTY" }, { status: 409 });
    throw error;
  }
  await recordAudit({ action: "workspace.content_replaced", targetType: "project", targetId: project.id, actorUserId: actor.id, teamId: actor.teamId, metadata: { documents: Object.keys(content.documents).length, entries: content.entries.length } });
  return NextResponse.json(await readProjectContent(project.id));
}
