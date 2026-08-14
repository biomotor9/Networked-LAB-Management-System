import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { dependencies as dependencyRows, plans as planRows } from "../../../db/schema";
import type { Dependency, Plan } from "../../features/workspace/model";

export async function readProjectSnapshot(projectId: string): Promise<{ plans: Plan[]; dependencies: Dependency[] }> {
  const [storedPlans, storedDependencies] = await Promise.all([
    db.select().from(planRows).where(eq(planRows.projectId, projectId)),
    db.select().from(dependencyRows).where(eq(dependencyRows.projectId, projectId)),
  ]);
  return {
    plans: storedPlans.map((plan) => ({
      id: plan.id, parentId: plan.parentId, title: plan.title, domain: plan.domain as Plan["domain"], status: plan.status as Plan["status"],
      summary: plan.summary, objective: plan.objective, success: plan.success, tags: plan.tags, updatedAt: plan.updatedAt.toISOString(),
      plannedCompletionDate: plan.plannedCompletionDate ?? undefined, completedAt: plan.completedAt ?? undefined,
      graphX: plan.graphX ?? undefined, graphY: plan.graphY ?? undefined,
    })),
    dependencies: storedDependencies.map((dependency) => ({ id: dependency.id, sourceId: dependency.sourcePlanId, targetId: dependency.targetPlanId, label: dependency.label ?? undefined, arrowStyle: dependency.arrowStyle as Dependency["arrowStyle"] })),
  };
}
