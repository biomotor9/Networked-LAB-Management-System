import { normalizeStatus, type BackupFile, type WorkspaceData } from "./workspace-schema";
import { questionAnswerFromLinks } from "../questions/model";
import { verificationOutcomes } from "../workspace/model";

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export interface WorkspaceRepository {
  load(): Promise<WorkspaceData | null>;
  save(data: WorkspaceData): Promise<void>;
}

export const WORKSPACE_STORAGE_KEY = "eln-plan-demo-v3";

export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = WORKSPACE_STORAGE_KEY,
  ) {}

  async load(): Promise<WorkspaceData | null> {
    const saved = this.storage.getItem(this.key);
    return saved ? readWorkspaceData(JSON.parse(saved)) : null;
  }

  async save(data: WorkspaceData): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify(data));
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readWorkspaceData(value: unknown): WorkspaceData {
  const root = isObject(value) && value.format === "atlas-eln-backup" ? value.data : value;
  if (!isObject(root) || !Array.isArray(root.plans) || !Array.isArray(root.entries)) {
    throw new Error("这不是有效的 Atlas ELN 备份文件。");
  }
  const plans = root.plans as WorkspaceData["plans"];
  const entries = root.entries as WorkspaceData["entries"];
  const questionExperimentLinks = Array.isArray(root.questionExperimentLinks) ? root.questionExperimentLinks as WorkspaceData["questionExperimentLinks"] : [];
  if (plans.some((plan) => !isObject(plan) || typeof plan.id !== "string" || typeof plan.title !== "string")) {
    throw new Error("备份中的实验计划格式无效。");
  }
  if (entries.some((entry) => !isObject(entry) || typeof entry.id !== "string" || typeof entry.planId !== "string")) {
    throw new Error("备份中的实验记录格式无效。");
  }
  return {
    plans: plans.map((plan) => ({ ...plan, status: normalizeStatus(plan.status) })),
    entries,
    dependencies: Array.isArray(root.dependencies) ? root.dependencies as WorkspaceData["dependencies"] : [],
    graphExpanded: Array.isArray(root.graphExpanded) ? root.graphExpanded.filter((id): id is string => typeof id === "string") : [],
    viewStates: isObject(root.viewStates) ? root.viewStates as WorkspaceData["viewStates"] : {},
    notebookDocs: isObject(root.notebookDocs) ? root.notebookDocs as WorkspaceData["notebookDocs"] : {},
    questions: Array.isArray(root.questions) ? (root.questions as WorkspaceData["questions"]).map((question) => {
      const answerOutcome = (question as unknown as { answerOutcome?: unknown }).answerOutcome;
      if (verificationOutcomes.includes(answerOutcome as WorkspaceData["questions"][number]["answerOutcome"])) {
        return { ...question, answerNote: typeof question.answerNote === "string" ? question.answerNote : "" };
      }
      return { ...question, ...questionAnswerFromLinks(question.id, questionExperimentLinks) };
    }) : [],
    questionComments: Array.isArray(root.questionComments) ? root.questionComments as WorkspaceData["questionComments"] : [],
    questionExperimentLinks,
  };
}

export function createBackup(data: WorkspaceData, exportedAt = new Date().toISOString()): BackupFile {
  return { format: "atlas-eln-backup", version: 3, exportedAt, data };
}

export function readBackupFile(value: unknown): WorkspaceData {
  if (isObject(value) && value.format === "atlas-eln-backup" && value.version !== 1 && value.version !== 2 && value.version !== 3) {
    throw new Error("该备份版本暂不受支持。");
  }
  return readWorkspaceData(value);
}
