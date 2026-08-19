import "server-only";

import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { questionComments, questionExperimentLinks, questions, users } from "../../../db/schema";
import type { Question, QuestionComment, QuestionExperimentLink } from "../../features/workspace/model";

export type ProjectQuestions = {
  questions: Question[];
  questionComments: QuestionComment[];
  questionExperimentLinks: QuestionExperimentLink[];
};

export async function readProjectQuestions(projectId: string): Promise<ProjectQuestions> {
  const [storedQuestions, storedComments, storedLinks] = await Promise.all([
    db.select().from(questions).where(eq(questions.projectId, projectId)).orderBy(asc(questions.number)),
    db.select().from(questionComments).where(eq(questionComments.projectId, projectId)).orderBy(asc(questionComments.createdAt)),
    db.select().from(questionExperimentLinks).where(eq(questionExperimentLinks.projectId, projectId)).orderBy(asc(questionExperimentLinks.createdAt)),
  ]);
  const userIds = Array.from(new Set([
    ...storedQuestions.flatMap((question) => [question.createdBy, question.resolvedBy]),
    ...storedComments.map((comment) => comment.createdBy),
  ].filter((id): id is string => Boolean(id))));
  const storedUsers = userIds.length
    ? await db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, userIds))
    : [];
  const names = new Map(storedUsers.map((user) => [user.id, user.displayName]));
  return {
    questions: storedQuestions.map((question) => ({
      id: question.id,
      sourcePlanId: question.sourcePlanId,
      number: question.number,
      title: question.title,
      context: question.context,
      sourceExcerpt: question.sourceExcerpt,
      status: question.status,
      resolution: question.resolution,
      version: question.version,
      createdById: question.createdBy,
      createdByName: question.createdBy ? names.get(question.createdBy) ?? "已移除成员" : "已移除成员",
      resolvedByName: question.resolvedBy ? names.get(question.resolvedBy) ?? "已移除成员" : undefined,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
    })),
    questionComments: storedComments.map((comment) => ({
      id: comment.id,
      questionId: comment.questionId,
      content: comment.deletedAt ? "" : comment.content,
      version: comment.version,
      createdById: comment.createdBy,
      createdByName: comment.createdBy ? names.get(comment.createdBy) ?? "已移除成员" : "已移除成员",
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      deletedAt: comment.deletedAt?.toISOString(),
    })),
    questionExperimentLinks: storedLinks.map((link) => ({
      questionId: link.questionId,
      planId: link.planId,
      outcome: link.outcome,
      note: link.note,
      version: link.version,
    })),
  };
}

export async function readQuestionBundle(projectId: string, questionId: string): Promise<ProjectQuestions> {
  const data = await readProjectQuestions(projectId);
  return {
    questions: data.questions.filter((question) => question.id === questionId),
    questionComments: data.questionComments.filter((comment) => comment.questionId === questionId),
    questionExperimentLinks: data.questionExperimentLinks.filter((link) => link.questionId === questionId),
  };
}
