import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "../../../db";
import { projectMembers, projects } from "../../../db/schema";
import {
  validateProjectDate,
  validateProjectDescription,
  validateProjectName,
  validateProjectTags,
} from "../../features/projects/model";
import { recordAudit } from "../../lib/auth/audit";
import { requireUser } from "../../lib/auth/session";
import { listAccessibleProjects, readProjectDetail } from "../../lib/projects/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await requireUser();
  return NextResponse.json({ projects: await listAccessibleProjects(actor) });
}
export async function POST(request: Request) {
  const actor = await requireUser();
  const payload = await request.json() as Record<string, unknown>;
  let values;
  try {
    const { name, normalizedName } = validateProjectName(payload.name);
    values = {
      id: randomUUID(), teamId: actor.teamId, name, normalizedName,
      description: validateProjectDescription(payload.description),
      status: "筹备中" as const,
      startDate: validateProjectDate(payload.startDate, "开始日期"),
      endDate: validateProjectDate(payload.endDate, "结束日期"),
      tags: validateProjectTags(payload.tags), createdBy: actor.id,
    };
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目数据无效。" }, { status: 400 });
  }
  try {
    await db.transaction(async (tx) => {
      await tx.insert(projects).values(values);
      await tx.insert(projectMembers).values({ projectId: values.id, userId: actor.id, role: "lead", addedBy: actor.id });
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "团队内已存在同名项目。" }, { status: 409 });
    }
    throw error;
  }
  await recordAudit({ action: "project.created", targetType: "project", targetId: values.id, projectId: values.id, actorUserId: actor.id, teamId: actor.teamId, metadata: { name: values.name } });
  return NextResponse.json({ project: await readProjectDetail(actor, values.id) }, { status: 201 });
}
