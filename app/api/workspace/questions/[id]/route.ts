import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { questions } from "../../../../../db/schema";
import { validateQuestionPatch } from "../../../../features/questions/model";
import { recordAudit } from "../../../../lib/auth/audit";
import { requireUser } from "../../../../lib/auth/session";
import { projectAccessResponse } from "../../../../lib/projects/access";
import { requireWorkspaceProject } from "../../../../lib/workspace/project-access";
import { readQuestionBundle } from "../../../../lib/workspace/questions";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const actor = await requireUser();
  let access;
  try { access = await requireWorkspaceProject(actor, request, "edit-content"); }
  catch (error) { return projectAccessResponse(error) ?? NextResponse.json({ error: "请选择项目。" }, { status: 400 }); }
  const projectId = access.project.id;
  const { id } = await context.params;
  const payload = await request.json() as Record<string, unknown>;
  if (!Number.isInteger(payload.version) || Number(payload.version) < 1) return NextResponse.json({ error: "问题版本无效。" }, { status: 400 });
  const [stored] = await db.select().from(questions).where(and(eq(questions.projectId, projectId), eq(questions.id, id))).limit(1);
  if (!stored) return NextResponse.json({ error: "问题不存在。" }, { status: 404 });
  let next;
  try { next = validateQuestionPatch(payload, stored); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "问题更新无效。" }, { status: 400 }); }
  const resolved = next.status === "已解决" || next.status === "已搁置";
  const [updated] = await db.update(questions).set({
    ...next,
    version: Number(payload.version) + 1,
    resolvedBy: resolved ? actor.id : null,
    resolvedAt: resolved ? new Date() : null,
    updatedAt: new Date(),
  }).where(and(eq(questions.projectId, projectId), eq(questions.id, id), eq(questions.version, Number(payload.version)))).returning({ id: questions.id });
  if (!updated) return NextResponse.json({ error: "问题已被其他成员修改，请刷新后重试。", code: "VERSION_CONFLICT" }, { status: 409 });
  const answerUpdated = payload.answerOutcome !== undefined || payload.answerNote !== undefined;
  await recordAudit({ action: answerUpdated ? "question.answer_updated" : "question.updated", targetType: "question", targetId: id, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { status: next.status, answerOutcome: next.answerOutcome, emergencyReason: access.emergencyReason } });
  return NextResponse.json(await readQuestionBundle(projectId, id));
}
