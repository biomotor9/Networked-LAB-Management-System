import {
  domains,
  questionStatuses,
  verificationOutcomes,
  type Question,
  type QuestionExperimentLink,
  type QuestionComment,
  type QuestionStatus,
  type VerificationOutcome,
  type Domain,
} from "../workspace/model";

export const MAX_QUESTION_TITLE_LENGTH = 300;
export const MAX_QUESTION_CONTEXT_LENGTH = 20_000;
export const MAX_QUESTION_EXCERPT_LENGTH = 5_000;
export const MAX_QUESTION_RESOLUTION_LENGTH = 20_000;
export const MAX_QUESTION_COMMENT_LENGTH = 20_000;
export const MAX_VERIFICATION_NOTE_LENGTH = 10_000;

export function questionAnswerOutcome(questionId: string, links: QuestionExperimentLink[]): VerificationOutcome {
  const outcomes = links.filter((link) => link.questionId === questionId).map((link) => link.outcome);
  if (!outcomes.length || outcomes.includes("待回填")) return "待回填";
  return new Set(outcomes).size === 1 ? outcomes[0] : "不确定";
}

function text(value: unknown, label: string, maxLength: number, required = false): string {
  if (typeof value !== "string") throw new Error(`${label}格式无效。`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`请填写${label}。`);
  if (normalized.length > maxLength) throw new Error(`${label}超过 ${maxLength} 个字符。`);
  return normalized;
}

export function validateQuestionCreate(value: unknown): Pick<Question, "sourcePlanId" | "title" | "context" | "sourceExcerpt"> {
  if (!value || typeof value !== "object") throw new Error("问题记录格式无效。");
  const candidate = value as Record<string, unknown>;
  const sourcePlanId = text(candidate.sourcePlanId, "来源实验", 200, true);
  return {
    sourcePlanId,
    title: text(candidate.title, "问题标题", MAX_QUESTION_TITLE_LENGTH, true),
    context: text(candidate.context ?? "", "问题背景", MAX_QUESTION_CONTEXT_LENGTH),
    sourceExcerpt: text(candidate.sourceExcerpt ?? "", "来源摘录", MAX_QUESTION_EXCERPT_LENGTH),
  };
}

export function validateQuestionPatch(value: unknown, current: Pick<Question, "title" | "context" | "status" | "resolution">): Pick<Question, "title" | "context" | "status" | "resolution"> {
  if (!value || typeof value !== "object") throw new Error("问题更新格式无效。");
  const candidate = value as Record<string, unknown>;
  const status = (candidate.status ?? current.status) as QuestionStatus;
  if (!questionStatuses.includes(status)) throw new Error("问题状态无效。");
  const resolution = text(candidate.resolution ?? current.resolution, "结论摘要", MAX_QUESTION_RESOLUTION_LENGTH);
  if ((status === "已解决" || status === "已搁置") && !resolution) throw new Error(status === "已解决" ? "解决问题前请填写结论摘要。" : "搁置问题前请填写原因。");
  return {
    title: text(candidate.title ?? current.title, "问题标题", MAX_QUESTION_TITLE_LENGTH, true),
    context: text(candidate.context ?? current.context, "问题背景", MAX_QUESTION_CONTEXT_LENGTH),
    status,
    resolution,
  };
}

export function validateQuestionComment(value: unknown): string {
  return text(value, "讨论内容", MAX_QUESTION_COMMENT_LENGTH, true);
}

export function validateVerificationLink(value: unknown): Pick<QuestionExperimentLink, "outcome" | "note"> {
  if (!value || typeof value !== "object") throw new Error("验证结果格式无效。");
  const candidate = value as Record<string, unknown>;
  const outcome = candidate.outcome as VerificationOutcome;
  if (!verificationOutcomes.includes(outcome)) throw new Error("验证结果无效。");
  return { outcome, note: text(candidate.note ?? "", "结果说明", MAX_VERIFICATION_NOTE_LENGTH) };
}

export function validateDerivedExperiment(value: unknown): { title: string; domain: Domain; summary: string; plannedCompletionDate?: string } {
  if (!value || typeof value !== "object") throw new Error("验证实验格式无效。");
  const candidate = value as Record<string, unknown>;
  const domain = candidate.domain as Domain;
  if (!domains.includes(domain)) throw new Error("验证实验领域无效。");
  const plannedCompletionDate = text(candidate.plannedCompletionDate ?? "", "计划完成日期", 10);
  if (plannedCompletionDate && !/^\d{4}-\d{2}-\d{2}$/.test(plannedCompletionDate)) throw new Error("计划完成日期格式无效。");
  return {
    title: text(candidate.title, "实验名称", 300, true),
    domain,
    summary: text(candidate.summary ?? "", "实验说明", 20_000),
    plannedCompletionDate: plannedCompletionDate || undefined,
  };
}

export function questionCode(number: number): string {
  return `Q-${String(number).padStart(3, "0")}`;
}

export function isOpenQuestion(status: QuestionStatus): boolean {
  return status === "待解答" || status === "待验证";
}

export type QuestionBackupData = {
  questions: Array<Pick<Question, "id" | "sourcePlanId" | "number" | "title" | "context" | "sourceExcerpt" | "status" | "resolution">>;
  questionComments: Array<Pick<QuestionComment, "id" | "questionId" | "content" | "deletedAt">>;
  questionExperimentLinks: Array<Pick<QuestionExperimentLink, "questionId" | "planId" | "outcome" | "note">>;
};

export function validateQuestionBackup(value: unknown, allowedPlanIds: Set<string>): QuestionBackupData {
  if (value === undefined || value === null) return { questions: [], questionComments: [], questionExperimentLinks: [] };
  if (!value || typeof value !== "object") throw new Error("问题记录备份格式无效。");
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.questions) || !Array.isArray(root.questionComments) || !Array.isArray(root.questionExperimentLinks)) throw new Error("问题记录备份缺少必要列表。");
  if (root.questions.length > 50_000 || root.questionComments.length > 200_000 || root.questionExperimentLinks.length > 100_000) throw new Error("问题记录备份超过容量限制。");
  const ids = new Set<string>(); const numbers = new Set<number>();
  const parsedQuestions = root.questions.map((item) => {
    if (!item || typeof item !== "object") throw new Error("问题记录格式无效。");
    const candidate = item as Record<string, unknown>;
    const id = text(candidate.id, "问题 ID", 200, true);
    const sourcePlanId = text(candidate.sourcePlanId, "来源实验", 200, true);
    if (ids.has(id)) throw new Error("问题 ID 重复。");
    if (!allowedPlanIds.has(sourcePlanId)) throw new Error("问题引用了不存在的来源实验。");
    if (!Number.isInteger(candidate.number) || Number(candidate.number) < 1 || numbers.has(Number(candidate.number))) throw new Error("问题编号无效或重复。");
    const status = candidate.status as QuestionStatus;
    if (!questionStatuses.includes(status)) throw new Error("问题状态无效。");
    const resolution = text(candidate.resolution ?? "", "结论摘要", MAX_QUESTION_RESOLUTION_LENGTH);
    if ((status === "已解决" || status === "已搁置") && !resolution) throw new Error("已结束的问题缺少结论摘要。");
    ids.add(id); numbers.add(Number(candidate.number));
    return {
      id, sourcePlanId, number: Number(candidate.number),
      title: text(candidate.title, "问题标题", MAX_QUESTION_TITLE_LENGTH, true),
      context: text(candidate.context ?? "", "问题背景", MAX_QUESTION_CONTEXT_LENGTH),
      sourceExcerpt: text(candidate.sourceExcerpt ?? "", "来源摘录", MAX_QUESTION_EXCERPT_LENGTH),
      status, resolution,
    };
  });
  const commentIds = new Set<string>();
  const parsedComments = root.questionComments.map((item) => {
    if (!item || typeof item !== "object") throw new Error("问题讨论格式无效。");
    const candidate = item as Record<string, unknown>;
    const id = text(candidate.id, "讨论 ID", 200, true);
    const questionId = text(candidate.questionId, "问题 ID", 200, true);
    if (commentIds.has(id)) throw new Error("讨论 ID 重复。");
    if (!ids.has(questionId)) throw new Error("讨论引用了不存在的问题。");
    commentIds.add(id);
    const deletedAt = typeof candidate.deletedAt === "string" && candidate.deletedAt ? candidate.deletedAt : undefined;
    if (deletedAt && Number.isNaN(Date.parse(deletedAt))) throw new Error("讨论删除时间格式无效。");
    return { id, questionId, content: deletedAt ? "" : validateQuestionComment(candidate.content), deletedAt };
  });
  const linkPairs = new Set<string>();
  const parsedLinks = root.questionExperimentLinks.map((item) => {
    if (!item || typeof item !== "object") throw new Error("问题实验关联格式无效。");
    const candidate = item as Record<string, unknown>;
    const questionId = text(candidate.questionId, "问题 ID", 200, true);
    const planId = text(candidate.planId, "验证实验 ID", 200, true);
    if (!ids.has(questionId) || !allowedPlanIds.has(planId)) throw new Error("问题实验关联引用了不存在的记录。");
    const pair = `${questionId}\0${planId}`;
    if (linkPairs.has(pair)) throw new Error("问题实验关联重复。");
    linkPairs.add(pair);
    return { questionId, planId, ...validateVerificationLink(candidate) };
  });
  return { questions: parsedQuestions, questionComments: parsedComments, questionExperimentLinks: parsedLinks };
}
