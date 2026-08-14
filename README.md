# Atlas ELN

面向受邀请团队的实验计划与实验记录工作台。当前版本已经具备自托管底座、账户与团队管理，以及共享的服务器端计划树和依赖图。Markdown 实验正文和 Entry 时间线仍作为浏览器本地草稿，下一阶段迁移到 PostgreSQL。

## 本地运行

要求 Node.js `>=22.13.0`，并准备可访问的 PostgreSQL。

```bash
npm install
copy .env.example .env
npm run db:migrate
npm run admin:bootstrap
npm run dev
```

本地访问 `http://localhost:3000`。初始化管理员所需的 `BOOTSTRAP_ADMIN_*` 环境变量见 `.env.example`；管理员首次登录必须修改密码。

## Docker 测试部署

```bash
copy .env.example .env
docker compose up -d --build
```

首次启动会读取 `.env` 中的 `BOOTSTRAP_ADMIN_*` 并幂等创建管理员。成功登录并改密后，应从 `.env` 删除初始密码并重建 Web 容器。当前临时测试环境通过宿主机 80 端口提供公网 HTTP，同时保留 `127.0.0.1:3000`；数据库和附件存储不映射公网端口。详细步骤、风险说明、备份与恢复见 [`docs/deployment.md`](docs/deployment.md)。

## 常用命令

- `npm run dev`：开发环境；
- `npm test`：单元测试和生产构建；
- `npm run lint`：代码规范检查；
- `npm run db:generate`：Schema 修改后生成迁移；
- `npm run db:migrate`：应用数据库迁移；
- `npm run admin:bootstrap`：创建初始管理员和团队。

## 数据边界

- 账户、团队、项目、计划、依赖、会话和审计事件：PostgreSQL；
- Markdown 记录、Entry 时间线和界面状态：当前仍为浏览器 `localStorage` 草稿；
- JSON 导出/导入：计划和依赖会导入团队服务器，文档和 Entry 恢复为当前浏览器草稿；
- 附件：只预留后续接口，尚未启用服务器上传。

架构详情见 [`docs/architecture.md`](docs/architecture.md)，分阶段迁移见 [`docs/server-migration-plan.md`](docs/server-migration-plan.md)。
