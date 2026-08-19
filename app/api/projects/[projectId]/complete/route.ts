import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../db";
import { plans, projects, questions } from "../../../../../db/schema";
import { recordAudit } from "../../../../lib/auth/audit";
import { requireUser } from "../../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../../lib/projects/access";
import { readProjectDetail } from "../../../../lib/projects/queries";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, context: Context) {
  const actor = await requireUser();
  const { projectId } = await context.params;
  let access;
  try { access = await requireProjectAccess(actor, projectId, "manage"); }
  catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
  if (access.project.archivedAt) return NextResponse.json({ error: "请先恢复归档项目。" }, { status: 409 });
  const payload = await request.json() as { version?: unknown; confirmIncomplete?: unknown; confirmUnresolvedQuestions?: unknown };
  if (!Number.isInteger(payload.version)) return NextResponse.json({ error: "缺少有效项目版本。" }, { status: 400 });
  const incomplete = await db.select({ id: plans.id, title: plans.title, status: plans.status }).from(plans)
    .where(and(eq(plans.projectId, projectId), ne(plans.status, "已完成")));
  if (incomplete.length && payload.confirmIncomplete !== true) {
    return NextResponse.json({ error: "项目仍有未完成计划，请确认后继续。", code: "INCOMPLETE_PLANS", plans: incomplete.slice(0, 100) }, { status: 409 });
  }
  const unresolvedQuestions = await db.select({ id: questions.id, number: questions.number, title: questions.title, status: questions.status }).from(questions)
    .where(and(eq(questions.projectId, projectId), ne(questions.status, "已解决"), ne(questions.status, "已搁置")));
  if (unresolvedQuestions.length && payload.confirmUnresolvedQuestions !== true) {
    return NextResponse.json({ error: "项目仍有未解决问题，请确认后继续。", code: "UNRESOLVED_QUESTIONS", questions: unresolvedQuestions.slice(0, 100) }, { status: 409 });
  }
  const now = new Date();
  const [updated] = await db.update(projects).set({ status: "已完成", completedAt: now, completedBy: actor.id, updatedAt: now, version: Number(payload.version) + 1 })
    .where(and(eq(projects.id, projectId), eq(projects.version, Number(payload.version)))).returning({ id: projects.id });
  if (!updated) return NextResponse.json({ error: "项目已被其他成员更新，请重新加载。", code: "VERSION_CONFLICT" }, { status: 409 });
  await recordAudit({ action: "project.completed", targetType: "project", targetId: projectId, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { incompletePlans: incomplete.length, unresolvedQuestions: unresolvedQuestions.length } });
  return NextResponse.json({ project: await readProjectDetail(actor, projectId) });
}
