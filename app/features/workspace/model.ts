export type Status = "等待" | "持续关注" | "紧急" | "未开始" | "进行中" | "已完成" | "终止";
export type Domain = "机器学习" | "湿实验" | "软件" | "硬件" | "综合";
export type EntryType = "计划" | "过程" | "结果" | "分析" | "决策";
export type ArrowStyle = "虚线箭头" | "实线箭头" | "双向箭头" | "无箭头直线";

export type Plan = {
  id: string;
  parentId: string | null;
  title: string;
  domain: Domain;
  status: Status;
  summary: string;
  objective: string;
  success: string;
  tags: string[];
  updatedAt: string;
  plannedCompletionDate?: string;
  completedAt?: string;
  graphX?: number;
  graphY?: number;
};

export type Entry = {
  id: string;
  planId: string;
  date: string;
  type: EntryType;
  title: string;
  content: string;
  version?: number;
};

export type ServerDocument = {
  content: string;
  version: number;
  updatedAt: string;
};

export type Attachment = {
  id: string;
  planId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  contentUrl: string;
};

export type Dependency = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  arrowStyle?: ArrowStyle;
};

export type ViewportState = { x: number; y: number; zoom: number };

export type WorkspaceData = {
  plans: Plan[];
  entries: Entry[];
  dependencies: Dependency[];
  graphExpanded: string[];
  viewStates: Record<string, ViewportState>;
  notebookDocs: Record<string, string>;
};

export const statuses: Status[] = ["等待", "持续关注", "紧急", "未开始", "进行中", "已完成", "终止"];
export const domains: Domain[] = ["机器学习", "湿实验", "软件", "硬件", "综合"];
export const entryTypes: EntryType[] = ["计划", "过程", "结果", "分析", "决策"];
export const arrowStyles: ArrowStyle[] = ["虚线箭头", "实线箭头", "双向箭头", "无箭头直线"];

export function normalizeStatus(value: unknown): Status {
  if (value === "计划终止") return "终止";
  return statuses.includes(value as Status) ? value as Status : "未开始";
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultNextStatus(status: Status): Status {
  if (status === "未开始") return "进行中";
  if (status === "进行中" || status === "紧急" || status === "持续关注") return "已完成";
  return "进行中";
}
