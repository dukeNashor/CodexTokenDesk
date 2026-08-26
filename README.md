# Codex Token Desk

一个本机优先的 Codex rollout 实时监控 WebApp。

## 技术路线

- Next.js App Router + React + TypeScript + pnpm
- 服务端只读扫描本机 Codex `sessions` / `archived_sessions` JSONL，自动发现项目并按 Git common directory 合并 worktree
- TypeScript rollout parser：按 `task_started` / `task_complete` / `turn_aborted` 边界归因累计 Token，记录 Context 快照、Compaction、工具调用和完整性告警
- 根任务与子代理聚合，剔除子代理继承的 Token 基线
- 左栏提供项目资源管理器和按最后活动排序的会话总列表；项目项只负责展开或折叠，会话支持复选、Ctrl/Shift 与鼠标框选
- 首次进入默认选择全局最后活动的一个会话，展开其所属项目并直接进入详情
- 默认统计全部时间，并保留今天、7 天、30 天和自定义日期范围；日期只过滤统计，不隐藏历史会话
- 旧版高密度可视化已迁入 React：Token/Context 双环、子代理/工具卫星、Compaction、构成图、累计图、热力明细、详情抽屉和模型 Donut
- Sol 等价使用带来源与核验日期的公开 API 文本 Token 费率估算；Spark 单独列示
- 浏览器每 3 秒轮询 `/api/report`
- 服务端只在 rollout 文件大小或修改时间变化时重解析，状态保存在内存中
- 默认绑定 `127.0.0.1`，不把本地 rollout 内容发送到浏览器以外的服务
- Windows C# 托盘宿主负责启动、停止、重启和打开 Dashboard

## 启动

要求 Node.js 18.18+ 与 pnpm 11：

```powershell
pnpm install
pnpm dev
```

打开 <http://127.0.0.1:3002>。Token Desk 固定使用 3002 端口。

如果需要使用 Codex bundled runtime，`scripts/start-dashboard.ps1` 会自动寻找该运行时。可以通过环境变量覆盖扫描范围：

```powershell
$env:CODEX_PROJECT_ROOT = "D:\path\to\project"
$env:CODEX_SESSIONS_ROOTS = "$env:USERPROFILE\.codex\sessions;$env:USERPROFILE\.codex\archived_sessions"
pnpm dev
```

`CODEX_PROJECT_ROOT` 用作缺少 `cwd` 或相对路径会话的项目归属回退目录，也影响项目列表排序，但不再决定初始选择。Dashboard 默认自动发现所有 rollout 项目；若要限制可见范围，使用分号分隔的显式 allowlist：

```powershell
$env:CODEX_PROJECT_ALLOWLIST = "D:\path\to\project-one;D:\path\to\project-two"
pnpm dev
```

日期、导航视图、当前详情会话和模型筛选会写入 URL。统计所选会话仅保存在当前页面状态中，刷新后恢复为全局最后活动的一个会话并直接进入其详情；日期按服务端显示的本地时区和 turn 开始时间归属。

## 验证

```powershell
pnpm typecheck
pnpm test
pnpm build
```

测试使用 `tests/fixtures/synthetic-rollout.jsonl`，不会读取真实会话。

## Windows 托盘

生产构建后可以编译托盘宿主：

```powershell
pnpm build
pnpm tray:build
```

Windows 托盘程序使用 .NET Framework WinForms 管理 Next.js 生产服务，并通过 PowerShell 启动器发现 Node/pnpm 运行时。托盘使用 Windows Job Object 持有完整服务进程树；正常退出、崩溃或被强制结束时，PowerShell/pnpm/Node 会一并停止。托盘程序需要和项目目录中的 `.next`、`scripts/start-dashboard.ps1` 一起保留，默认服务地址是 `http://127.0.0.1:3002`。

端口 3002 已被占用时，托盘会联合核验健康接口的 `instanceId`、`%LOCALAPPDATA%\CodexTokenDesk\server.json`、PID/启动时间和实际进程链。只有确认属于当前项目的残留实例才会被清理；未知程序不会被终止。生命周期日志保存在 `%LOCALAPPDATA%\CodexTokenDesk\logs\lifecycle.log`。

托盘生命周期集成测试会实际启动和终止本机测试实例，运行前需确保 3002 没有需要保留的服务：

```powershell
pnpm tray:test
```

## 隐私

这是本机只读工具。会话列表只返回摘要，完整 prompt/agent output 只随当前选中会话返回给浏览器；界面会明确标注敏感内容。不要把 Dashboard 暴露到局域网或公网，也不要把真实 rollout 文件提交到 Git。

MIT License.
