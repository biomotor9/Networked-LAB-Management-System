"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Attachment } from "../workspace/model";
import { projectStatuses, type ProjectDetail, type ProjectMember } from "./model";

type TeamMember = { id: string; displayName: string; email: string; teamRole: "owner" | "member" };
type Activity = { id: string; action: string; actorName: string; createdAt: string; metadata: Record<string, unknown> };
type FormState = { name: string; description: string; status: ProjectDetail["status"]; startDate: string; endDate: string; tags: string };

const emptyForm: FormState = { name: "", description: "", status: "筹备中", startDate: "", endDate: "", tags: "" };

function formFromProject(project: ProjectDetail): FormState {
  return { name: project.name, description: project.description, status: project.status, startDate: project.startDate ?? "", endDate: project.endDate ?? "", tags: project.tags.join("、") };
}

function activityLabel(action: string): string {
  const labels: Record<string, string> = {
    "project.created": "创建了项目", "project.updated": "更新了项目信息", "project.completed": "确认项目完成",
    "project.archived": "归档了项目", "project.restored": "恢复了项目", "project.member_added": "添加或更新了项目成员",
    "project.member_removed": "移除了项目成员", "project.member_role_changed": "更改了成员权限", "project.lead_transferred": "转交了项目负责人",
    "project.emergency_edit_started": "启动了管理员应急编辑", "project.emergency_edit_ended": "结束了管理员应急编辑",
    "attachment.upload": "上传了附件", "attachment.delete": "删除了附件", "workspace.replaced": "更新了实验计划网络",
    "document.updated": "更新了实验正文", "entry.created": "创建了实验事件", "entry.updated": "更新了实验事件", "entry.deleted": "删除了实验事件",
    "question.created": "记录了实验问题", "question.updated": "更新了问题状态或结论", "question.comment_created": "参与了问题讨论",
    "question.comment_updated": "编辑了问题讨论", "question.comment_deleted": "删除了问题讨论", "question.experiment_created": "从问题创建了验证实验", "question.verification_updated": "回填了验证结果",
    "project.migrated": "由系统迁移为项目",
  };
  return labels[action] ?? action;
}

export default function ProjectDrawer({
  projectId,
  creating,
  viewerRole,
  onCreated,
  onChanged,
  onDeleted,
  onClose,
  onDirtyChange,
  onEmergencyChange,
}: {
  projectId: string | null;
  creating: boolean;
  viewerRole: "owner" | "member";
  onCreated: (project: ProjectDetail) => void;
  onChanged: (project: ProjectDetail) => void;
  onDeleted: (projectId: string) => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onEmergencyChange?: (active: boolean) => void;
}) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialForm, setInitialForm] = useState<FormState>(emptyForm);
  const [tab, setTab] = useState<"overview" | "members" | "resources">("overview");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [projectAttachments, setProjectAttachments] = useState<Attachment[]>([]);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [loading, setLoading] = useState(!creating);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    const encoded = encodeURIComponent(projectId);
    void Promise.all([
      fetch(`/api/projects/${encoded}`, { cache: "no-store", signal: controller.signal }).then((response) => response.json().then((body) => ({ response, body }))),
      fetch("/api/projects/team-members", { cache: "no-store", signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/projects/${encoded}/activity`, { cache: "no-store", signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/workspace/attachments?projectId=${encoded}`, { cache: "no-store", signal: controller.signal }).then((response) => response.json()),
      viewerRole === "owner" ? fetch(`/api/projects/${encoded}/emergency-edit`, { cache: "no-store", signal: controller.signal }).then((response) => response.json()) : Promise.resolve({ active: false }),
    ]).then(([detailResult, teamResult, activityResult, attachmentResult, emergencyResult]) => {
      if (!detailResult.response.ok || !detailResult.body.project) throw new Error(detailResult.body.error ?? "项目详情读取失败。");
      const nextProject = detailResult.body.project as ProjectDetail;
      const nextForm = formFromProject(nextProject);
      setProject(nextProject); setForm(nextForm); setInitialForm(nextForm);
      setTeamMembers(teamResult.members ?? []); setActivity(activityResult.events ?? []);
      setProjectAttachments(attachmentResult.attachments ?? []); setEmergencyActive(Boolean(emergencyResult.active)); onEmergencyChange?.(Boolean(emergencyResult.active));
    }).catch((error) => { if (error instanceof Error && error.name !== "AbortError") setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [creating, projectId, viewerRole, onEmergencyChange]);

  const canManage = project?.accessRole === "team-admin" || project?.accessRole === "lead";
  const canEditProject = Boolean(canManage && !project?.archivedAt);
  const canUpload = project?.accessRole === "lead" || project?.accessRole === "member" || emergencyActive;
  const availableMembers = useMemo(() => teamMembers.filter((candidate) => !project?.members.some((member) => member.userId === candidate.id)), [teamMembers, project]);

  const close = () => {
    if (dirty && !window.confirm("项目详情尚未保存，确定放弃修改吗？")) return;
    onClose();
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage("");
    const payload = { name: form.name, description: form.description, startDate: form.startDate || null, endDate: form.endDate || null, tags: form.tags.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean) };
    try {
      const response = await fetch(creating ? "/api/projects" : `/api/projects/${encodeURIComponent(projectId!)}`, {
        method: creating ? "POST" : "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify(creating ? payload : { ...payload, ...(form.status !== project!.status ? { status: form.status } : {}), version: project!.version }),
      });
      const result = await response.json() as { project?: ProjectDetail; error?: string };
      if (!response.ok || !result.project) throw new Error(result.error ?? "项目保存失败。");
      setProject(result.project); const nextForm = formFromProject(result.project); setForm(nextForm); setInitialForm(nextForm);
      setMessage("项目已保存。");
      if (creating) onCreated(result.project); else onChanged(result.project);
    } catch (error) { setMessage(error instanceof Error ? error.message : "项目保存失败。"); }
    finally { setSaving(false); }
  };

  const projectAction = async (action: "complete" | "archive" | "restore") => {
    if (!project) return;
    const label = action === "complete" ? "完成" : action === "archive" ? "归档" : "恢复";
    if (!window.confirm(`确定${label}项目“${project.name}”吗？`)) return;
    const call = async (confirmIncomplete = false, confirmUnresolvedQuestions = false) => fetch(`/api/projects/${encodeURIComponent(project.id)}/${action}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: project.version, confirmIncomplete, confirmUnresolvedQuestions }),
    });
    let confirmedIncomplete = false;
    let response = await call(); let result = await response.json() as { project?: ProjectDetail; error?: string; code?: string; plans?: Array<{ title: string }>; questions?: Array<{ number: number; title: string }> };
    if (result.code === "INCOMPLETE_PLANS") {
      const names = (result.plans ?? []).slice(0, 10).map((plan) => plan.title).join("、");
      if (!window.confirm(`仍有未完成计划：${names || "若干计划"}。仍要确认项目完成吗？`)) return;
      confirmedIncomplete = true; response = await call(true, false); result = await response.json();
    }
    if (result.code === "UNRESOLVED_QUESTIONS") {
      const names = (result.questions ?? []).slice(0, 10).map((question) => `Q-${String(question.number).padStart(3, "0")} ${question.title}`).join("、");
      if (!window.confirm(`仍有未解决问题：${names || "若干问题"}。仍要确认项目完成吗？`)) return;
      response = await call(confirmedIncomplete, true); result = await response.json();
    }
    if (!response.ok || !result.project) { setMessage(result.error ?? `${label}项目失败。`); return; }
    setProject(result.project); const nextForm = formFromProject(result.project); setForm(nextForm); setInitialForm(nextForm); onChanged(result.project);
  };

  const deleteProject = async () => {
    if (!project) return;
    const typed = window.prompt(`永久删除不可恢复。请输入完整项目名称“${project.name}”确认：`);
    if (typed === null) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: typed }) });
    const result = await response.json() as { deleted?: boolean; error?: string };
    if (!response.ok || !result.deleted) { setMessage(result.error ?? "项目删除失败。"); return; }
    onDeleted(project.id);
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!project) return;
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/members`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: data.get("userId"), role: data.get("role") }) });
    const result = await response.json() as { project?: ProjectDetail; error?: string };
    if (!response.ok || !result.project) { setMessage(result.error ?? "添加成员失败。"); return; }
    setProject(result.project); onChanged(result.project); event.currentTarget.reset();
  };

  const changeMember = async (member: ProjectMember, role: "lead" | "member" | "viewer" | "remove") => {
    if (!project) return;
    if (role === "lead" && !window.confirm(`确定将项目负责人转交给“${member.displayName}”吗？`)) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/members/${encodeURIComponent(member.userId)}`, role === "remove"
      ? { method: "DELETE" }
      : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }) });
    const result = await response.json() as { project?: ProjectDetail; error?: string };
    if (!response.ok || !result.project) { setMessage(result.error ?? "成员操作失败。"); return; }
    setProject(result.project); onChanged(result.project);
  };

  const uploadAttachment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!project) return;
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/workspace/attachments?projectId=${encodeURIComponent(project.id)}`, { method: "POST", body: formData });
    const result = await response.json() as { attachment?: Attachment; error?: string };
    if (!response.ok || !result.attachment) { setMessage(result.error ?? "附件上传失败。"); return; }
    setProjectAttachments((current) => [...current, result.attachment!]); event.currentTarget.reset();
  };

  const removeAttachment = async (attachment: Attachment) => {
    if (!project || !window.confirm(`确定删除附件“${attachment.originalName}”吗？`)) return;
    const response = await fetch(`/api/workspace/attachments/${encodeURIComponent(attachment.id)}?projectId=${encodeURIComponent(project.id)}`, { method: "DELETE" });
    const result = await response.json() as { deleted?: boolean; error?: string };
    if (!response.ok) { setMessage(result.error ?? "附件删除失败。"); return; }
    setProjectAttachments((current) => current.filter((item) => item.id !== attachment.id));
  };

  const toggleEmergency = async () => {
    if (!project) return;
    if (emergencyActive) {
      await fetch(`/api/projects/${encodeURIComponent(project.id)}/emergency-edit`, { method: "DELETE" }); setEmergencyActive(false); onEmergencyChange?.(false); return;
    }
    const reason = window.prompt("请填写管理员应急编辑原因：")?.trim(); if (!reason) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/emergency-edit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
    const result = await response.json() as { active?: boolean; error?: string };
    if (!response.ok) { setMessage(result.error ?? "无法启动应急编辑。"); return; }
    setEmergencyActive(Boolean(result.active)); onEmergencyChange?.(Boolean(result.active));
  };

  return <aside className="drawer project-drawer" aria-label={creating ? "创建项目" : "项目详情"}>
    <div className="drawer-head"><div><p>{creating ? "新项目" : project?.archivedAt ? "已归档" : project?.status ?? "项目"}</p><h2>{creating ? "创建项目" : project?.name ?? "正在加载…"}</h2></div><button className="icon-button" aria-label="关闭项目详情" onClick={close}>×</button></div>
    {!creating && <div className="drawer-tabs"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>基本信息</button><button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>成员与权限</button><button className={tab === "resources" ? "active" : ""} onClick={() => setTab("resources")}>项目资料</button></div>}
    {emergencyActive && <div className="emergency-banner">团队管理员应急编辑中 · 所有修改均会被审计</div>}
    {message && <p className="project-drawer-message">{message}</p>}
    {loading ? <div className="drawer-body"><p>正在读取项目详情…</p></div> : <>
      {(creating || tab === "overview") && <form className="drawer-body overview-form" onSubmit={save}>
        <label>项目名称<input value={form.name} required maxLength={200} disabled={!creating && !canEditProject} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
        {!creating && <label>状态<select value={form.status} disabled={!canManage || Boolean(project?.archivedAt)} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FormState["status"] }))}>{projectStatuses.filter((status) => status !== "已完成" || project?.status === "已完成").map((status) => <option key={status}>{status}</option>)}</select></label>}
        <label>项目描述<textarea rows={5} maxLength={20000} disabled={!creating && !canEditProject} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
        <div className="form-grid"><label>开始日期<input type="date" disabled={!creating && !canEditProject} value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></label><label>结束日期<input type="date" disabled={!creating && !canEditProject} value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></label></div>
        <label>标签 <small>使用逗号或顿号分隔</small><input disabled={!creating && !canEditProject} value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} /></label>
        {(creating || canEditProject) && <button className="primary-button" type="submit" disabled={saving}>{saving ? "正在保存…" : creating ? "创建项目" : "保存项目"}</button>}
        {!creating && canManage && <div className="project-lifecycle-actions">
          {!project?.archivedAt && project?.status !== "已完成" && <button type="button" onClick={() => void projectAction("complete")}>确认完成</button>}
          {!project?.archivedAt ? <button type="button" onClick={() => void projectAction("archive")}>归档项目</button> : <button type="button" onClick={() => void projectAction("restore")}>恢复项目</button>}
          <button type="button" className="danger" onClick={() => void deleteProject()}>永久删除</button>
        </div>}
        {!creating && viewerRole === "owner" && project?.accessRole === "team-admin" && <button type="button" className="emergency-toggle" onClick={() => void toggleEmergency()}>{emergencyActive ? "结束管理员应急编辑" : "启动管理员应急编辑"}</button>}
      </form>}
      {!creating && tab === "members" && <div className="drawer-body">
        <div className="project-member-list">{project?.members.map((member) => <article key={member.userId}><div><strong>{member.displayName}</strong><small>{member.email}</small></div>{canEditProject ? <select value={member.role} onChange={(event) => void changeMember(member, event.target.value as "lead" | "member" | "viewer" | "remove")}><option value="lead">负责人</option><option value="member">项目成员</option><option value="viewer">只读成员</option>{member.role !== "lead" && <option value="remove">移除成员</option>}</select> : <span>{member.role === "lead" ? "负责人" : member.role === "member" ? "项目成员" : "只读成员"}</span>}</article>)}</div>
        {canEditProject && <form className="project-add-member" onSubmit={addMember}><h3>添加团队成员</h3><select name="userId" required defaultValue=""><option value="" disabled>选择成员</option>{availableMembers.map((member) => <option value={member.id} key={member.id}>{member.displayName} · {member.email}</option>)}</select><select name="role" defaultValue="member"><option value="member">项目成员</option><option value="viewer">只读成员</option></select><button className="primary-button" type="submit">添加</button></form>}
      </div>}
      {!creating && tab === "resources" && <div className="drawer-body">
        {canUpload && <form className="attachment-upload" onSubmit={uploadAttachment}><label>上传项目附件<input name="file" type="file" required /></label><small>单个文件不超过 20 MB；团队全部项目合计不超过 1 GB。</small><button className="primary-button" type="submit">上传到项目</button></form>}
        <div className="attachment-list">{projectAttachments.map((attachment) => <article key={attachment.id}><span className="attachment-file-icon">▤</span><div><a href={attachment.contentUrl} target="_blank" rel="noreferrer">{attachment.originalName}</a><small>{Math.ceil(attachment.sizeBytes / 1024)} KB</small></div>{canUpload && <button onClick={() => void removeAttachment(attachment)}>删除</button>}</article>)}{!projectAttachments.length && <p>尚未上传项目附件。</p>}</div>
        <h3 className="project-activity-title">活动记录</h3><div className="project-activity-list">{activity.map((event) => <article key={event.id}><i /><div><strong>{event.actorName} {activityLabel(event.action)}</strong><time>{new Date(event.createdAt).toLocaleString("zh-CN")}</time></div></article>)}{!activity.length && <p>暂无项目活动。</p>}</div>
      </div>}
    </>}
  </aside>;
}
