import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  return <main className="auth-page"><section className="auth-card"><p className="auth-kicker">ATLAS ELN</p><h1>登录实验工作区</h1><p>仅管理员创建的团队账户可以访问。</p>{error && <div className="auth-error">账号、密码无效或账户已停用。</div>}<form action="/api/auth/login" method="post"><label>邮箱<input name="email" type="email" autoComplete="username" required autoFocus /></label><label>密码<input name="password" type="password" autoComplete="current-password" required /></label><button type="submit">登录</button></form></section></main>;
}

