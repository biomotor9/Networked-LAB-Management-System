import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { documents, plans } from "../../../../../db/schema";
import { validateDocumentContent } from "../../../../features/workspace/content";
import { recordAudit } from "../../../../lib/auth/audit";
import { requireUser } from "../../../../lib/auth/session";
import { projectAccessResponse } from "../../../../lib/projects/access";
import { requireWorkspaceProject } from "../../../../lib/workspace/project-access";

type Context = { params: Promise<{ planId: string }> };

export async function GET(request: Request, context: Context) {
  const actor = await requireUser();
  let project;
  try { project = (await requireWorkspaceProject(actor, request, "view")).project; }
  catch (error) { return projectAccessResponse(error) ?? NextResponse.json({ error: "请选择项目。" }, { status: 400 }); }
  const { planId } = await context.params;
  const key = `${project.id}:${planId}`;
  const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.key, key)).limit(1);
  if (!plan) return NextResponse.json({ error: "计划不存在。" }, { status: 404 });
  const [document] = await db.select().from(documents).where(eq(documents.key, key)).limit(1);
  return NextResponse.json({ document: document ? {
    planId,
    content: document.content,
    version: document.version,
    updatedAt: document.updatedAt.toISOString(),
  } : { planId, content: "", version: 0, updatedAt: null } });
}

export async function PUT(request: Request, context: Context) {
  const actor = await requireUser();
  let access;
  try { access = await requireWorkspaceProject(actor, request, "edit-content"); }
  catch (error) { return projectAccessResponse(error) ?? NextResponse.json({ error: "请选择项目。" }, { status: 400 }); }
  const project = access.project;
  const { planId } = await context.params;
  const key = `${project.id}:${planId}`;
  const payload = await request.json() as { version?: unknown; content?: unknown };
  if (!Number.isInteger(payload.version) || Number(payload.version) < 0) return NextResponse.json({ error: "文档版本无效。" }, { status: 400 });
  let content: string;
  try { content = validateDocumentContent(payload.content); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Markdown 正文无效。" }, { status: 400 }); }
  const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.key, key)).limit(1);
  if (!plan) return NextResponse.json({ error: "计划不存在。" }, { status: 404 });

  const requestedVersion = Number(payload.version);
  let saved;
  if (requestedVersion === 0) {
    [saved] = await db.insert(documents).values({ key, projectId: project.id, planId, content, version: 1, updatedBy: actor.id })
      .onConflictDoNothing().returning();
  } else {
    [saved] = await db.update(documents).set({ content, version: requestedVersion + 1, updatedBy: actor.id, updatedAt: new Date() })
      .where(and(eq(documents.key, key), eq(documents.version, requestedVersion))).returning();
  }
  if (!saved) {
    const [current] = await db.select().from(documents).where(eq(documents.key, key)).limit(1);
    return NextResponse.json({
      error: "文档已被其他成员修改，本机草稿已保留。",
      code: "VERSION_CONFLICT",
      document: current ? { planId, content: current.content, version: current.version, updatedAt: current.updatedAt.toISOString() } : null,
    }, { status: 409 });
  }
  await recordAudit({ action: "document.updated", targetType: "plan", targetId: planId, projectId: project.id, actorUserId: actor.id, teamId: actor.teamId, metadata: { emergencyReason: access.emergencyReason } });
  return NextResponse.json({ document: { planId, content: saved.content, version: saved.version, updatedAt: saved.updatedAt.toISOString() } });
}
