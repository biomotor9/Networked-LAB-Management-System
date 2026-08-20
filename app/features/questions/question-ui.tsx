"use client";

import { FormEvent, useState } from "react";
import { questionAnswerOutcome, questionCode } from "./model";
import {
  questionStatuses,
  verificationOutcomes,
  type Domain,
  type Plan,
  type Question,
  type QuestionComment,
  type QuestionExperimentLink,
  type QuestionStatus,
  type VerificationOutcome,
} from "../workspace/model";

export function QuestionAnswerIndicator({ outcome }: { outcome: VerificationOutcome }) {
  const symbols: Record<VerificationOutcome, string> = { 待回填: "?", 支持: "✓", 否定: "×", 不确定: "—" };
  return <span className={`question-answer-indicator answer-${outcome}`} aria-label={`问题回答：${outcome}`} title={`问题回答：${outcome}`}>{symbols[outcome]}</span>;
}

export function QuestionSummaryList({ questions, comments, links, onSelect, compact = false }: {
  questions: Question[];
  comments: QuestionComment[];
  links: QuestionExperimentLink[];
  onSelect: (questionId: string) => void;
  compact?: boolean;
}) {
  return questions.length > 0 ? <div className={`question-list-items ${compact ? "compact" : ""}`}>{questions.map((question) => {
    const commentCount = comments.filter((comment) => comment.questionId === question.id && !comment.deletedAt).length;
    const experimentCount = links.filter((link) => link.questionId === question.id).length;
    return <button type="button" className="question-list-item" key={question.id} onClick={() => onSelect(question.id)}>
      <span className={`question-status-dot status-${question.status}`} aria-label={`问题状态：${question.status}`} title={`问题状态：${question.status}`} />
      <span><strong>{questionCode(question.number)} · {question.title}</strong><small>{question.status} · {commentCount} 条讨论{experimentCount ? ` · ${experimentCount} 个验证实验` : ""}</small></span>
      <QuestionAnswerIndicator outcome={questionAnswerOutcome(question)} />
    </button>;
  })}</div> : <p className="question-list-empty">尚未记录问题。实验完成后可在这里保留待解答或待验证事项。</p>;
}

export function QuestionList({
  planId, questions, comments, links, canEdit, onSelect, onCreate,
}: {
  planId: string;
  questions: Question[];
  comments: QuestionComment[];
  links: QuestionExperimentLink[];
  canEdit: boolean;
  onSelect: (questionId: string) => void;
  onCreate: (planId: string) => void;
}) {
  const planQuestions = questions.filter((question) => question.sourcePlanId === planId);
  return <section className="question-list-section" aria-label="问题记录">
    <div className="question-list-head"><div><h3>问题记录</h3><span>{planQuestions.length}</span></div>{canEdit && <button type="button" onClick={() => onCreate(planId)}>＋ 记录问题</button>}</div>
    <QuestionSummaryList questions={planQuestions} comments={comments} links={links} onSelect={onSelect} />
  </section>;
}

export function QuestionCreateDialog({ planTitle, sourceExcerpt, onClose, onSubmit }: {
  planTitle: string;
  sourceExcerpt: string;
  onClose: () => void;
  onSubmit: (input: { title: string; context: string; sourceExcerpt: string }) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setSaving(true);
    const data = new FormData(event.currentTarget);
    try { await onSubmit({ title: String(data.get("title") || ""), context: String(data.get("context") || ""), sourceExcerpt: String(data.get("sourceExcerpt") || "") }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "问题保存失败。"); setSaving(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal question-create-modal" role="dialog" aria-modal="true" aria-labelledby="question-create-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-head"><div><p>RESEARCH QUESTION</p><h2 id="question-create-title">记录实验问题</h2></div><button className="icon-button" aria-label="关闭" onClick={onClose}>×</button></div>
    <p className="question-source-plan">来源实验：<strong>{planTitle}</strong></p>
    <form onSubmit={(event) => void submit(event)}>
      <label>问题标题<input name="title" autoFocus required maxLength={300} placeholder="例如：低温组信号升高是否由批次差异造成？" /></label>
      <label>问题背景<textarea name="context" rows={5} maxLength={20000} placeholder="记录观察、疑点、已有解释和需要补充的信息" /></label>
      <label>正文来源摘录<textarea name="sourceExcerpt" rows={sourceExcerpt ? 4 : 2} maxLength={5000} defaultValue={sourceExcerpt} placeholder="从 Markdown 正文选择文字后记录问题，会自动带入这里" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "正在保存…" : "保存问题"}</button></div>
    </form>
  </section></div>;
}

export function QuestionDetailDrawer({
  question, comments, links, plans, canEdit, actorId, onClose, onUpdate, onUpdateAnswer, onAddComment, onEditComment, onDeleteComment, onCreateExperiment,
}: {
  question: Question;
  comments: QuestionComment[];
  links: QuestionExperimentLink[];
  plans: Plan[];
  canEdit: boolean;
  actorId: string | null;
  onClose: () => void;
  onUpdate: (patch: { title: string; context: string; status: QuestionStatus; resolution: string }) => Promise<void>;
  onUpdateAnswer: (answerOutcome: VerificationOutcome, answerNote: string) => Promise<void>;
  onAddComment: (content: string) => Promise<void>;
  onEditComment: (comment: QuestionComment, content: string) => Promise<void>;
  onDeleteComment: (comment: QuestionComment) => Promise<void>;
  onCreateExperiment: (input: { title: string; domain: Domain; summary: string; plannedCompletionDate?: string }) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showExperimentForm, setShowExperimentForm] = useState(false);
  const activeComments = comments.filter((comment) => comment.questionId === question.id);
  const activeLinks = links.filter((link) => link.questionId === question.id);
  const submitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setSaving(true); const data = new FormData(event.currentTarget);
    try { await onUpdate({ title: String(data.get("title") || ""), context: String(data.get("context") || ""), status: data.get("status") as QuestionStatus, resolution: String(data.get("resolution") || "") }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "问题保存失败。"); }
    finally { setSaving(false); }
  };
  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); const form = event.currentTarget; const data = new FormData(form);
    try { await onAddComment(String(data.get("content") || "")); form.reset(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "讨论保存失败。"); }
  };
  const createExperiment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setSaving(true); const data = new FormData(event.currentTarget);
    try {
      await onCreateExperiment({ title: String(data.get("title") || ""), domain: data.get("domain") as Domain, summary: String(data.get("summary") || ""), plannedCompletionDate: String(data.get("plannedCompletionDate") || "") || undefined });
      setShowExperimentForm(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "验证实验创建失败。"); }
    finally { setSaving(false); }
  };
  return <aside className="drawer question-detail-drawer" aria-label={`${questionCode(question.number)} 问题详情`}>
    <div className="drawer-head"><div><p>{questionCode(question.number)} · {question.status}</p><h2>{question.title}</h2></div><button className="icon-button" aria-label="关闭问题详情" onClick={onClose}>×</button></div>
    <div className="question-detail-body">
      <form className="question-edit-form" key={`${question.id}:${question.version}`} onSubmit={(event) => void submitQuestion(event)}>
        <label>问题标题<input name="title" defaultValue={question.title} maxLength={300} disabled={!canEdit} required /></label>
        <label>问题背景<textarea name="context" rows={4} defaultValue={question.context} maxLength={20000} disabled={!canEdit} /></label>
        {question.sourceExcerpt && <blockquote><span>正文摘录</span>{question.sourceExcerpt}</blockquote>}
        <label>状态<select name="status" defaultValue={question.status} disabled={!canEdit}>{questionStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>结论摘要 / 搁置原因<textarea name="resolution" rows={4} defaultValue={question.resolution} maxLength={20000} disabled={!canEdit} placeholder="解决或搁置问题时必须填写" /></label>
        <small>由 {question.createdByName} 创建 · {new Date(question.createdAt).toLocaleString("zh-CN")}</small>
        {canEdit && <button className="primary-button" type="submit" disabled={saving}>{saving ? "正在保存…" : "保存问题"}</button>}
      </form>

      <section className="question-verification-section"><div className="question-section-title"><h3>问题回答</h3>{canEdit && <button type="button" onClick={() => setShowExperimentForm((visible) => !visible)}>＋ 创建验证实验</button>}</div>
        <QuestionAnswerEditor question={question} canEdit={canEdit} onSave={onUpdateAnswer} onError={setError} />
        {showExperimentForm && <form className="question-experiment-form" onSubmit={(event) => void createExperiment(event)}>
          <label>实验名称<input name="title" required maxLength={300} defaultValue={`验证：${question.title}`} /></label>
          <label>领域<select name="domain" defaultValue={plans.find((plan) => plan.id === question.sourcePlanId)?.domain ?? "综合"}>{["机器学习", "湿实验", "软件", "硬件", "综合"].map((domain) => <option key={domain}>{domain}</option>)}</select></label>
          <label>简要说明<textarea name="summary" rows={3} defaultValue={`验证问题 ${questionCode(question.number)}：${question.title}\n\n${question.context}`} maxLength={20000} /></label>
          <label>计划完成日期<input name="plannedCompletionDate" type="date" /></label>
          <div><button type="button" onClick={() => setShowExperimentForm(false)}>取消</button><button className="primary-button" disabled={saving}>创建并建立溯源</button></div>
        </form>}
        {activeLinks.length > 0 && <p className="question-verification-trace">已关联验证实验：{activeLinks.map((link) => plans.find((plan) => plan.id === link.planId)?.title ?? "已移除实验").join("、")}</p>}
      </section>

      <section className="question-discussion-section"><div className="question-section-title"><h3>讨论</h3><span>{activeComments.filter((comment) => !comment.deletedAt).length}</span></div>
        <div className="question-comment-list">{activeComments.map((comment) => <article className={comment.deletedAt ? "deleted" : ""} key={comment.id}>
          <header><strong>{comment.createdByName}</strong><time>{new Date(comment.createdAt).toLocaleString("zh-CN")}</time></header>
          <p>{comment.deletedAt ? "该讨论已由作者删除。" : comment.content}</p>
          {canEdit && !comment.deletedAt && comment.createdById === actorId && <div><button type="button" onClick={() => { const next = window.prompt("编辑讨论内容：", comment.content); if (next !== null && next.trim() && next.trim() !== comment.content) void onEditComment(comment, next).catch((cause) => setError(cause instanceof Error ? cause.message : "讨论修改失败。")); }}>编辑</button><button type="button" onClick={() => { if (window.confirm("删除后将保留审计占位，确定继续吗？")) void onDeleteComment(comment).catch((cause) => setError(cause instanceof Error ? cause.message : "讨论删除失败。")); }}>删除</button></div>}
        </article>)}{activeComments.length === 0 && <p className="question-list-empty">尚无讨论。</p>}</div>
        {canEdit && <form className="question-comment-form" onSubmit={(event) => void addComment(event)}><textarea name="content" rows={4} maxLength={20000} required placeholder="补充解释、证据或下一步建议" /><button className="primary-button">发表评论</button></form>}
      </section>
      {error && <p className="form-error question-error" role="alert">{error}</p>}
    </div>
  </aside>;
}

function QuestionAnswerEditor({ question, canEdit, onSave, onError }: { question: Question; canEdit: boolean; onSave: (outcome: VerificationOutcome, note: string) => Promise<void>; onError: (message: string) => void }) {
  const [outcome, setOutcome] = useState(question.answerOutcome);
  const [note, setNote] = useState(question.answerNote);
  const [saving, setSaving] = useState(false);
  return <div className="question-answer-fields"><label>回答结果<select value={outcome} disabled={!canEdit} onChange={(event) => setOutcome(event.target.value as VerificationOutcome)}>{verificationOutcomes.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label>结果说明<textarea rows={3} value={note} disabled={!canEdit} maxLength={10000} onChange={(event) => setNote(event.target.value)} /></label>
    {canEdit && <button type="button" disabled={saving || (outcome === question.answerOutcome && note === question.answerNote)} onClick={() => { setSaving(true); void onSave(outcome, note).catch((cause) => onError(cause instanceof Error ? cause.message : "问题回答保存失败。")).finally(() => setSaving(false)); }}>{saving ? "保存中…" : "保存回答"}</button>}
  </div>;
}
