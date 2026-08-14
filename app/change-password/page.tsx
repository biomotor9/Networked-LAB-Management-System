import { requireUser } from "../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser({ allowPasswordChange: true });
  const { error } = await searchParams;
  return <main className="auth-page"><section className="auth-card"><p className="auth-kicker">账户安全</p><h1>设置新密码</h1><p>{user.mustChangePassword ? "首次登录必须修改临时密码。" : "修改当前登录密码。"}</p>{error && <div className="auth-error">{decodeURIComponent(error)}</div>}<form action="/api/auth/change-password" method="post"><label>当前密码<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>新密码<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required /></label><label>确认新密码<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required /></label><button type="submit">保存并进入工作区</button></form></section></main>;
}

