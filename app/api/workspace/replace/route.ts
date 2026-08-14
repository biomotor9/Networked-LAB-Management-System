import { and, eq, notInArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { dependencies, plans, projects } from "../../../../db/schema";
import { validatePlanDependencySnapshot } from "../../../features/workspace/server-snapshot";
import { recordAudit } from "../../../lib/auth/audit";
import { requireUser } from "../../../lib/auth/session";
import { getOrCreateTeamProject } from "../../../lib/workspace/project-access";
import { readProjectSnapshot } from "../../../lib/workspace/snapshot";

export async function PUT(request: Request) {
  const actor = await requireUser();
  const project = await getOrCreateTeamProject(actor);
  const payload = await request.json() as { version?: unknown; plans?: unknown; dependencies?: unknown };
  if (!Number.isInteger(payload.version) || Number(payload.version) < 1) return NextResponse.json({ error: "缺少有效项目版本。" }, { status: 400 });
  let snapshot;
  try { snapshot = validatePlanDependencySnapshot(payload); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "工作区数据无效。" }, { status: 400 }); }

  const nextVersion = (payload.version as number) + 1;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${project.id}))`);
      const updated = await tx.update(projects).set({ version: nextVersion, updatedAt: new Date() }).where(sql`${projects.id} = ${project.id} and ${projects.version} = ${payload.version as number}`).returning({ id: projects.id });
      if (!updated.length) throw new Error("VERSION_CONFLICT");
      const dependencyKeys = snapshot.dependencies.map((dependency) => `${project.id}:${dependency.id}`);
      if (dependencyKeys.length) await tx.delete(dependencies).where(and(eq(dependencies.projectId, project.id), notInArray(dependencies.key, dependencyKeys)));
      else await tx.delete(dependencies).where(eq(dependencies.projectId, project.id));

      if (snapshot.plans.length) await tx.insert(plans).values(snapshot.plans.map((plan) => ({
        key: `${project.id}:${plan.id}`, id: plan.id, projectId: project.id, parentId: plan.parentId, title: plan.title, domain: plan.domain, status: plan.status,
        summary: plan.summary, objective: plan.objective, success: plan.success, tags: plan.tags,
        plannedCompletionDate: plan.plannedCompletionDate, completedAt: plan.completedAt, graphX: plan.graphX, graphY: plan.graphY,
      }))).onConflictDoUpdate({ target: plans.key, set: {
        parentId: sql`excluded.parent_id`, title: sql`excluded.title`, domain: sql`excluded.domain`, status: sql`excluded.status`,
        summary: sql`excluded.summary`, objective: sql`excluded.objective`, success: sql`excluded.success`, tags: sql`excluded.tags`,
        plannedCompletionDate: sql`excluded.planned_completion_date`, completedAt: sql`excluded.completed_at`, graphX: sql`excluded.graph_x`, graphY: sql`excluded.graph_y`,
        version: sql`${plans.version} + 1`, updatedAt: new Date(),
      }});
      const planKeys = snapshot.plans.map((plan) => `${project.id}:${plan.id}`);
      if (planKeys.length) await tx.delete(plans).where(and(eq(plans.projectId, project.id), notInArray(plans.key, planKeys)));
      else await tx.delete(plans).where(eq(plans.projectId, project.id));

      if (snapshot.dependencies.length) await tx.insert(dependencies).values(snapshot.dependencies.map((dependency) => ({ key: `${project.id}:${dependency.id}`, id: dependency.id, projectId: project.id, sourcePlanId: dependency.sourceId, targetPlanId: dependency.targetId, label: dependency.label, arrowStyle: dependency.arrowStyle }))).onConflictDoUpdate({ target: dependencies.key, set: { sourcePlanId: sql`excluded.source_plan_id`, targetPlanId: sql`excluded.target_plan_id`, label: sql`excluded.label`, arrowStyle: sql`excluded.arrow_style`, updatedAt: new Date() } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "VERSION_CONFLICT") return NextResponse.json({ error: "项目已被其他成员修改，请重新载入后再操作。", code: "VERSION_CONFLICT" }, { status: 409 });
    throw error;
  }
  await recordAudit({ action: "workspace.replaced", targetType: "project", targetId: project.id, actorUserId: actor.id, teamId: actor.teamId, metadata: { plans: snapshot.plans.length, dependencies: snapshot.dependencies.length } });
  return NextResponse.json({ project: { id: project.id, name: project.name, version: nextVersion }, ...(await readProjectSnapshot(project.id)) });
}
