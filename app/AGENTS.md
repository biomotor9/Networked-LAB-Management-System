# 应用层开发规则

本文件适用于 `app/` 下的页面、客户端交互、领域逻辑和服务端应用代码，并继承仓库根目录规则。

## 局部导航

- 页面入口与布局：`page.tsx`、`layout.tsx`、`login/`、`change-password/`、`admin/`；
- 主工作区界面：`workspace-client.tsx`；
- 可复用领域逻辑：`features/`；
- 服务端认证、工作区与附件逻辑：`lib/`；
- HTTP 接口：`api/`，修改时还必须读取 `api/AGENTS.md`；
- 示例初始数据：`data/seed.ts`。

开始任务时只读取目标入口、它的直接依赖和对应测试。不要因为修改一个页面或领域函数而先遍历整个 `app/`。

## 功能影响地图

| 功能域 | 首轮读取范围 | 现有测试入口 |
| --- | --- | --- |
| 登录、改密与会话 | `login/`、`change-password/`、`api/auth/`、`lib/auth/`，需要时再看用户与会话表 | `tests/password.test.ts`；接口与 Cookie 行为仍需补测试或人工验证 |
| 团队账户管理 | `admin/users/`、`api/admin/users/`、`lib/auth/`、用户表和审计表 | 密码测试；角色、停用和重置接口仍需补覆盖 |
| 计划树与依赖图 | `workspace-client.tsx` 的相关调用、`features/plans/`、`features/dependencies/`、`features/workspace/model.ts`、快照读写 | `tests/domain-logic.test.ts`、`tests/server-snapshot.test.ts` |
| Markdown、文档与 Entry | `features/notebook/`、`features/workspace/content.ts`、文档与 Entry API、`lib/workspace/content.ts` | `tests/content.test.ts` |
| 工作区保存与导入导出 | `features/workspace/`、`features/persistence/`、工作区 API、`lib/workspace/` | `tests/persistence.test.ts`、`tests/server-snapshot.test.ts` |
| 附件 | `features/attachments/`、附件 API、`lib/attachments/`、附件表；涉及上传限制时再读 Nginx 和 Compose | `tests/content.test.ts`；上传、下载和权限仍需补接口验证 |

该表只定义首轮阅读范围，不代表完整影响范围。发现共享模型、数据库 Schema、API 契约、权限或部署配置变化时，再按根规则扩大检查。

## 架构边界

- 浏览器组件不得直接访问数据库、读取服务器环境变量或绕过 API 权限检查。
- 服务端数据、认证状态和团队内容以 PostgreSQL 为事实源；浏览器存储只能保存设备本地偏好或明确的临时草稿。
- 可独立测试的计划树、依赖图、Markdown、持久化和快照逻辑应放入相应 `features/` 模块，不继续扩大 `workspace-client.tsx`。
- 修改共享数据结构时，检查客户端模型、API 校验、数据库映射和备份格式是否需要同步变化。
- 保留现有服务端组件与客户端组件边界；只有确实需要浏览器状态或事件时才使用客户端组件。

## UI 与状态变更

- 保持现有中文界面、键盘操作和保存状态反馈的一致性。
- 新增交互必须提供可理解的标签、焦点顺序和错误提示，并检查桌面与窄屏下的基本可用性。
- 异步保存必须处理加载、成功、冲突和失败状态，不能静默丢弃用户修改。
- 附件、Markdown 和富文本内容必须经过既有校验与编码层，不在页面组件中复制解析规则。
- 新功能优先形成小型领域函数或组件，并添加对应测试，避免在大型事件处理函数中继续堆叠条件。

## 验证

- 领域逻辑变更应更新 `tests/` 中对应测试。
- 页面或交互变更至少运行 `npm run lint` 和 `npm test`。
- 用户可见交互还必须进行浏览器冒烟验证；若没有自动化浏览器测试，交付时记录具体操作路径和结果。
- 涉及 API、数据库或附件时，同时遵守对应子目录规则并完成服务端验证。
