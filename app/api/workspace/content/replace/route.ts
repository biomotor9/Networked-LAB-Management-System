import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { documents, entries, plans, questionComments, questionExperimentLinks, questions } from "../../../../../db/schema";
import { validateQuestionBackup } from "../../../../features/questions/model";
import { validateWorkspaceContent } from "../../../../features/workspace/content";
import { recordAudit } from "../../../../lib/auth/audit";
import { requireUser } from "../../../../lib/auth/session";
import { readProjectContent } from "../../../../lib/workspace/content";
import { projectAccessResponse } from "../../../../lib/projects/access";
import { requireWorkspaceProject } from "../../../../lib/workspace/project-access";
import { readProjectQuestions } from "../../../../lib/workspace/questions";

export async function PUT(request: Request) {
  const actor = await requireUser();
  let access;
  try { access = await requireWorkspaceProject(actor, request, "edit-content"); }
  catch (error) { return projectAccessResponse(error) ?? NextResponse.json({ error: "请选择项目。" }, { status: 400 }); }
  const project = access.project;
  const payload = await request.json() as { mode?: unknown; documents?: unknown; entries?: unknown; questions?: unknown; questionComments?: unknown; questionExperimentLinks?: unknown };
  if (payload.mode !== "replace" && payload.mode !== "if-empty") return NextResponse.json({ error: "内容迁移模式无效。" }, { status: 400 });
  const storedPlans = await db.select({ id: plans.id }).from(plans).where(eq(plans.projectId, project.id));
  let content; let questionData;
  try {
    const planIds = new Set(storedPlans.map((plan) => plan.id));
    content = validateWorkspaceContent(payload, planIds);
    questionData = validateQuestionBackup({ questions: payload.questions ?? [], questionComments: payload.questionComments ?? [], questionExperimentLinks: payload.questionExperimentLinks ?? [] }, planIds);
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "工作区内容无效。" }, { status: 400 }); }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${project.id}:content`}))`);
      if (payload.mode === "if-empty") {
        const documentCount = await tx.select({ count: sql<number>`count(*)::int` }).from(documents).where(eq(documents.projectId, project.id));
        const entryCount = await tx.select({ count: sql<number>`count(*)::int` }).from(entries).where(eq(entries.projectId, project.id));
        const questionCount = await tx.select({ count: sql<number>`count(*)::int` }).from(questions).where(eq(questions.projectId, project.id));
        if ((documentCount[0]?.count ?? 0) > 0 || (entryCount[0]?.count ?? 0) > 0 || (questionCount[0]?.count ?? 0) > 0) throw new Error("CONTENT_NOT_EMPTY");
      }
      await tx.delete(questions).where(eq(questions.projectId, project.id));
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
      if (questionData.questions.length) await tx.insert(questions).values(questionData.questions.map((question) => ({
        key: `${project.id}:${question.id}`, id: question.id, projectId: project.id,
        sourcePlanKey: `${project.id}:${question.sourcePlanId}`, sourcePlanId: question.sourcePlanId, number: question.number,
        title: question.title, context: question.context, sourceExcerpt: question.sourceExcerpt, status: question.status, resolution: question.resolution,
        createdBy: actor.id, resolvedBy: question.status === "已解决" || question.status === "已搁置" ? actor.id : null,
        resolvedAt: question.status === "已解决" || question.status === "已搁置" ? new Date() : null,
      })));
      if (questionData.questionComments.length) await tx.insert(questionComments).values(questionData.questionComments.map((comment) => ({
        key: `${project.id}:${comment.id}`, id: comment.id, projectId: project.id,
        questionKey: `${project.id}:${comment.questionId}`, questionId: comment.questionId, content: comment.content,
        createdBy: actor.id, updatedBy: actor.id, deletedAt: comment.deletedAt ? new Date(comment.deletedAt) : null,
      })));
      if (questionData.questionExperimentLinks.length) await tx.insert(questionExperimentLinks).values(questionData.questionExperimentLinks.map((link) => ({
        key: `${project.id}:${link.questionId}:${link.planId}`, projectId: project.id,
        questionKey: `${project.id}:${link.questionId}`, questionId: link.questionId,
        planKey: `${project.id}:${link.planId}`, planId: link.planId, outcome: link.outcome, note: link.note, createdBy: actor.id,
      })));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_NOT_EMPTY") return NextResponse.json({ error: "团队服务器已有文档或事件，未覆盖现有内容。", code: "CONTENT_NOT_EMPTY" }, { status: 409 });
    throw error;
  }
  await recordAudit({ action: "workspace.content_replaced", targetType: "project", targetId: project.id, projectId: project.id, actorUserId: actor.id, teamId: actor.teamId, metadata: { documents: Object.keys(content.documents).length, entries: content.entries.length, emergencyReason: access.emergencyReason } });
  const [nextContent, nextQuestions] = await Promise.all([readProjectContent(project.id), readProjectQuestions(project.id)]);
  return NextResponse.json({ ...nextContent, ...nextQuestions });
}
