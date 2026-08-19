import { randomUUID } from "node:crypto";
import { eq, max, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { plans, questions } from "../../../../db/schema";
import { validateQuestionCreate } from "../../../features/questions/model";
import { recordAudit } from "../../../lib/auth/audit";
import { requireUser } from "../../../lib/auth/session";
import { projectAccessResponse } from "../../../lib/projects/access";
import { requireWorkspaceProject } from "../../../lib/workspace/project-access";
import { readQuestionBundle } from "../../../lib/workspace/questions";

export async function POST(request: Request) {
  const actor = await requireUser();
  let access;
  try { access = await requireWorkspaceProject(actor, request, "edit-content"); }
  catch (error) { return projectAccessResponse(error) ?? NextResponse.json({ error: "请选择项目。" }, { status: 400 }); }
  let input;
  try { input = validateQuestionCreate(await request.json()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "问题记录无效。" }, { status: 400 }); }
  const projectId = access.project.id;
  const sourcePlanKey = `${projectId}:${input.sourcePlanId}`;
  const [sourcePlan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.key, sourcePlanKey)).limit(1);
  if (!sourcePlan) return NextResponse.json({ error: "来源实验不存在。" }, { status: 404 });
  const id = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`question-number:${projectId}`}))`);
      const [row] = await tx.select({ value: max(questions.number) }).from(questions).where(eq(questions.projectId, projectId));
      await tx.insert(questions).values({
        key: `${projectId}:${id}`, id, projectId, sourcePlanKey, sourcePlanId: input.sourcePlanId,
        number: Number(row?.value ?? 0) + 1, title: input.title, context: input.context, sourceExcerpt: input.sourceExcerpt,
        createdBy: actor.id,
      });
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return NextResponse.json({ error: "问题编号冲突，请重试。" }, { status: 409 });
    throw error;
  }
  await recordAudit({ action: "question.created", targetType: "question", targetId: id, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { sourcePlanId: input.sourcePlanId, emergencyReason: access.emergencyReason } });
  return NextResponse.json(await readQuestionBundle(projectId, id), { status: 201 });
}
