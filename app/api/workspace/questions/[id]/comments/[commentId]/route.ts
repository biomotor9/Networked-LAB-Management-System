import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../../../db";
import { questionComments } from "../../../../../../../db/schema";
import { validateQuestionComment } from "../../../../../../features/questions/model";
import { recordAudit } from "../../../../../../lib/auth/audit";
import { requireUser } from "../../../../../../lib/auth/session";
import { projectAccessResponse } from "../../../../../../lib/projects/access";
import { requireWorkspaceProject } from "../../../../../../lib/workspace/project-access";
import { readQuestionBundle } from "../../../../../../lib/workspace/questions";

type Context = { params: Promise<{ id: string; commentId: string }> };

async function contextFor(request: Request, context: Context) {
  const actor = await requireUser();
  const access = await requireWorkspaceProject(actor, request, "edit-content");
  const { id: questionId, commentId } = await context.params;
  return { actor, access, projectId: access.project.id, questionId, commentId };
}

export async function PUT(request: Request, context: Context) {
  let data;
  try { data = await contextFor(request, context); }
  catch (error) { return projectAccessResponse(error) ?? NextResponse.json({ error: "请选择项目。" }, { status: 400 }); }
  const payload = await request.json() as { content?: unknown; version?: unknown };
  if (!Number.isInteger(payload.version) || Number(payload.version) < 1) return NextResponse.json({ error: "讨论版本无效。" }, { status: 400 });
  let content;
  try { content = validateQuestionComment(payload.content); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "讨论内容无效。" }, { status: 400 }); }
  const [stored] = await db.select({ createdBy: questionComments.createdBy, deletedAt: questionComments.deletedAt }).from(questionComments)
    .where(and(eq(questionComments.projectId, data.projectId), eq(questionComments.id, data.commentId), eq(questionComments.questionId, data.questionId))).limit(1);
  if (!stored) return NextResponse.json({ error: "讨论不存在。" }, { status: 404 });
  if (stored.createdBy !== data.actor.id) return NextResponse.json({ error: "只能编辑自己发表的讨论。" }, { status: 403 });
  if (stored.deletedAt) return NextResponse.json({ error: "已删除的讨论不能编辑。" }, { status: 409 });
  const [updated] = await db.update(questionComments).set({ content, version: Number(payload.version) + 1, updatedBy: data.actor.id, updatedAt: new Date() })
    .where(and(eq(questionComments.projectId, data.projectId), eq(questionComments.id, data.commentId), eq(questionComments.version, Number(payload.version)))).returning({ id: questionComments.id });
  if (!updated) return NextResponse.json({ error: "讨论已被修改，请刷新后重试。", code: "VERSION_CONFLICT" }, { status: 409 });
  await recordAudit({ action: "question.comment_updated", targetType: "question_comment", targetId: data.commentId, projectId: data.projectId, actorUserId: data.actor.id, teamId: data.actor.teamId, metadata: { questionId: data.questionId, emergencyReason: data.access.emergencyReason } });
  return NextResponse.json(await readQuestionBundle(data.projectId, data.questionId));
}

export async function DELETE(request: Request, context: Context) {
  let data;
  try { data = await contextFor(request, context); }
  catch (error) { return projectAccessResponse(error) ?? NextResponse.json({ error: "请选择项目。" }, { status: 400 }); }
  const payload = await request.json().catch(() => ({})) as { version?: unknown };
  if (!Number.isInteger(payload.version) || Number(payload.version) < 1) return NextResponse.json({ error: "讨论版本无效。" }, { status: 400 });
  const [stored] = await db.select({ createdBy: questionComments.createdBy, deletedAt: questionComments.deletedAt }).from(questionComments)
    .where(and(eq(questionComments.projectId, data.projectId), eq(questionComments.id, data.commentId), eq(questionComments.questionId, data.questionId))).limit(1);
  if (!stored) return NextResponse.json({ error: "讨论不存在。" }, { status: 404 });
  if (stored.createdBy !== data.actor.id) return NextResponse.json({ error: "只能删除自己发表的讨论。" }, { status: 403 });
  if (stored.deletedAt) return NextResponse.json(await readQuestionBundle(data.projectId, data.questionId));
  const [updated] = await db.update(questionComments).set({ content: "", deletedAt: new Date(), version: Number(payload.version) + 1, updatedBy: data.actor.id, updatedAt: new Date() })
    .where(and(eq(questionComments.projectId, data.projectId), eq(questionComments.id, data.commentId), eq(questionComments.version, Number(payload.version)))).returning({ id: questionComments.id });
  if (!updated) return NextResponse.json({ error: "讨论已变化，请刷新后重试。", code: "VERSION_CONFLICT" }, { status: 409 });
  await recordAudit({ action: "question.comment_deleted", targetType: "question_comment", targetId: data.commentId, projectId: data.projectId, actorUserId: data.actor.id, teamId: data.actor.teamId, metadata: { questionId: data.questionId, emergencyReason: data.access.emergencyReason } });
  return NextResponse.json(await readQuestionBundle(data.projectId, data.questionId));
}
