import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "../../../../db";
import { projectMembers, projects, users } from "../../../../db/schema";
import { requireUser } from "../../../lib/auth/session";
import { projectAccessResponse, requireProjectAccess } from "../../../lib/projects/access";
import { readProjectContent } from "../../../lib/workspace/content";
import { readProjectSnapshot } from "../../../lib/workspace/snapshot";
import { readProjectQuestions } from "../../../lib/workspace/questions";

export async function GET(request: Request) {
  const actor = await requireUser();
  const url = new URL(request.url); const scope = url.searchParams.get("scope"); const projectId = url.searchParams.get("projectId");
  let selectedProjects;
  if (scope === "team") {
    if (actor.role !== "owner") return NextResponse.json({ error: "只有团队管理员可以导出全部项目。" }, { status: 403 });
    selectedProjects = await db.select().from(projects).where(eq(projects.teamId, actor.teamId));
  } else {
    if (!projectId) return NextResponse.json({ error: "请选择项目。" }, { status: 400 });
    let access;
    try { access = await requireProjectAccess(actor, projectId, "view"); } catch (error) { return projectAccessResponse(error) ?? Promise.reject(error); }
    if (!access.isTeamAdmin && access.projectRole !== "lead" && access.projectRole !== "member") return NextResponse.json({ error: "只读成员不能导出项目。" }, { status: 403 });
    selectedProjects = [access.project];
  }
  const ids = selectedProjects.map((project) => project.id);
  const memberships = ids.length ? await db.select({ projectId: projectMembers.projectId, email: users.email, role: projectMembers.role })
    .from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId)).where(inArray(projectMembers.projectId, ids)) : [];
  const data = await Promise.all(selectedProjects.map(async (project) => {
    const [snapshot, content, questionData] = await Promise.all([readProjectSnapshot(project.id), readProjectContent(project.id), readProjectQuestions(project.id)]);
    return {
      project: {
        name: project.name, description: project.description, status: project.status, startDate: project.startDate,
        endDate: project.endDate, tags: project.tags, archivedAt: project.archivedAt?.toISOString() ?? null,
      },
      members: memberships.filter((membership) => membership.projectId === project.id).map(({ email, role }) => ({ email, role })),
      plans: snapshot.plans, dependencies: snapshot.dependencies,
      documents: Object.fromEntries(Object.entries(content.documents).map(([planId, document]) => [planId, document.content])),
      entries: content.entries,
      questions: questionData.questions,
      questionComments: questionData.questionComments,
      questionExperimentLinks: questionData.questionExperimentLinks,
    };
  }));
  return NextResponse.json({ format: "atlas-eln-project-backup", version: 3, scope: scope === "team" ? "team" : "project", exportedAt: new Date().toISOString(), includesAttachments: false, projects: data });
}
