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
- 界面采用米灰实体仪表面板和深绿 LCD，保留左侧项目/会话列表、斜向模型标记与角标；订阅读数仅保留金额和估算角标，费率依据可展开。
- 会话默认显示 Token/Context 轮次轨道，每组按容器宽度自适应（最多 16 轮）、各组共享 Token 刻度，由外层页面统一滚动；同来源 Context 跨轮连接，主会话与子代理使用独立线色，未知处断开，压缩使用琥珀跳降标记。摘要与两块主图按桌面首屏约 90% 高度布局，Token/Context 按 40/60 分配主图高度，刻度使用 20px 像素字；窄屏保留可读最小高度。来源不再单独占行，悬停 Context 曲线在鼠标旁显示来源名称，并高亮同来源曲线。保留逐轮分段和工具下钻。点击或按 Enter/空格打开轮次，多次工具调用先展开列表。工具沿用现有类别筛选，未勾选类别不显示。
- 可切换原 Token/Context 双环，保留子代理/工具卫星及原交互；构成图、累计图、热力明细、详情面板和模型 Donut 继续可用。轨道横轴按轮次排列，轮内 Context 位置按 Token 偏移映射，不表示真实时间间隔。
- Sol 等价使用带来源与核验日期的公开 API 文本 Token 费率估算；Spark 单独列示
- 订阅积分卡片显示总览、会话及单轮的美元等值估算，按 2026-09-07 核验的[订阅积分表](https://learn.chatgpt.com/docs/pricing#token-rates)计算。用户确认仅使用订阅，因此不识别认证渠道、不提供 API 美元视图，也不提供手动指定。所有历史用量按当前费率重估，金额始终带“估算”角标，不代表真实积分扣款或套餐额度百分比。
- 每个有效 Token 增量保留当时的模型、`service_tier`、输入/缓存/输出用量。`fast`/`priority` 使用订阅 Fast 倍率（Astra、GPT-5.6、GPT-5.5 为 2.5；GPT-5.4 为 2）。模式缺失、不支持或逐请求用量无法核对时按 Standard 估算并说明原因。Batch/Flex 属于 API 档位，不对订阅套用折扣。未知模型沿用 Sol 标准费率回退并标注；Spark 未公布积分价，只计 Token。
- 单次输入峰值使用与累计增量核对一致的 `last_token_usage.input_tokens`（包含缓存），不使用窗口容量、输出或整轮累计量判断。针对支持扩展上下文的模型，超过 272,000 输入 Token 的记录标明“订阅积分加价规则未确认”，保持基础积分费率；当前官方订阅文档未给出可确认的长上下文积分倍率，不能套用 API 的输入 2 倍／输出 1.5 倍。逐请求信息缺失时显示上下文未知。订阅积分表未单列缓存写入，已记录写入计入普通输入并标注估算，不额外套 API 写入费率。图像、工具和区域附加费不在本次范围内。
- 原有 Sol 等价指标仍按 2026-09-06 核验的[API 标准费率](https://developers.openai.com/api/docs/pricing)比较模型用量：Astra 每百万 Token 输入 $10、缓存读取 $1、缓存写入 $12.50、输出 $50，Sol 等价倍率为 2.5。此比较指标保持按整轮汇总，不应用长上下文、Fast、Batch/Flex 或附加费；缺失的缓存写入无法补算，多模型轮次仍按 Sol 回退。订阅消耗应查看独立的 credits 卡片。
- 浏览器每 3 秒轮询 `/api/report`
- 摘要合为标题下方的一块紧凑 LCD：订阅积分和总 Token 为主读数，轮次、缓存命中率、工具调用、压缩次数为辅助读数；输入输出与积分模型明细可展开。按每 Credit $0.04 换算美元等值，忽略购买折扣；美元四舍五入为整数并显示 `$`，小额可显示 `$0`，底层计算不取整。换算基准对照[官方美元表](https://help.openai.com/en/articles/20001415-chatgpt-rate-card-enterprise-token-based-pricing)与积分表，属于美元等值估算而非个人订阅账单；积分表的 mini 输出费率有取整差异。Sol 当前公开价包含官方促销，促销后价格未确认，不反推未知价格。所有液晶读数共用本地 DSEG7 Classic 字体，单位与中文保留界面字体，无跳字动画；字体来自 [DSEG v0.46](https://github.com/keshikan/DSEG/releases/tag/v0.46)，按 `public/fonts/DSEG-LICENSE.txt` 中的 SIL OFL 1.1 随包分发，运行时不请求外部字体服务。
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

Windows 托盘程序使用 .NET Framework WinForms 管理 Next.js 生产服务，并通过 Windows Job Object 持有完整服务进程树。

要生成无需安装 Node.js/pnpm、也无需保留源码的 Windows x64 standalone 包：

```powershell
pnpm standalone:package
```

脚本会启用 Next.js standalone 输出，下载并校验固定版本的官方便携版 Node.js，只把 `node.exe`、standalone 服务文件和静态资源放进发布目录，然后生成 `dist/CodexTokenDesk-standalone-win-x64.zip`。解压后可从任意目录双击 `CodexTokenDesk.exe`；运行时仍从当前用户的 `%USERPROFILE%\\.codex\\sessions` 和 `archived_sessions` 读取 rollout 数据，默认服务地址是 `http://127.0.0.1:3002`。

standalone 包不包含项目源码、`node_modules`、pnpm 或开发依赖。托盘直接启动包内的 `runtime/node/node.exe` 和 `.next/standalone/server.js`；正常退出、崩溃或被强制结束时，Node 服务进程会一并停止。

生成包后可用以下命令在全新临时目录中验证其独立性：

```powershell
pnpm standalone:test
```

端口 3002 已被占用时，托盘会联合核验健康接口的 `instanceId`、`%LOCALAPPDATA%\CodexTokenDesk\server.json`、PID/启动时间和实际进程链。只有确认属于当前项目的残留实例才会被清理；未知程序不会被终止。生命周期日志保存在 `%LOCALAPPDATA%\CodexTokenDesk\logs\lifecycle.log`。

托盘生命周期集成测试会实际启动和终止本机测试实例，运行前需确保 3002 没有需要保留的服务：

```powershell
pnpm tray:test
```

## 隐私

这是本机只读工具。会话列表只返回摘要，完整 prompt/agent output 只随当前选中会话返回给浏览器；界面会明确标注敏感内容。不要把 Dashboard 暴露到局域网或公网，也不要把真实 rollout 文件提交到 Git。

MIT License.

图表字符使用本地 [Fusion Pixel Font 2026.07.20](https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.07.20) 简体中文点阵字体，数字主读数继续使用 DSEG7。字体及上游许可证随 `public/fonts/fusion-pixel-licenses/` 分发，运行时无外部字体请求。

- 单轮／子代理详情以右侧浮动检视面板展示，不调整背景布局；桌面左右方向键按当前筛选后的轮次顺序切换，同来源按钮跳过其他来源，首尾停止。输入控件和文本选择保留原生按键行为。窄屏全屏显示，返回后恢复焦点。摘要采用液晶读数，元数据与估算依据折叠，消息支持 Markdown 排版／原文切换。

- 轨道默认完整显示当前筛选的所有轮次。七槽拨杆提供自动、1.5×、2×、3×、4×、6×、全部，记住档位偏好；高密度时减少文字。左侧滚花拨轮支持滚轮、拖动和上下键，每次移动同屏轮次的 5%（四舍五入且至少一轮），保留按组翻页。不同代理交错的轮次之间留空，不跨列延续 Context 曲线。
