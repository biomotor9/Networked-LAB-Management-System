import "server-only";

import type { AuthenticatedUser } from "../auth/session";
import { requireProjectAccess, type ProjectAccess, type ProjectCapability } from "../projects/access";

export function projectIdFromRequest(request: Request): string {
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
  if (!projectId) throw new Error("PROJECT_ID_REQUIRED");
  return projectId;
}

export async function requireWorkspaceProject(actor: AuthenticatedUser, request: Request, capability: ProjectCapability): Promise<ProjectAccess> {
  return requireProjectAccess(actor, projectIdFromRequest(request), capability);
}
