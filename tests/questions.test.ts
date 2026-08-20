import assert from "node:assert/strict";
import test from "node:test";
import {
  isOpenQuestion,
  questionAnswerFromLinks,
  questionAnswerOutcome,
  questionCode,
  validateDerivedExperiment,
  validateQuestionBackup,
  validateQuestionAnswer,
  validateQuestionCreate,
  validateQuestionPatch,
  validateVerificationLink,
} from "../app/features/questions/model";

test("validates question creation and terminal status requirements", () => {
  assert.deepEqual(validateQuestionCreate({ sourcePlanId: "p1", title: "  为什么信号升高？ ", context: " 批次 A ", sourceExcerpt: " 结果段落 " }), {
    sourcePlanId: "p1", title: "为什么信号升高？", context: "批次 A", sourceExcerpt: "结果段落",
  });
  const current = { title: "为什么？", context: "背景", status: "待解答" as const, resolution: "", answerOutcome: "待回填" as const, answerNote: "" };
  assert.throws(() => validateQuestionPatch({ status: "已解决", resolution: "" }, current), /结论摘要/);
  assert.equal(validateQuestionPatch({ status: "待验证" }, current).status, "待验证");
  assert.equal(isOpenQuestion("待验证"), true);
  assert.equal(isOpenQuestion("已解决"), false);
  assert.equal(questionCode(7), "Q-007");
});

test("validates derived experiment and verification result", () => {
  assert.deepEqual(validateDerivedExperiment({ title: " 批次复测 ", domain: "湿实验", summary: "重复三次", plannedCompletionDate: "2026-08-30" }), {
    title: "批次复测", domain: "湿实验", summary: "重复三次", plannedCompletionDate: "2026-08-30",
  });
  assert.throws(() => validateDerivedExperiment({ title: "复测", domain: "未知" }), /领域/);
  assert.deepEqual(validateVerificationLink({ outcome: "不确定", note: "继续扩大样本" }), { outcome: "不确定", note: "继续扩大样本" });
  assert.deepEqual(validateQuestionAnswer({ answerOutcome: "支持", answerNote: "结果一致" }), { answerOutcome: "支持", answerNote: "结果一致" });
  assert.equal(questionAnswerOutcome({ answerOutcome: "支持" }), "支持");
  assert.deepEqual(questionAnswerFromLinks("q1", [{ questionId: "q1", outcome: "支持", note: "证据一" }]), { answerOutcome: "支持", answerNote: "证据一" });
  assert.deepEqual(questionAnswerFromLinks("q1", [{ questionId: "q1", outcome: "支持", note: "" }, { questionId: "q1", outcome: "否定", note: "证据二" }]), { answerOutcome: "不确定", answerNote: "证据二" });
});

test("validates portable question backup references", () => {
  const result = validateQuestionBackup({
    questions: [{ id: "q1", sourcePlanId: "p1", number: 1, title: "为什么？", context: "", sourceExcerpt: "", status: "待验证", resolution: "" }],
    questionComments: [{ id: "c1", questionId: "q1", content: "需要复测" }],
    questionExperimentLinks: [{ questionId: "q1", planId: "p2", outcome: "待回填", note: "" }],
  }, new Set(["p1", "p2"]));
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].answerOutcome, "待回填");
  assert.equal(result.questionComments.length, 1);
  assert.equal(result.questionExperimentLinks.length, 1);
  assert.throws(() => validateQuestionBackup({ questions: [{ id: "q1", sourcePlanId: "missing", number: 1, title: "为什么？", status: "待解答" }], questionComments: [], questionExperimentLinks: [] }, new Set(["p1"])), /不存在/);

  const legacyResult = validateQuestionBackup({
    questions: [{ id: "q2", sourcePlanId: "p1", number: 2, title: "旧问题", status: "待验证" }],
    questionComments: [],
    questionExperimentLinks: [{ questionId: "q2", planId: "p2", outcome: "支持", note: "旧验证结果" }],
  }, new Set(["p1", "p2"]));
  assert.equal(legacyResult.questions[0].answerOutcome, "支持");
  assert.equal(legacyResult.questions[0].answerNote, "旧验证结果");
});
