import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../../../db";
import { attachments, dependencies, documents, entries, plans, projects } from "../../../../../../../db/schema";
import { collectDescendantIds } from "../../../../../../features/plans/plan-tree";
import type { Plan } from "../../../../../../features/workspace/model";
import { recordAudit } from "../../../../../../lib/auth/audit";
import { requireUser } from "../../../../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../../../../lib/projects/access";

type Context = { params: Promise<{ projectId: string; planId: string }> };

export async function POST(request: Request, context: Context) {
  const actor = await requireUser(); const { projectId, planId } = await context.params;
  const payload = await request.json() as { targetProjectId?: unknown; sourceVersion?: unknown; targetVersion?: unknown };
  if (typeof payload.targetProjectId !== "string" || payload.targetProjectId === projectId) return NextResponse.json({ error: "请选择其他目标项目。" }, { status: 400 });
  if (!Number.isInteger(payload.sourceVersion) || !Number.isInteger(payload.targetVersion)) return NextResponse.json({ error: "缺少有效项目版本。" }, { status: 400 });
  try {
    const [sourceAccess, targetAccess] = await Promise.all([requireProjectAccess(actor, projectId, "manage"), requireProjectAccess(actor, payload.targetProjectId, "manage")]);
    if (sourceAccess.project.archivedAt || targetAccess.project.archivedAt) return NextResponse.json({ error: "不能移入或移出归档项目。" }, { status: 409 });
  } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }

  const sourcePlans = await db.select().from(plans).where(eq(plans.projectId, projectId));
  if (!sourcePlans.some((plan) => plan.id === planId)) return NextResponse.json({ error: "计划不存在。" }, { status: 404 });
  const planShape: Plan[] = sourcePlans.map((plan) => ({
    id: plan.id, parentId: plan.parentId, title: plan.title, domain: plan.domain as Plan["domain"], status: plan.status as Plan["status"],
    summary: plan.summary, objective: plan.objective, success: plan.success, tags: plan.tags, updatedAt: plan.updatedAt.toISOString(),
  }));
  const subtreeIds = collectDescendantIds(planShape, planId);
  const ids = Array.from(subtreeIds);
  const sourceDependencies = await db.select().from(dependencies).where(eq(dependencies.projectId, projectId));
  const external = sourceDependencies.filter((dependency) => subtreeIds.has(dependency.sourcePlanId) !== subtreeIds.has(dependency.targetPlanId));
  if (external.length) return NextResponse.json({ error: "计划子树与外部计划仍有执行依赖，请先解除后再移动。", dependencies: external.map((dependency) => dependency.id) }, { status: 409 });
  const destinationConflicts = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.projectId, payload.targetProjectId), inArray(plans.id, ids)));
  if (destinationConflicts.length) return NextResponse.json({ error: "目标项目存在相同计划 ID，无法移动。" }, { status: 409 });

  const [movingDocuments, movingEntries, movingAttachments] = await Promise.all([
    db.select().from(documents).where(and(eq(documents.projectId, projectId), inArray(documents.planId, ids))),
    db.select().from(entries).where(and(eq(entries.projectId, projectId), inArray(entries.planId, ids))),
    db.select().from(attachments).where(and(eq(attachments.projectId, projectId), inArray(attachments.planId, ids))),
  ]);
  const movingPlans = sourcePlans.filter((plan) => subtreeIds.has(plan.id));
  const internalDependencies = sourceDependencies.filter((dependency) => subtreeIds.has(dependency.sourcePlanId) && subtreeIds.has(dependency.targetPlanId));

  try {
    await db.transaction(async (tx) => {
      const lockIds = [projectId, payload.targetProjectId as string].sort();
      for (const id of lockIds) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
      const [sourceUpdated] = await tx.update(projects).set({ version: Number(payload.sourceVersion) + 1, updatedAt: new Date() })
        .where(and(eq(projects.id, projectId), eq(projects.version, Number(payload.sourceVersion)))).returning({ id: projects.id });
      const [targetUpdated] = await tx.update(projects).set({ version: Number(payload.targetVersion) + 1, updatedAt: new Date() })
        .where(and(eq(projects.id, payload.targetProjectId as string), eq(projects.version, Number(payload.targetVersion)))).returning({ id: projects.id });
      if (!sourceUpdated || !targetUpdated) throw new Error("VERSION_CONFLICT");

      await tx.insert(plans).values(movingPlans.map((plan) => ({
        ...plan, key: `${payload.targetProjectId}:${plan.id}`, projectId: payload.targetProjectId as string,
        parentId: plan.id === planId ? null : plan.parentId,
      })));
      for (const document of movingDocuments) await tx.update(documents).set({ key: `${payload.targetProjectId}:${document.planId}`, projectId: payload.targetProjectId as string }).where(eq(documents.key, document.key));
      for (const entry of movingEntries) await tx.update(entries).set({ key: `${payload.targetProjectId}:${entry.id}`, projectId: payload.targetProjectId as string, planKey: `${payload.targetProjectId}:${entry.planId}` }).where(eq(entries.key, entry.key));
      for (const attachment of movingAttachments) await tx.update(attachments).set({ key: `${payload.targetProjectId}:${attachment.id}`, projectId: payload.targetProjectId as string, planKey: `${payload.targetProjectId}:${attachment.planId}` }).where(eq(attachments.key, attachment.key));
      for (const dependency of internalDependencies) await tx.update(dependencies).set({ key: `${payload.targetProjectId}:${dependency.id}`, projectId: payload.targetProjectId as string }).where(eq(dependencies.key, dependency.key));
      await tx.delete(plans).where(and(eq(plans.projectId, projectId), inArray(plans.id, ids)));
    });
  } catch (error) {
    if (error instanceof Error && error.message === "VERSION_CONFLICT") return NextResponse.json({ error: "源项目或目标项目已被其他成员更新，请重新加载。", code: "VERSION_CONFLICT" }, { status: 409 });
    throw error;
  }
  await Promise.all([
    recordAudit({ action: "plan.subtree_moved_out", targetType: "plan", targetId: planId, projectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { targetProjectId: payload.targetProjectId, plans: ids.length } }),
    recordAudit({ action: "plan.subtree_moved_in", targetType: "plan", targetId: planId, projectId: payload.targetProjectId, actorUserId: actor.id, teamId: actor.teamId, metadata: { sourceProjectId: projectId, plans: ids.length } }),
  ]);
  return NextResponse.json({ moved: true, planIds: ids, sourceVersion: Number(payload.sourceVersion) + 1, targetVersion: Number(payload.targetVersion) + 1 });
}
