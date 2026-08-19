import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../../../db";
import { questionExperimentLinks } from "../../../../../../../db/schema";
import { validateVerificationLink } from "../../../../../../features/questions/model";
import { recordAudit } from "../../../../../../lib/auth/audit";
import { requireUser } from "../../../../../../lib/auth/session";
import { projectAccessResponse } from "../../../../../../lib/projects/access";
import { requireWorkspaceProject } from "../../../../../../lib/workspace/project-access";
import { readQuestionBundle } from "../../../../../../lib/workspace/questions";

type Context = { params: Promise<{ id: string; planId: string }> };

export async function PATCH(request: Request, context: Context) {
  const actor = await requireUser();
  let access;
  try { access = await requireWorkspaceProject(actor, request, "edit-content"); }
  catch (error) { return projectAccessResponse(error) ?? NextResponse.json({ error: "请选择项目。" }, { status: 400 }); }
  const projectId = access.project.id;
  const { id: questionId, planId } = await context.params;
  const payload = await request.json() as Record<string, unknown>;
  if (!Number.isInteger(payload.version) || Number(payload.version) < 1) return NextResponse.json({ error: "验证结果版本无效。" }, { status: 400 });
  let input;
  try { input = validateVerificationLink(payload); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "验证结果无效。" }, { status: 400 }); }
  const [updated] = await db.update(questionExperimentLinks).set({ ...input, version: Number(payload.version) + 1, updatedAt: new Date() })
    .where(and(eq(questionExperimentLinks.projectId, projectId), eq(questionExperimentLinks.questionId, questionId), eq(questionExperimentLinks.planId, planId), eq(questionExperimentLinks.version, Number(payload.version)))).returning({ planId: questionExperimentLinks.planId });
  if (!updated) return NextResponse.json({ error: "验证结果已变化，请刷新后重试。", code: "VERSION_CONFLICT" }, { status: 409 });
  await recordAudit({ action: "question.verification_updated", targetType: "question", targetId: questionId, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { planId, outcome: input.outcome, emergencyReason: access.emergencyReason } });
  return NextResponse.json(await readQuestionBundle(projectId, questionId));
}
