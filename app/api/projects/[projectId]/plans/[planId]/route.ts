import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../../../db";
import { plans, projects } from "../../../../../../db/schema";
import { validatePlanStatusPatch } from "../../../../../features/dashboard/model";
import { recordAudit } from "../../../../../lib/auth/audit";
import { requireUser } from "../../../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../../../lib/projects/access";

type Context = { params: Promise<{ projectId: string; planId: string }> };

function currentDate(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function PATCH(request: Request, context: Context) {
  const actor = await requireUser();
  const { projectId, planId } = await context.params;
  let access;
  try { access = await requireProjectAccess(actor, projectId, "edit-content"); }
  catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }

  let payload;
  try { payload = validatePlanStatusPatch(await request.json()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "状态更新数据无效。" }, { status: 400 }); }

  let result: { status: string; previousStatus: string; planVersion: number; projectVersion: number; updatedAt: string; completedAt: string | null; changed: boolean };
  try {
    result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${projectId}))`);
      const [[currentProject], [current]] = await Promise.all([
        tx.select({ version: projects.version }).from(projects).where(eq(projects.id, projectId)).limit(1),
        tx.select({ status: plans.status, version: plans.version, completedAt: plans.completedAt })
          .from(plans).where(and(eq(plans.projectId, projectId), eq(plans.id, planId))).limit(1),
      ]);
      if (!current) throw new Error("PLAN_NOT_FOUND");
      if (!currentProject || current.version !== payload.planVersion || currentProject.version !== payload.projectVersion) throw new Error("VERSION_CONFLICT");
      if (current.status === payload.status) {
        return { status: current.status, previousStatus: current.status, planVersion: current.version, projectVersion: currentProject.version, updatedAt: new Date().toISOString(), completedAt: current.completedAt, changed: false };
      }

      const nextProjectVersion = payload.projectVersion + 1;
      const now = new Date();
      const [updatedProject] = await tx.update(projects).set({ version: nextProjectVersion, updatedAt: now })
        .where(and(eq(projects.id, projectId), eq(projects.version, payload.projectVersion))).returning({ id: projects.id });
      if (!updatedProject) throw new Error("VERSION_CONFLICT");

      const completedAt = payload.status === "已完成" && current.status !== "已完成" ? currentDate() : current.completedAt;
      const [updatedPlan] = await tx.update(plans).set({ status: payload.status, completedAt, version: payload.planVersion + 1, updatedAt: now })
        .where(and(eq(plans.projectId, projectId), eq(plans.id, planId), eq(plans.version, payload.planVersion)))
        .returning({ status: plans.status, version: plans.version, updatedAt: plans.updatedAt, completedAt: plans.completedAt });
      if (!updatedPlan) throw new Error("VERSION_CONFLICT");
      return {
        status: updatedPlan.status,
        previousStatus: current.status,
        planVersion: updatedPlan.version,
        projectVersion: nextProjectVersion,
        updatedAt: updatedPlan.updatedAt.toISOString(),
        completedAt: updatedPlan.completedAt,
        changed: true,
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAN_NOT_FOUND") return NextResponse.json({ error: "实验节点不存在或已被删除。" }, { status: 404 });
    if (error instanceof Error && error.message === "VERSION_CONFLICT") return NextResponse.json({ error: "项目已被其他成员修改，已为您重新载入看板。", code: "VERSION_CONFLICT" }, { status: 409 });
    throw error;
  }

  if (result.changed) {
    await recordAudit({
      action: "plan.status_changed",
      targetType: "plan",
      targetId: planId,
      projectId,
      actorUserId: actor.id,
      teamId: actor.teamId,
      metadata: { from: result.previousStatus, to: result.status, emergencyReason: access.emergencyReason },
    });
  }
  return NextResponse.json({ plan: result });
}
