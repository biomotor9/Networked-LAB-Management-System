"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type ManagedUser = { id: string; email: string; displayName: string; disabled: boolean; mustChangePassword: boolean; role: "owner" | "member" };

export default function AdminUsersClient({ teamName, currentUserId, initialUsers }: { teamName: string; currentUserId: string; initialUsers: ManagedUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [temporaryPassword, setTemporaryPassword] = useState<{ email: string; password: string } | null>(null);
  const [message, setMessage] = useState("");

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: data.get("email"), displayName: data.get("displayName") }) });
    const result = await response.json() as { user?: ManagedUser; temporaryPassword?: string; error?: string };
    if (!response.ok || !result.user || !result.temporaryPassword) { setMessage(result.error ?? "创建失败"); return; }
    setUsers((current) => [...current, result.user!]);
    setTemporaryPassword({ email: result.user.email, password: result.temporaryPassword });
    form.reset();
  }

  async function setDisabled(user: ManagedUser) {
    const response = await fetch(`/api/admin/users/${user.id}/disabled`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ disabled: !user.disabled }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setMessage(result.error ?? "操作失败"); return; }
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, disabled: !item.disabled } : item));
  }

  async function resetPassword(user: ManagedUser) {
    if (!window.confirm(`为 ${user.email} 生成新的临时密码？该用户现有会话将失效。`)) return;
    const response = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
    const result = await response.json() as { temporaryPassword?: string; error?: string };
    if (!response.ok || !result.temporaryPassword) { setMessage(result.error ?? "重置失败"); return; }
    setTemporaryPassword({ email: user.email, password: result.temporaryPassword });
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, mustChangePassword: true } : item));
  }

  return <main className="admin-page"><header><div><p>团队账户</p><h1>{teamName}</h1></div><div><Link href="/">返回工作区</Link><form action="/api/auth/logout" method="post"><button>退出</button></form></div></header><section className="admin-grid"><article className="admin-panel"><h2>创建成员账户</h2><p>成员首次登录时必须修改临时密码。</p>{message && <div className="auth-error">{message}</div>}<form className="admin-create-form" onSubmit={createUser}><label>姓名<input name="displayName" required /></label><label>邮箱<input name="email" type="email" required /></label><button type="submit">创建成员</button></form></article><article className="admin-panel users-panel"><h2>现有账户</h2><div className="user-list">{users.map((user) => <div className="user-row" key={user.id}><div><strong>{user.displayName}</strong><span>{user.email}</span></div><div className="user-flags"><span>{user.role === "owner" ? "管理员" : "成员"}</span>{user.mustChangePassword && <span>待改密</span>}{user.disabled && <span className="danger">已停用</span>}</div><div className="user-actions"><button onClick={() => resetPassword(user)}>重置密码</button><button disabled={user.id === currentUserId} onClick={() => setDisabled(user)}>{user.disabled ? "启用" : "停用"}</button></div></div>)}</div></article></section>{temporaryPassword && <div className="credential-backdrop"><section className="credential-card"><h2>临时登录信息</h2><p>此密码只显示一次，请通过可信渠道交给成员。</p><dl><dt>账号</dt><dd>{temporaryPassword.email}</dd><dt>临时密码</dt><dd><code>{temporaryPassword.password}</code></dd></dl><button onClick={() => setTemporaryPassword(null)}>我已安全保存</button></section></div>}</main>;
}
