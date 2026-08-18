import type { ProjectRole } from "./model";

export type ProjectPermission = "view" | "edit-content" | "manage" | "delete-nonempty";

export function hasProjectPermission(input: {
  permission: ProjectPermission;
  teamAdmin: boolean;
  projectRole: ProjectRole | null;
  archived: boolean;
  emergencyEdit: boolean;
}): boolean {
  const member = input.projectRole !== null;
  if (input.permission === "view") return input.teamAdmin || member;
  if (input.permission === "manage") return input.teamAdmin || input.projectRole === "lead";
  if (input.permission === "delete-nonempty") return input.teamAdmin;
  if (input.archived) return false;
  return input.projectRole === "lead" || input.projectRole === "member" || (input.teamAdmin && input.emergencyEdit);
}
