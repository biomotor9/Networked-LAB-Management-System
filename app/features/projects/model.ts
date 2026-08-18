export const projectStatuses = ["筹备中", "进行中", "暂停", "已完成"] as const;
export const projectRoles = ["lead", "member", "viewer"] as const;

export type ProjectStatus = typeof projectStatuses[number];
export type ProjectRole = typeof projectRoles[number];

export type ProjectMember = {
  userId: string;
  displayName: string;
  email: string;
  role: ProjectRole;
  disabled: boolean;
};

export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  archivedAt: string | null;
  startDate: string | null;
  endDate: string | null;
  tags: string[];
  version: number;
  lead: { userId: string; displayName: string };
  accessRole: "team-admin" | ProjectRole;
  projectRole: ProjectRole | null;
  updatedAt: string;
};

export type ProjectDetail = ProjectSummary & {
  members: ProjectMember[];
  completedAt: string | null;
  createdAt: string;
};

export function normalizeProjectName(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}

export function validateProjectName(value: unknown): { name: string; normalizedName: string } {
  if (typeof value !== "string") throw new Error("请输入项目名称。");
  const name = value.trim();
  if (!name) throw new Error("请输入项目名称。");
  if (name.length > 200) throw new Error("项目名称不能超过 200 个字符。");
  return { name, normalizedName: normalizeProjectName(name) };
}

export function validateProjectDescription(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > 20000) throw new Error("项目描述不能超过 20000 个字符。");
  return value;
}

export function validateProjectStatus(value: unknown): ProjectStatus {
  if (!projectStatuses.includes(value as ProjectStatus)) throw new Error("项目状态无效。");
  return value as ProjectStatus;
}

export function validateProjectDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label}无效。`);
  return value;
}

export function validateProjectTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("项目标签格式无效。");
  const tags = value.map((tag) => typeof tag === "string" ? tag.trim() : "").filter(Boolean);
  if (tags.length > 100 || tags.some((tag) => tag.length > 100)) throw new Error("项目标签过多或过长。");
  return Array.from(new Set(tags));
}
