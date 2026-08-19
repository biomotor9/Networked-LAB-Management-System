# Atlas ELN 服务器部署与内测手册

> 适用版本：2026-08-19 当前仓库
> 目标环境：Linux、2 核 CPU、2 GB 内存、40 GB 磁盘、Docker、华为云公网 IP  
> 内测访问方式：临时公网 IP HTTP；保留 SSH 隧道诊断入口

本文从一台已安装 Docker 的空闲服务器开始，覆盖首次部署、账号初始化、双用户验收、备份、更新和回滚。命令中的 `<SERVER_IP>`、`<SSH_USER>` 等尖括号内容必须替换成真实值。

## 1. 部署后的结构

Docker Compose 运行三个容器：

| 容器 | 用途 | 内存上限 | 对外端口 |
| --- | --- | ---: | --- |
| `proxy` | Nginx 反向代理、登录限速、保留访问 Host | 64 MB | 公网 `80`；本机 `127.0.0.1:3000` |
| `web` | Next.js 应用、认证、API、自动数据库迁移 | 640 MB | 仅容器内部 `3000` |
| `postgres` | PostgreSQL 17 | 640 MB | 不映射宿主机端口 |

PostgreSQL 数据保存在 Docker 命名卷 `postgres_data`，附件实体文件保存在 `attachment_data`。三个容器的日志限制为每个文件 10 MB、最多 3 个文件，避免长期占满 40 GB 磁盘。

当前服务器保存：账户、团队、项目、计划、依赖、Markdown 实验正文、Entry 时间线、附件、会话和审计事件。浏览器本地存储只保留迁移来源、冲突草稿和界面偏好，不再是团队内容的事实源。

## 2. 上线前准备

准备以下信息：

- 服务器公网 IP；
- 可登录服务器且能执行 Docker 的 SSH 用户；
- SSH 密钥或密码；
- 管理员邮箱和显示名称；
- 团队名称；
- 两个不同的强密码：数据库密码、管理员临时密码；
- 当前项目源码。

当前临时公网测试需要华为云安全组开放 TCP 80。SSH 端口 22 建议只允许测试人员的固定公网 IP；不要新增 3000 或 5432 的公网入站规则。

## 3. 检查服务器

登录服务器：

```bash
ssh <SSH_USER>@<SERVER_IP>
```

检查系统资源和 Docker：

```bash
uname -a
free -h
df -h
docker --version
docker compose version
docker info
```

建议满足：

- 可用内存至少约 1 GB；
- 可用磁盘至少 10 GB；
- `docker compose version` 能正常返回；
- 当前用户执行 `docker ps` 不会出现权限错误。

如果只有旧版 `docker-compose` 而没有 `docker compose`，建议先安装 Compose v2 插件，不要混用两套命令。

### 3.1 建议配置交换空间

2 GB 主机在服务器本机构建 Next.js 镜像时可能出现内存不足。先检查：

```bash
swapon --show
free -h
```

如果没有 swap，可由具备 sudo 权限的管理员创建 2 GB swap：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
swapon --show
```

执行前确认 `/swapfile` 不存在，并且根磁盘有足够空间。如果云服务器已有 swap，不要重复创建。

## 4. 上传项目

推荐使用私有 Git 仓库部署；首次没有远程仓库时，也可以使用压缩包。

### 4.1 方式 A：私有 Git 仓库

在服务器创建部署目录并克隆：

```bash
sudo mkdir -p /opt/atlas-eln
sudo chown <SSH_USER>:<SSH_USER> /opt/atlas-eln
git clone <PRIVATE_REPOSITORY_URL> /opt/atlas-eln
cd /opt/atlas-eln
```

不要把 `.env`、数据库备份或管理员密码提交到 Git。

### 4.2 方式 B：从当前 Windows 电脑上传压缩包

在 Windows PowerShell 中，进入 `nln` 的上一级目录并创建不含生成物的压缩包：

```powershell
tar -czf atlas-eln-deploy.tar.gz --exclude=nln/node_modules --exclude=nln/.next --exclude=nln/dist --exclude=nln/.vinext --exclude=nln/.git nln
scp .\atlas-eln-deploy.tar.gz <SSH_USER>@<SERVER_IP>:/tmp/
```

回到服务器：

```bash
sudo mkdir -p /opt/atlas-eln
sudo chown <SSH_USER>:<SSH_USER> /opt/atlas-eln
tar -xzf /tmp/atlas-eln-deploy.tar.gz -C /opt/atlas-eln --strip-components=1
rm /tmp/atlas-eln-deploy.tar.gz
cd /opt/atlas-eln
```

确认关键文件存在：

```bash
ls -la
test -f compose.yaml && echo "compose.yaml OK"
test -f Dockerfile && echo "Dockerfile OK"
test -f drizzle/0004_ordinary_maestro.sql && echo "database migrations OK"
```

## 5. 创建环境配置

复制示例文件：

```bash
cd /opt/atlas-eln
cp .env.example .env
chmod 600 .env
nano .env
```

如果没有 `nano`，可使用服务器已有的文本编辑器。首次部署的最小配置如下：

```dotenv
POSTGRES_PASSWORD=替换为至少32位的URL安全随机密码
DATABASE_URL=postgresql://atlas:同一数据库密码@127.0.0.1:5432/atlas
DATABASE_POOL_SIZE=5
SESSION_DAYS=7
COOKIE_SECURE=false
BOOTSTRAP_ADMIN_EMAIL=你的管理员邮箱
BOOTSTRAP_ADMIN_NAME=管理员显示名称
BOOTSTRAP_ADMIN_PASSWORD=至少12字符的临时密码
BOOTSTRAP_TEAM_NAME=团队名称
```

注意：

- `POSTGRES_PASSWORD` 请选择仅由字母、数字、`_`、`-` 组成的随机密码，建议至少 32 位；
- Compose 会自行构造容器内部数据库连接，`.env` 中的 `DATABASE_URL` 主要用于脱离 Compose 的本地命令；
- 管理员临时密码至少 12 个字符，首次登录后必须修改；
- `COOKIE_SECURE=false` 仅适合当前无 HTTPS 的临时内测；HTTP 链路可被窃听，不得复用其他系统密码；
- `.env` 权限应保持为 `600`；
- 不要通过聊天、截图或代码仓库传递真实密码。

检查 Compose 能否正确解析配置：

```bash
docker compose config --quiet
```

不要执行不带 `--quiet` 的 `docker compose config` 并把输出发给他人，因为完整输出可能包含数据库密码和管理员临时密码。

## 6. 首次构建与启动

在项目目录执行：

```bash
cd /opt/atlas-eln
docker compose pull postgres
docker compose build web
docker compose up -d
```

首次构建可能需要数分钟。2 GB 服务器上应避免同时运行其他高内存任务。

查看状态：

```bash
docker compose ps
docker compose logs --tail=150 postgres
docker compose logs --tail=150 web
```

正常结果：

- `postgres` 显示 `healthy`；
- `web` 最终显示 `healthy`；
- Web 日志没有迁移失败、密码配置错误或数据库连接错误；
- 首次启动自动应用 `drizzle/` 中尚未执行的迁移；当前基线包含 `0000` 至 `0004` 共五组迁移；
- 首次启动幂等创建管理员、团队和默认实验项目。

启动可能需要 30–90 秒。可以等待后再次执行：

```bash
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

健康接口正常返回：

```json
{"status":"ok"}
```

如果 Web 未正常启动，不要反复删除数据库卷，先按第 14 节查看日志。

## 7. 验证公网端口范围

在服务器执行：

```bash
ss -lntp | grep -E ':3000|:5432'
```

预期看到公网 `0.0.0.0:80` 和本机 `127.0.0.1:3000`，不应看到：

- `0.0.0.0:3000`；
- `[::]:3000`；
- 任何宿主机 `5432` 监听。

在本地浏览器访问 `http://<SERVER_IP>` 应进入登录页；直接访问 `http://<SERVER_IP>:3000` 应当失败。

## 8. 公网访问与可选 SSH 隧道

临时公网测试入口：

```text
http://<SERVER_IP>
```

这是未加密 HTTP。需要排障或关闭公网入口后访问时，可以建立 SSH 隧道：

在 Windows PowerShell 新开一个窗口并保持运行：

```powershell
ssh -N -L 3000:127.0.0.1:3000 <SSH_USER>@<SERVER_IP>
```

然后在本地浏览器打开：

```text
http://127.0.0.1:3000
```

如果本机 3000 端口已被占用，改用：

```powershell
ssh -N -L 13000:127.0.0.1:3000 <SSH_USER>@<SERVER_IP>
```

并访问 `http://127.0.0.1:13000`。关闭 SSH 窗口后隧道会断开，但服务器容器仍继续运行。

## 9. 首次管理员登录

1. 使用 `.env` 中的 `BOOTSTRAP_ADMIN_EMAIL` 和临时密码登录；
2. 系统应立即跳转到首次修改密码页面；
3. 设置新的管理员密码；
4. 重新进入工作区；
5. owner 顶部应能看到团队账户管理入口。

完成首次改密后，立即从服务器 `.env` 删除以下四行：

```dotenv
BOOTSTRAP_ADMIN_EMAIL=...
BOOTSTRAP_ADMIN_NAME=...
BOOTSTRAP_ADMIN_PASSWORD=...
BOOTSTRAP_TEAM_NAME=...
```

然后重建 Web 容器的运行环境，确保旧临时密码不再留在容器环境变量中：

```bash
cd /opt/atlas-eln
docker compose up -d --force-recreate web
docker compose ps
```

删除这些配置不会删除已经创建的管理员和团队。

## 10. 创建成员并测试共享计划

### 10.1 创建成员

1. 管理员进入“团队账户”；
2. 输入成员姓名和邮箱；
3. 系统生成只显示一次的临时密码；
4. 通过可信渠道把账号和临时密码交给成员；
5. 成员首次登录并修改密码。

不要通过公开群聊发送成员临时密码。

### 10.2 双浏览器共享测试

使用两个不同浏览器配置文件或一个普通窗口加一个隐私窗口：

1. 浏览器 A 登录 owner；
2. 浏览器 B 登录 member；
3. A 新建一个计划，等待顶部显示“已保存到团队服务器”；
4. B 刷新页面，确认可以看到该计划；
5. B 修改计划标题或状态，等待保存；
6. A 刷新页面，确认看到 B 的修改；
7. A 新增依赖，B 刷新后确认网络图一致；
8. 重启 Web 容器并再次刷新，确认数据仍在。

重启命令：

```bash
docker compose restart web
docker compose ps
```

### 10.3 并发冲突测试

1. A 和 B 同时打开同一版本的项目；
2. A 修改一个计划并等待“已保存到团队服务器”；
3. B 在不刷新的情况下修改另一个计划；
4. B 应看到“其他成员已修改项目，请刷新页面后继续”；
5. B 刷新后应读取 A 的最新数据。

当前测试版不会自动合并两个同时修改的快照，这是防止静默覆盖的预期行为。

### 10.4 旧本机计划和文档迁移

如果这个浏览器在升级前已有 localStorage 计划，而新的团队项目为空，工具栏会显示“迁移本机计划”。点击并确认后，计划与依赖会写入团队服务器。仅在确认目标团队正确、服务器项目为空时执行。

如果服务器尚无 Markdown/Entry，而当前浏览器保存过本机内容，工具栏会显示“迁移本机文档”。确认后会把本机文档和事件写入服务器；该入口只在服务器内容为空时可用，不会覆盖已有团队内容。

JSON 的“导入备份”也会替换当前团队服务器中的计划和依赖，因此操作前必须先导出当前备份并确认覆盖提示。

## 11. 验收清单

部署测试完成前逐项确认：

- [ ] 三个容器均为 healthy；
- [ ] `/api/health` 返回 `ok`；
- [ ] 3000 只绑定 `127.0.0.1`，5432 未映射；
- [ ] 管理员首次登录被强制改密；
- [ ] owner 可以创建、停用、启用和重置成员账户；
- [ ] member 不能进入 owner 管理页面；
- [ ] owner 与 member 可以跨浏览器看到同一计划；
- [ ] 计划层级和依赖在刷新、重启后仍存在；
- [ ] 并发旧版本写入会显示冲突，不会静默覆盖；
- [ ] JSON 导出可以下载；
- [ ] 数据库备份可以生成；
- [ ] 已从 `.env` 和 Web 容器删除管理员临时密码；
- [ ] 华为云安全组仅按需要开放 80/22，未开放 3000/5432；

## 12. 数据库与附件备份

创建仅部署用户可访问的备份目录：

```bash
cd /opt/atlas-eln
mkdir -p backups
chmod 700 backups
```

生成 PostgreSQL 自定义格式备份：

```bash
docker compose exec -T postgres pg_dump -U atlas -d atlas -Fc > "backups/atlas-$(date +%F-%H%M%S).dump"
ls -lh backups
```

确认文件不是 0 字节。数据库备份覆盖账户、团队、项目、计划、依赖、Markdown 正文、Entry 时间线和审计数据。冲突时尚未提交的浏览器本地草稿仍需使用页面“导出备份”另行保存。

附件实体文件不在数据库中，必须同时复制附件卷：

```bash
stamp=$(date +%F-%H%M%S)
docker compose cp web:/data/attachments "backups/attachments-$stamp"
du -sh "backups/attachments-$stamp"
```

数据库备份和附件目录应作为同一批次保存到服务器之外。恢复时先恢复数据库，再把对应附件目录复制回 `web:/data/attachments`，并确认容器内目录属于运行用户。

建议内测期间：

- 每天至少一次数据库与附件配对备份；
- 更新前额外备份一次；
- 保留最近 7 份日备份；
- 定期复制到服务器之外的加密位置；
- 不要把唯一备份放在与数据库相同的 40 GB 磁盘上。

从服务器下载备份到 Windows：

```powershell
scp <SSH_USER>@<SERVER_IP>:/opt/atlas-eln/backups/<BACKUP_FILE>.dump .\
```

## 13. 恢复演练与实际恢复

### 13.1 无损恢复演练

先把备份恢复到临时数据库，不覆盖正式数据：

```bash
cd /opt/atlas-eln
docker compose exec -T postgres createdb -U atlas atlas_restore_check
docker compose exec -T postgres pg_restore -U atlas -d atlas_restore_check < backups/<BACKUP_FILE>.dump
docker compose exec -T postgres psql -U atlas -d atlas_restore_check -c "select count(*) from plans;"
docker compose exec -T postgres dropdb -U atlas atlas_restore_check
```

记录恢复是否成功、计划数量和耗时。正式使用前至少完成一次无损演练。

### 13.2 覆盖正式数据库

以下操作会覆盖当前数据库，只有明确需要恢复时才执行：

```bash
cd /opt/atlas-eln
docker compose stop web
docker compose exec -T postgres dropdb -U atlas --force atlas
docker compose exec -T postgres createdb -U atlas atlas
docker compose exec -T postgres pg_restore -U atlas -d atlas < backups/<BACKUP_FILE>.dump
docker compose start web
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

恢复前应再保存一份当前数据库，并确认 `<BACKUP_FILE>`、服务器和团队均正确。恢复后重新执行第 11 节核心验收。

## 14. 查看状态与排查故障

### 14.1 常用只读检查

```bash
cd /opt/atlas-eln
docker compose ps
docker compose logs --tail=200 web
docker compose logs --tail=200 postgres
docker stats --no-stream
docker system df
df -h
free -h
```

持续观察日志：

```bash
docker compose logs -f --tail=100 web
```

按 `Ctrl+C` 只会停止日志跟随，不会停止容器。

### 14.2 常见问题

#### `POSTGRES_PASSWORD is missing`

`.env` 不存在、文件名错误或缺少 `POSTGRES_PASSWORD`。检查当前目录和文件权限，然后执行 `docker compose config --quiet`。

#### PostgreSQL 一直 unhealthy

查看 PostgreSQL 日志，检查磁盘空间和命名卷。如果数据库卷已经使用旧密码初始化，仅修改 `.env` 不会修改数据库内部密码。不要删除卷；恢复原密码或按受控流程修改数据库密码。

#### Web 日志显示数据库连接失败

确认 PostgreSQL healthy、Web 与 PostgreSQL 均连接 `backend` 网络，并且数据库密码只包含 URL 安全字符。重新创建 Web 容器：

```bash
docker compose up -d --force-recreate web
```

#### 服务器无法下载构建镜像或构建时出现 OOM

不要为解决镜像源、DNS 或内存问题而反复重启生产容器。服务器更新默认使用第 15 节的“本地构建并传输镜像”流程；服务器只负责校验、加载和启动已经验证的镜像。

#### 登录后反复回到登录页

SSH 隧道 HTTP 内测必须使用 `COOKIE_SECURE=false`。修改 `.env` 后执行 `docker compose up -d --force-recreate web`，并清除浏览器该站点旧 Cookie 后重试。

#### 页面提示其他成员已修改项目

这是乐观并发保护。刷新读取最新版，再重新执行本次修改。不要通过重复导入旧 JSON 强行覆盖，除非明确希望替换整个团队项目。

#### 磁盘空间不足

先检查数据库、备份、镜像和构建缓存占用。优先把旧备份转移到其他存储并扩容磁盘。不要直接删除 `postgres_data` 卷。确认不再使用的镜像后再清理 Docker 构建缓存。

## 15. 更新部署

服务器网络可能无法稳定访问 GitHub、Docker Hub 或 Dockerfile 前端镜像。当前默认更新方式为：

> 正式提交并推送 GitHub → 本地测试和构建 Linux 镜像 → 导出并校验 → SCP 上传 → 服务器加载 → `--no-build` 启动 → 验收

服务器不得直接修改源码，也不在生产机首次编译或试验新版本。以下示例使用当前 Compose 项目名 `nln`、部署目录 `/home/nln`；其他环境必须替换为实际值。

### 15.1 发布前门槛

在 Windows 开发机执行：

```powershell
cd C:\path\to\nln
npm run lint
npm test
docker compose config --quiet
git status --short --branch
git rev-parse HEAD
```

确认测试和生产构建通过、工作区干净，并且当前提交已正式推送到 GitHub。记录完整提交号作为发布标识和回滚依据。

### 15.2 本地构建并导出镜像

在 Windows PowerShell 执行：

```powershell
$releaseCommit = (git rev-parse --short=7 HEAD).Trim()
$releaseImage = "nln-web:$releaseCommit"
$releaseTar = Join-Path $env:TEMP "nln-web-$releaseCommit.tar"

docker build `
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com `
  -t $releaseImage .

docker image inspect $releaseImage --format 'id={{.Id}} created={{.Created}} size={{.Size}} arch={{.Architecture}} os={{.Os}}'
docker save -o $releaseTar $releaseImage
Get-FileHash -Algorithm SHA256 -LiteralPath $releaseTar
```

发布镜像必须为 `linux/amd64`，并由刚刚通过测试的同一提交构建。记录镜像 ID、文件大小和 SHA-256。

### 15.3 同步正式提交到服务器 Git 仓库

如果服务器可以访问 GitHub，在服务器使用：

```bash
cd /home/nln
git pull --ff-only
```

如果服务器无法访问 GitHub，先在开发机把同一个、已经推送到 GitHub 的提交推送到服务器裸仓库：

```powershell
git push ssh://<SSH_USER>@<SERVER_IP>/home/nln-release.git HEAD:main
```

服务器首次使用本地发布镜像时配置部署镜像远程：

```bash
cd /home/nln
git remote add deployment-mirror /home/nln-release.git
git fetch deployment-mirror main
git branch --set-upstream-to=deployment-mirror/main main
```

后续更新源码使用：

```bash
cd /home/nln
git pull --ff-only deployment-mirror main
```

更新后 `git rev-parse HEAD` 必须与构建镜像的完整提交号一致，`git status --short --branch` 不得出现源码修改。`origin` 继续保留为正式 GitHub 仓库；`deployment-mirror` 只解决服务器出站网络受限时的 Git 传输。

### 15.4 上传和校验镜像

在 Windows PowerShell 上传：

```powershell
scp $releaseTar <SSH_USER>@<SERVER_IP>:/root/
```

在服务器计算校验和，与开发机结果逐字比较：

```bash
sha256sum "/root/nln-web-<COMMIT>.tar"
```

校验和不一致时立即停止，不得加载镜像。

### 15.5 备份并保留回滚镜像

先按第 12 节生成同批次数据库和附件备份并验证可读，然后记录并标记当前镜像：

```bash
cd /home/nln
docker image inspect nln-web:latest --format '{{.Id}} {{.Created}}'
docker tag nln-web:latest "nln-web:rollback-$(date +%F-%H%M%S)"
```

不得删除上一版镜像、数据库备份或附件备份，直到新版本完成验收。

### 15.6 加载并无构建启动

在服务器执行：

```bash
cd /home/nln
docker load -i "/root/nln-web-<COMMIT>.tar"
docker tag "nln-web:<COMMIT>" nln-web:latest
docker compose config --quiet
docker compose up -d --no-build
```

Compose 会在旧容器继续运行时加载镜像，只在最后重建 Web 容器；PostgreSQL 和附件命名卷保持不变。不要提前执行 `docker compose down`，禁止执行 `docker compose down -v`。

### 15.7 发布验证

在服务器执行：

```bash
cd /home/nln
docker compose ps
docker inspect nln-web-1 --format 'container_image={{.Image}}'
docker image inspect nln-web:latest --format 'tag_image={{.Id}} created={{.Created}}'
docker compose logs --tail=150 web
curl --fail http://127.0.0.1:3000/api/health
curl --fail http://127.0.0.1/api/health
docker compose exec -T postgres psql -U atlas -d atlas -c 'SELECT count(*) AS applied_migrations FROM drizzle.__drizzle_migrations;'
git status --short --branch
```

确认三个容器均为 `healthy`、运行容器镜像 ID 与 `nln-web:latest` 一致、健康接口返回 200、迁移数量符合当前版本且 Git 工作区干净。再从开发机验证公网健康接口、首页跳转和登录页，并执行第 11 节与本次变更直接相关的冒烟测试。

验收通过后可以删除传输用镜像文件；镜像和外部备份继续保留：

```bash
rm "/root/nln-web-<COMMIT>.tar"
```

### 15.8 本次已验证基线

2026-08-19 已使用该流程发布提交 `8f4539126c833c0424bab3894af01e701dc31c4b`：本地构建 `linux/amd64` 镜像，SCP 上传并通过 SHA-256 校验，服务器 `docker load` 后使用 `docker compose up -d --no-build` 更新。三个容器健康，数据库迁移为 5 组，内网、代理和公网健康接口均返回 200，首页正确跳转登录页。

### 15.9 旧的服务器构建方式

服务器网络和资源均稳定时仍可执行以下流程，但不作为当前默认方式：

```bash
cd /home/nln
git pull --ff-only
docker compose build web
docker compose up -d
docker compose ps
docker compose logs --tail=150 web
curl --fail http://127.0.0.1:3000/api/health
```

Web 启动时会自动执行尚未应用的 Drizzle 迁移。已经部署过的 `drizzle/*.sql` 不应改写；数据库结构变化应新增迁移文件。

## 16. 回滚原则

发布前必须同时保留：

- 更新前数据库备份；
- 上一版源码或镜像；
- 当次迁移文件和发布记录。

如果新版本只发生应用错误、没有不兼容数据库迁移，可恢复上一版源码并重建 Web。如果迁移已经改变数据结构或内容，则停止 Web，恢复更新前数据库备份，再运行上一版镜像。不要依赖“把 SQL 反向执行”作为唯一回滚方案。

回滚后执行健康检查、登录、共享计划读取和数据数量核对。

## 17. 停止与卸载

临时停止应用但保留数据：

```bash
docker compose stop
```

重新启动：

```bash
docker compose start
```

删除容器和网络但保留数据库卷：

```bash
docker compose down
```

不要执行 `docker compose down -v`，它会删除 PostgreSQL 数据卷。除非已经确认这是可丢弃环境并且备份已验证，否则禁止删除卷。

## 18. 正式公网发布前的额外门槛

本手册完成的是受控内测，不是正式公网发布。正式使用域名和公网访问前，还需完成：

- ICP 备案与云厂商接入要求；
- Nginx 或 Caddy 反向代理；
- HTTPS 证书和自动续期；
- `COOKIE_SECURE=true`；
- 登录失败限速、显式 CSRF/Origin 校验和更强账号保护；
- 集中日志、监控和告警；
- 数据库自动异机备份及恢复演练；
- 权限隔离和关键流程端到端测试；
- 根据真实附件规模确定对象存储、配额和备份方案。

Cloudflare Workers 不是当前单机 Docker 部署的必需组件。
