import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../../db";
import { questionComments, questions } from "../../../../../../db/schema";
import { validateQuestionComment } from "../../../../../features/questions/model";
import { recordAudit } from "../../../../../lib/auth/audit";
import { requireUser } from "../../../../../lib/auth/session";
import { projectAccessResponse } from "../../../../../lib/projects/access";
import { requireWorkspaceProject } from "../../../../../lib/workspace/project-access";
import { readQuestionBundle } from "../../../../../lib/workspace/questions";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const actor = await requireUser();
  let access;
  try { access = await requireWorkspaceProject(actor, request, "edit-content"); }
  catch (error) { return projectAccessResponse(error) ?? NextResponse.json({ error: "请选择项目。" }, { status: 400 }); }
  const projectId = access.project.id;
  const { id: questionId } = await context.params;
  const payload = await request.json() as { content?: unknown };
  let content;
  try { content = validateQuestionComment(payload.content); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "讨论内容无效。" }, { status: 400 }); }
  const [question] = await db.select({ key: questions.key }).from(questions).where(and(eq(questions.projectId, projectId), eq(questions.id, questionId))).limit(1);
  if (!question) return NextResponse.json({ error: "问题不存在。" }, { status: 404 });
  const id = randomUUID();
  await db.insert(questionComments).values({ key: `${projectId}:${id}`, id, projectId, questionKey: question.key, questionId, content, createdBy: actor.id, updatedBy: actor.id });
  await recordAudit({ action: "question.comment_created", targetType: "question_comment", targetId: id, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { questionId, emergencyReason: access.emergencyReason } });
  return NextResponse.json(await readQuestionBundle(projectId, questionId), { status: 201 });
}
