import { bootstrapInitialAdmin } from "../db/bootstrap";
import { sql } from "../db";

try {
  const result = await bootstrapInitialAdmin();
  if (result === "created") process.stdout.write("已创建初始管理员和团队；首次登录必须修改密码。\n");
  if (result === "exists") process.stdout.write("该管理员已存在，未做修改。\n");
  if (result === "skipped") process.stdout.write("未设置 BOOTSTRAP_ADMIN_EMAIL，已跳过。\n");
} finally {
  await sql.end();
}
