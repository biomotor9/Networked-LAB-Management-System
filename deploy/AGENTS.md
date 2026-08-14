# 部署与运行规则

本文件适用于 `deploy/`，并同时指导 `Dockerfile*`、`compose.yaml` 和部署文档的修改；继承仓库根目录规则。

## 当前部署边界

- 正式运行方式为单机 Docker Compose：Nginx、Next.js Web 和 PostgreSQL。
- Nginx 是公网入口；Web 只通过容器网络提供服务，并保留宿主机 `127.0.0.1:3000` 诊断入口。
- PostgreSQL 和附件存储不得直接暴露公网端口。
- 数据库和附件位于 Docker 命名卷，更新应用不得重建或删除这些卷。

## 修改要求

- 修改 `compose.yaml` 时同步检查健康检查、依赖顺序、内存限制、日志轮转、端口和网络隔离。
- 修改 `deploy/nginx.conf` 时保持登录限速、上传大小、安全响应头和代理 Host 行为。
- 修改 `Dockerfile` 时保持多阶段构建、非 root 运行、Standalone 输出和附件目录权限。
- 环境变量变化必须同步更新 `.env.example` 和 `docs/deployment.md`，但不得提交真实 `.env`。
- 配置中的实际数值和迁移数量必须与部署文档一致，避免复制过期说明。

## 本地验证与发布

- 先在本地执行 `npm test`、`npm run lint` 和 `docker compose config --quiet`；需要密码变量时只使用临时占位值。
- 在本地验证通过前不得更新服务器。
- 未经用户明确要求，不得连接、拉取、重建或重启生产服务器。
- 获得部署授权后仍需先检查状态、备份数据库和附件、记录旧提交号，再使用 `git pull --ff-only` 更新。
- 发布后必须检查容器状态、Web 日志、`/api/health`、登录和数据读写；异常时停止并回滚。
- 禁止执行 `docker compose down -v`，禁止用删除卷解决迁移或启动故障。
