# Atlas ELN

面向受邀请团队的实验计划与实验记录工作台。当前版本已经具备自托管底座、账户与团队管理、多项目工作区、共享的计划树与依赖图、科研问题跟踪，以及汇总个人参与项目实验节点的个人看板。

登录后可在工作区管理项目和实验内容，也可访问 `/my-board`，集中查看自己参与项目中处于“紧急、进行中、等待、持续关注”的实验节点。看板支持项目、领域、标签、日期和关键词筛选；有编辑权限的项目成员可以直接更新节点状态，并通过项目/节点深链接返回工作区。

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

### Windows 本地测试环境

仓库根目录准备好被 Git 忽略的 `.env` 后，可以使用以下命令管理完整的 Docker 测试环境：

```bash
npm run local:up       # 快速启动已有环境和数据
npm run local:rebuild  # 代码或依赖变化后重新构建并启动
npm run local:status   # 查看 PostgreSQL、Web 和代理健康状态
npm run local:logs     # 查看最近日志
npm run local:stop     # 停止服务但保留数据库和附件
```

本地入口为 `http://127.0.0.1:3000`。首次创建的数据保存在独立 Docker 命名卷中，执行停止或再次启动不会清除数据；不要使用 `docker compose down -v`。

日常重新启动使用 `npm run local:up`，它会复用现有镜像，不执行依赖安装。只有代码或依赖变化需要进入容器时才使用 `npm run local:rebuild`。Docker 构建会持久复用 npm 下载缓存；网络访问官方 npm 源较慢时，可仅在本机 `.env` 中设置 `NPM_REGISTRY=https://registry.npmmirror.com`，无需修改或提交项目配置。

## Docker 测试部署

```bash
copy .env.example .env
docker compose up -d --build
```

首次启动会读取 `.env` 中的 `BOOTSTRAP_ADMIN_*` 并幂等创建管理员。成功登录并改密后，应从 `.env` 删除初始密码并重建 Web 容器。当前临时测试环境通过宿主机 80 端口提供公网 HTTP，同时保留 `127.0.0.1:3000`；数据库和附件存储不映射公网端口。详细步骤、风险说明、备份与恢复见 [`docs/deployment.md`](docs/deployment.md)。

生产服务器更新默认不在服务器现场构建：先在已通过测试的开发机上构建 `linux/amd64` Web 镜像，导出并校验后通过 SCP 上传，服务器使用 `docker load` 和 `docker compose up -d --no-build` 更新。这样不依赖服务器访问 Docker Hub 或 npm 镜像源；完整发布、验证与回滚流程见部署手册第 15 节。

## 常用命令

- `npm run dev`：开发环境；
- `npm test`：单元测试和生产构建；
- `npm run lint`：代码规范检查；
- `npm run db:generate`：Schema 修改后生成迁移；
- `npm run db:migrate`：应用数据库迁移；
- `npm run admin:bootstrap`：创建初始管理员和团队。

## 数据边界

- 账户、团队、项目、成员权限、计划、依赖、科研问题、Markdown 记录、Entry 时间线、附件元数据、会话和审计事件：PostgreSQL；
- 附件实体：独立 Docker 持久化卷，通过带团队与项目权限校验的接口读取；
- 展开状态、画布位置、看板筛选偏好和未解决冲突草稿：浏览器 `localStorage`；
- JSON 导出/导入：项目内计划、依赖、文档和 Entry 可在权限校验后写入团队服务器，附件二进制不嵌入 JSON。

架构详情见 [`docs/architecture.md`](docs/architecture.md)，分阶段迁移见 [`docs/server-migration-plan.md`](docs/server-migration-plan.md)。
