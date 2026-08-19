import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../../db";
import { dependencies, plans, projects, questionExperimentLinks, questions } from "../../../../../../db/schema";
import { validateDerivedExperiment } from "../../../../../features/questions/model";
import type { Dependency, Plan } from "../../../../../features/workspace/model";
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
  const payload = await request.json() as Record<string, unknown>;
  if (!Number.isInteger(payload.projectVersion) || Number(payload.projectVersion) < 1) return NextResponse.json({ error: "项目版本无效。" }, { status: 400 });
  if (!Number.isInteger(payload.questionVersion) || Number(payload.questionVersion) < 1) return NextResponse.json({ error: "问题版本无效。" }, { status: 400 });
  let input;
  try { input = validateDerivedExperiment(payload); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "验证实验无效。" }, { status: 400 }); }
  const planId = randomUUID();
  const dependencyId = randomUUID();
  let createdPlan: Plan | null = null;
  let createdDependency: Dependency | null = null;
  const nextProjectVersion = Number(payload.projectVersion) + 1;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${projectId}))`);
      const [updatedProject] = await tx.update(projects).set({ version: nextProjectVersion, updatedAt: new Date() })
        .where(and(eq(projects.id, projectId), eq(projects.version, Number(payload.projectVersion)))).returning({ id: projects.id });
      if (!updatedProject) throw new Error("PROJECT_VERSION_CONFLICT");
      const [question] = await tx.select().from(questions).where(and(eq(questions.projectId, projectId), eq(questions.id, questionId), eq(questions.version, Number(payload.questionVersion)))).limit(1);
      if (!question) throw new Error("QUESTION_VERSION_CONFLICT");
      const [sourcePlan] = await tx.select().from(plans).where(eq(plans.key, question.sourcePlanKey)).limit(1);
      if (!sourcePlan) throw new Error("SOURCE_PLAN_MISSING");
      const [plan] = await tx.insert(plans).values({
        key: `${projectId}:${planId}`, id: planId, projectId, parentId: sourcePlan.parentId,
        title: input.title, domain: input.domain, status: "未开始", summary: input.summary,
        objective: "", success: "", tags: [], plannedCompletionDate: input.plannedCompletionDate, createdBy: actor.id,
      }).returning();
      const [dependency] = await tx.insert(dependencies).values({
        key: `${projectId}:${dependencyId}`, id: dependencyId, projectId,
        sourcePlanId: sourcePlan.id, targetPlanId: planId, label: `验证 Q-${String(question.number).padStart(3, "0")}`, arrowStyle: "虚线箭头",
      }).returning();
      await tx.insert(questionExperimentLinks).values({
        key: `${projectId}:${questionId}:${planId}`, projectId, questionKey: question.key, questionId,
        planKey: plan.key, planId, createdBy: actor.id,
      });
      await tx.update(questions).set({ status: "待验证", version: question.version + 1, resolvedBy: null, resolvedAt: null, updatedAt: new Date() }).where(eq(questions.key, question.key));
      createdPlan = {
        id: plan.id, parentId: plan.parentId, title: plan.title, domain: plan.domain as Plan["domain"], status: plan.status as Plan["status"],
        summary: plan.summary, objective: plan.objective, success: plan.success, tags: plan.tags, updatedAt: plan.updatedAt.toISOString(),
        plannedCompletionDate: plan.plannedCompletionDate ?? undefined,
      };
      createdDependency = { id: dependency.id, sourceId: dependency.sourcePlanId, targetId: dependency.targetPlanId, label: dependency.label ?? undefined, arrowStyle: dependency.arrowStyle as Dependency["arrowStyle"] };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_VERSION_CONFLICT") return NextResponse.json({ error: "项目已被其他成员修改，请刷新后重试。", code: "VERSION_CONFLICT" }, { status: 409 });
    if (error instanceof Error && error.message === "QUESTION_VERSION_CONFLICT") return NextResponse.json({ error: "问题已被其他成员修改，请刷新后重试。", code: "QUESTION_VERSION_CONFLICT" }, { status: 409 });
    if (error instanceof Error && error.message === "SOURCE_PLAN_MISSING") return NextResponse.json({ error: "来源实验不存在。" }, { status: 404 });
    throw error;
  }
  await recordAudit({ action: "question.experiment_created", targetType: "question", targetId: questionId, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { planId, emergencyReason: access.emergencyReason } });
  return NextResponse.json({ project: { version: nextProjectVersion }, plan: createdPlan, dependency: createdDependency, ...(await readQuestionBundle(projectId, questionId)) }, { status: 201 });
}
