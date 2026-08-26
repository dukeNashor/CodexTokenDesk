"use client";

import { useEffect, useMemo, useState } from "react";

import { CumulativeChart, TurnCompositionChart, TurnHeatTable } from "@/components/analysis-charts";
import { InfoIcon } from "@/components/icons";
import { ModelUsageDonuts } from "@/components/model-usage-donuts";
import { SessionNavigator, type NavigationView } from "@/components/session-navigator";
import { TokenContextRing } from "@/components/token-context-ring";
import { TurnDetailDrawer } from "@/components/turn-detail-drawer";
import { usePolling } from "@/hooks/use-polling";
import { filterNavigationSessions, retainAvailableModelSelection, summarySessionIds } from "@/lib/session-navigation";
import { formatCount, formatTokens, isLcdValue, TOKEN_UNIT_LABELS, TOKEN_UNIT_ORDER, type TokenUnit } from "@/lib/token-display";
import { DEFAULT_VISIBLE_TOOL_CATEGORIES, toolCategoryColor, toolCategoryLabel } from "@/lib/tool-display";
import type { AggregatedTurnReport, LiveSnapshot, ProjectSession, ProjectSessionListItem, ToolCall, Usage, WarningRecord } from "@/lib/types";

type Range = "today" | "7d" | "30d" | "all" | "custom";
type View = "total" | "session";
type AnalysisTab = "composition" | "cumulative" | "detail" | "session";

function initialParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function modelColor(model: string): string {
  const palette = ["#3b8b78", "#4f78a8", "#bd7556", "#8c78bd", "#6d8c45", "#a56c3f"];
  if (model === "Spark") return "#c23b75";
  let hash = 0;
  for (let index = 0; index < model.length; index += 1) hash = (hash * 31 + model.charCodeAt(index)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function normalizeModelKey(model: string): string {
  return model.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

function turnMatchesSelectedModels(models: string[], selectedModels: ReadonlySet<string>): boolean {
  if (!selectedModels.size) return true;
  const names = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  if (!names.length) return selectedModels.has("未知模型");
  if (names.length > 1) return selectedModels.has("多模型");
  const modelKey = normalizeModelKey(names[0]);
  return [...selectedModels].some((selectedModel) => {
    const selectedKey = normalizeModelKey(selectedModel);
    return selectedKey.includes(modelKey) || modelKey.includes(selectedKey);
  });
}

function usageTotal(usage: Usage): number { return usage.total || usage.input + usage.output; }

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function TokenUnitControl({ unit, onChange }: { unit: TokenUnit; onChange: (unit: TokenUnit) => void }) {
  return <div className="token-unit-control" role="group" aria-label="Token 单位">
    {TOKEN_UNIT_ORDER.map((item) => <button type="button" key={item} aria-pressed={unit === item} onClick={() => onChange(item)}>{TOKEN_UNIT_LABELS[item]}</button>)}
  </div>;
}

function PrivacyInfo() {
  return <details className="privacy-info"><summary aria-label="数据与隐私说明"><InfoIcon /></summary><div role="note"><strong>本机数据</strong><span>报告只读取本机 rollout；完整消息不会发送到外部。</span></div></details>;
}

function SummaryBrief({ usage, turns, tools, compactions, unit, stacked = false }: { usage: Usage; turns: number; tools: number; compactions: number; unit: TokenUnit; stacked?: boolean }) {
  const total = formatTokens(usage.total, unit);
  const turnCount = formatCount(turns);
  const cached = formatTokens(usage.cached, unit);
  return <section className={`summary-brief${stacked ? " stacked" : ""}`} aria-label="实时摘要"><div className="brief-head"><span>实时摘要</span></div><div className="brief-grid">
    <div className="brief-item"><span className="label">总 Token</span><strong className={`value${isLcdValue(total) ? " lcd-value" : ""}`}>{total}</strong><small className="note">输入 {formatTokens(usage.input, unit)} · 输出 {formatTokens(usage.output, unit)}</small></div>
    <div className="brief-item"><span className="label">轮次</span><strong className={`value${isLcdValue(turnCount) ? " lcd-value" : ""}`}>{turnCount}</strong><small className="note">当前会话与日期范围</small></div>
    <div className="brief-item"><span className="label">缓存输入</span><strong className={`value${isLcdValue(cached) ? " lcd-value" : ""}`}>{cached}</strong><small className="note">{usage.input ? `${(100 * usage.cached / usage.input).toFixed(1)}% 输入命中` : "无输入"}</small></div>
    <div className="brief-item"><span className="label">工具 / 压缩</span><strong className="value">{formatCount(tools)} / {formatCount(compactions)}</strong><small className="note">工具调用 / Context Compaction</small></div>
  </div></section>;
}

function WarningsPanel({ warnings, integrityErrors, warningCount }: { warnings: WarningRecord[]; integrityErrors: number; warningCount: number }) {
  if (!warnings.length) return null;
  return <section className="warnings"><header className="chart-head"><div><h3>解析提示</h3><p>{integrityErrors} 个完整性异常 · {warningCount} 条提示</p></div></header><div className="warning-list">{warnings.slice(0, 12).map((warning, index) => <div className={`warning-row ${warning.severity}`} key={`${warning.code}-${index}`}><span>{warning.severity === "error" ? "!" : "·"}</span><div><strong>{warning.code}</strong><p>{warning.message}</p></div></div>)}</div></section>;
}

function SessionDetails({ session, warnings }: { session: ProjectSession; warnings: WarningRecord[] }) {
  return <div className="session-details"><header className="chart-head"><div><h3>会话详情</h3><p>标识、来源与解析状态</p></div></header><dl className="session-detail-grid">
    <div><dt>项目</dt><dd>{session.metadata.projectLabel}</dd></div>
    <div><dt>模型</dt><dd>{session.metadata.primaryModel}</dd></div>
    <div><dt>活动时间</dt><dd>{formatDate(session.metadata.rangeFirstActivityAt)} — {formatDate(session.metadata.rangeLastActivityAt)}</dd></div>
    <div><dt>Rollout</dt><dd>{formatCount(session.metadata.rolloutCount)}</dd></div>
    <div><dt>Thread ID</dt><dd>{session.metadata.threadId}</dd></div>
    <div><dt>来源类型</dt><dd>{session.metadata.sourceKinds.join(" + ")}</dd></div>
    <div className="detail-span"><dt>工作目录</dt><dd>{session.metadata.cwd || "—"}</dd></div>
    <div className="detail-span"><dt>来源路径</dt><dd>{session.metadata.sourcePaths.join("\n") || "—"}</dd></div>
    <div><dt>子代理口径</dt><dd className="metric-with-info">{session.metadata.subagentBaselineApplied ? "已剔除基线" : "未应用基线"}<details className="metric-info"><summary aria-label="子代理口径说明"><InfoIcon /></summary><div role="note">子代理 Token 只计算进入当前会话后的增量，避免把启动前的累计值重复计入。</div></details></dd></div>
  </dl><WarningsPanel warnings={warnings} integrityErrors={session.summary.integrityErrorCount} warningCount={session.summary.warningCount} /></div>;
}

function DailyUsage({ daily, unit }: { daily: Array<{ date: string; usage: Usage }>; unit: TokenUnit }) {
  const max = Math.max(1, ...daily.map((entry) => entry.usage.total));
  return <section className="daily-card"><header className="chart-head"><div><h3>日期用量</h3><p>按服务端时区与 turn 开始时间归属</p></div></header><div className="daily-bars">{daily.length ? daily.map((entry) => <div className="daily-row" key={entry.date}><time>{entry.date}</time><div><span style={{ width: `${100 * entry.usage.total / max}%` }} /></div><strong>{formatTokens(entry.usage.total, unit)}</strong></div>) : <p className="empty-copy">当前范围没有日期桶。</p>}</div></section>;
}

export function Dashboard() {
  const params = initialParams();
  const [legacyProjectIds] = useState<string[]>(() => params.get("projects")?.split(",").filter(Boolean) ?? []);
  const [recentSelectedSessionIds, setRecentSelectedSessionIds] = useState<Set<string>>(new Set());
  const [projectFilteredSessionIds, setProjectFilteredSessionIds] = useState<Set<string>>(new Set());
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const [initialLocationHasView] = useState(() => params.has("view") || params.has("session"));
  const [navigationView, setNavigationView] = useState<NavigationView>(() => params.get("nav") === "recent" ? "recent" : "project");
  const [range, setRange] = useState<Range>(() => (["today", "7d", "30d", "all", "custom"].includes(params.get("range") ?? "") ? params.get("range") as Range : "7d"));
  const [from, setFrom] = useState(() => params.get("from") ?? "");
  const [to, setTo] = useState(() => params.get("to") ?? "");
  const [view, setView] = useState<View>(() => params.get("view") === "session" || params.has("session") ? "session" : "total");
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("session"));
  const [selectedModels, setSelectedModels] = useState<Set<string>>(() => new Set(params.get("models")?.split(",").filter(Boolean) ?? []));
  const [sessionQuery, setSessionQuery] = useState("");
  const [turnQuery, setTurnQuery] = useState("");
  const [statuses, setStatuses] = useState<Set<AggregatedTurnReport["status"]>>(new Set(["complete", "aborted", "incomplete"]));
  const [toolCategories, setToolCategories] = useState<Set<string>>(() => new Set(DEFAULT_VISIBLE_TOOL_CATEGORIES));
  const [unit, setUnit] = useState<TokenUnit>("M");
  const [scale, setScale] = useState<"linear" | "log">("linear");
  const [tab, setTab] = useState<AnalysisTab>("composition");
  const [drawerTurn, setDrawerTurn] = useState<AggregatedTurnReport | null>(null);
  const [drawerTool, setDrawerTool] = useState<ToolCall | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const requestedSessionIds = navigationView === "project" ? projectFilteredSessionIds : recentSelectedSessionIds;

  const apiUrl = useMemo(() => {
    const query = new URLSearchParams();
    if (!selectionInitialized) {
      legacyProjectIds.forEach((project) => query.append("project", project));
    }
    query.set("range", range);
    if (range === "custom") { if (from) query.set("from", from); if (to) query.set("to", to); }
    if (view === "session" && selectedId) query.set("session", selectedId);
    return `/api/report?${query.toString()}`;
  }, [from, legacyProjectIds, range, selectedId, selectionInitialized, to, view]);
  const reportRequest = useMemo(() => selectionInitialized ? { method: "POST" as const, body: JSON.stringify({ selectedSessionIds: [...requestedSessionIds] }) } : undefined, [requestedSessionIds, selectionInitialized]);
  const { data, error, loading, refreshing, refresh } = usePolling<LiveSnapshot>(apiUrl, 3000, reportRequest);
  const report = data?.report;
  const selected = report?.selectedSession ?? null;
  const sessions = report?.sessions ?? [];

  useEffect(() => {
    if (!report || selectionInitialized) return;
    const initialIds = new Set(report.metadata.selection.sessionIds);
    const initialProjectIds = new Set(filterNavigationSessions(report.navigationSessions, selectedModels, sessionQuery).map((session) => session.metadata.threadId));
    const initialId = report.metadata.selection.sessionIds[0] ?? null;
    setRecentSelectedSessionIds(initialIds);
    setProjectFilteredSessionIds(initialProjectIds);
    const initialProject = report.metadata.projects.find((project) => report.navigationSessions.some((session) => initialIds.has(session.metadata.threadId) && session.metadata.projectId === project.id));
    if (initialProject) setExpandedProjectIds(new Set([initialProject.id]));
    if (initialId && (!initialLocationHasView || (view === "session" && !selectedId))) setSelectedId(initialId);
    if (initialId && !initialLocationHasView) setView("session");
    setSelectionInitialized(true);
  }, [initialLocationHasView, report, selectedId, selectedModels, selectionInitialized, sessionQuery, view]);

  useEffect(() => {
    const restore = () => {
      const restored = new URLSearchParams(window.location.search);
      const restoredRange = restored.get("range");
      setRange((["today", "7d", "30d", "all", "custom"] as string[]).includes(restoredRange ?? "") ? restoredRange as Range : "7d");
      setFrom(restored.get("from") ?? "");
      setTo(restored.get("to") ?? "");
      setView(restored.get("view") === "session" ? "session" : "total");
      setSelectedId(restored.get("session"));
      setSelectedModels(new Set(restored.get("models")?.split(",").filter(Boolean) ?? []));
      setNavigationView(restored.get("nav") === "recent" ? "recent" : "project");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    if (!selectionInitialized) return;
    const next = new URLSearchParams();
    next.set("range", range);
    if (range === "custom") { if (from) next.set("from", from); if (to) next.set("to", to); }
    next.set("view", view);
    if (view === "session" && selectedId) next.set("session", selectedId);
    if (selectedModels.size) next.set("models", [...selectedModels].join(","));
    next.set("nav", navigationView);
    const rendered = next.toString();
    const target = rendered ? `${window.location.pathname}?${rendered}` : window.location.pathname;
    if (`${window.location.pathname}${window.location.search}` !== target) window.history.pushState(null, "", target);
  }, [from, navigationView, range, selectedId, selectedModels, selectionInitialized, to, view]);

  useEffect(() => {
    setToolCategories(new Set(DEFAULT_VISIBLE_TOOL_CATEGORIES));
  }, [selected?.metadata.threadId]);

  useEffect(() => {
    if (!report) return;
    setSelectedModels((current) => {
      const next = retainAvailableModelSelection(current, report.navigationModelUsage);
      return next.size === current.size ? current : next;
    });
  }, [report]);

  const filteredNavigationSessions = useMemo(() => filterNavigationSessions(report?.navigationSessions ?? [], selectedModels, sessionQuery), [report?.navigationSessions, selectedModels, sessionQuery]);
  const visibleNavigationIds = useMemo(() => new Set(filteredNavigationSessions.map((session) => session.metadata.threadId)), [filteredNavigationSessions]);
  const summarySelectionIds = useMemo(() => summarySessionIds(navigationView, filteredNavigationSessions, recentSelectedSessionIds), [filteredNavigationSessions, navigationView, recentSelectedSessionIds]);
  const summarySelectionIdSet = useMemo(() => new Set(summarySelectionIds), [summarySelectionIds]);
  const filteredSessions = useMemo(() => sessions.filter((session) => visibleNavigationIds.has(session.metadata.threadId)), [sessions, visibleNavigationIds]);
  useEffect(() => {
    if (!report || !selectionInitialized) return;
    const next = new Set(filteredNavigationSessions.map((session) => session.metadata.threadId));
    setProjectFilteredSessionIds((current) => sameStringSet(current, next) ? current : next);
  }, [filteredNavigationSessions, report, selectionInitialized]);
  const visibleTurns = useMemo(() => {
    if (!selected) return [];
    const query = turnQuery.trim().toLocaleLowerCase();
    return selected.turns.filter((turn) => {
      const statusMatches = statuses.has(turn.status);
      const modelMatches = turnMatchesSelectedModels(turn.models, selectedModels);
      const text = `${turn.turnId} ${turn.sourceLabel} ${turn.models.join(" ")} ${turn.messages.map((message) => message.text).join(" ")}`.toLocaleLowerCase();
      return statusMatches && modelMatches && (!query || text.includes(query));
    });
  }, [selected, selectedModels, statuses, turnQuery]);
  const toolFilterCategories = useMemo(() => {
    const discovered = Object.keys(selected?.summary.toolCategories ?? {}).filter((category) => !DEFAULT_VISIBLE_TOOL_CATEGORIES.includes(category as (typeof DEFAULT_VISIBLE_TOOL_CATEGORIES)[number]));
    discovered.sort((left, right) => toolCategoryLabel(left).localeCompare(toolCategoryLabel(right)));
    return [...DEFAULT_VISIBLE_TOOL_CATEGORIES, ...discovered];
  }, [selected?.summary.toolCategories]);
  const selectedProjectCount = useMemo(() => new Set(report?.navigationSessions.filter((session) => summarySelectionIdSet.has(session.metadata.threadId)).map((session) => session.metadata.projectId) ?? []).size, [report?.navigationSessions, summarySelectionIdSet]);
  const overviewTitle = navigationView === "project" ? "当前筛选总览" : "所选会话总览";
  const overviewCount = navigationView === "project"
    ? `${formatCount(summarySelectionIds.length)} 个会话 · ${formatCount(report?.summary.turnCount ?? 0)} 轮`
    : `当前统计 ${formatCount(report?.summary.sessionCount ?? 0)} / 已选 ${formatCount(recentSelectedSessionIds.size)} 个会话`;

  const toggleModel = (model: string) => setSelectedModels((current) => { const next = new Set(current); if (next.has(model)) next.delete(model); else next.add(model); return next; });
  const toggleStatus = (status: AggregatedTurnReport["status"]) => setStatuses((current) => { const next = new Set(current); if (next.has(status) && next.size > 1) next.delete(status); else next.add(status); return next; });
  const toggleTool = (category: string) => setToolCategories((current) => { const next = new Set(current); if (next.has(category)) next.delete(category); else next.add(category); return next; });
  const resetAnalysisFilters = () => { setTurnQuery(""); setStatuses(new Set(["complete", "aborted", "incomplete"])); setToolCategories(new Set(DEFAULT_VISIBLE_TOOL_CATEGORIES)); setScale("linear"); };
  const openSession = (session: ProjectSessionListItem | string) => { setSelectedId(typeof session === "string" ? session : session.metadata.threadId); setView("session"); setNavOpen(false); };
  const openTurn = (turn: AggregatedTurnReport) => { setDrawerTurn(turn); setDrawerTool(null); };
  const openTool = (turn: AggregatedTurnReport, tool: ToolCall) => { setDrawerTurn(turn); setDrawerTool(tool); };
  const closeDrawer = () => { setDrawerTurn(null); setDrawerTool(null); };

  if (loading && !report) return <main className="boot"><div className="brand-mark">CT</div><h1>正在接通 Token Desk…</h1><p>扫描本机 Codex rollout 文件。</p></main>;
  if (!report) return <main className="boot"><div className="brand-mark">CT</div><h1>Token Desk 暂不可用</h1><p>{error || "服务没有返回报告。"}</p></main>;

  return <main className="app-shell">
    <div className={`report-layout${navCollapsed ? " nav-collapsed" : ""}`}>
      <button className={`nav-scrim${navOpen ? " open" : ""}`} type="button" onClick={() => setNavOpen(false)} aria-label="关闭导航" />
      <aside className={`report-nav${navOpen ? " open" : ""}`}>
        <div className="nav-rail"><button type="button" onClick={() => setNavCollapsed(false)} aria-label="展开会话导航"><span className="brand-mark">CT</span><span aria-hidden="true">›</span></button></div>
        <div className="nav-expanded">
          <header className="nav-head"><div className="brand"><div className="brand-mark">CT</div><div><strong>Codex Token Desk</strong><span>本机实时监控</span></div></div><button className="icon-button nav-collapse" type="button" onClick={() => setNavCollapsed(true)} aria-label="收起会话导航">‹</button><button className="icon-button nav-mobile-close" type="button" onClick={() => setNavOpen(false)} aria-label="关闭会话导航">×</button></header>
          <button className={`session-button session-total-button${view === "total" ? " active" : ""}`} type="button" onClick={() => { setView("total"); setNavOpen(false); }}><span className="session-copy"><strong>{overviewTitle}</strong><small>{overviewCount}</small></span><span className="session-total">{formatTokens(report.summary.finalUsage.total, unit)}</span></button>
          <section className="date-filter"><div className="date-filter-head"><span>DATE RANGE</span><small>{report.metadata.selection.timeZone}</small></div><div className="date-presets">{(["today", "7d", "30d", "all", "custom"] as Range[]).map((item) => <button className={range === item ? "active" : ""} type="button" key={item} onClick={() => setRange(item)}>{item === "today" ? "今天" : item === "7d" ? "7 天" : item === "30d" ? "30 天" : item === "all" ? "全部" : "自定义"}</button>)}</div>{range === "custom" && <div className="date-fields"><label>开始<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>结束<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>}<p>{report.metadata.selection.from ? report.metadata.selection.from === report.metadata.selection.to ? report.metadata.selection.from : `${report.metadata.selection.from} → ${report.metadata.selection.to}` : "全部时间"}</p></section>
          <section className="model-filter"><div className="scope-heading"><span>MODELS</span>{selectedModels.size > 0 && <button type="button" onClick={() => setSelectedModels(new Set())}>重置</button>}</div><div className="model-filter-list">{report.navigationModelUsage.map((bucket) => <button key={bucket.model} type="button" className="model-filter-toggle" aria-pressed={!selectedModels.size || selectedModels.has(bucket.model)} style={{ "--model-color": modelColor(bucket.model) } as React.CSSProperties} onClick={() => toggleModel(bucket.model)}><i />{bucket.model}<small>{formatTokens(bucket.rawTokens, unit)}</small></button>)}</div></section>
          <SessionNavigator projects={report.metadata.projects} sessions={report.navigationSessions} recentSelectedIds={recentSelectedSessionIds} openedId={selectedId} view={navigationView} query={sessionQuery} unit={unit} selectedModels={selectedModels} expandedProjectIds={expandedProjectIds} onViewChange={setNavigationView} onQueryChange={setSessionQuery} onRecentSelectionChange={setRecentSelectedSessionIds} onExpandedProjectIdsChange={setExpandedProjectIds} onOpenSession={openSession} />
        </div>
      </aside>
      <section className="report-main">
        <header className="topbar"><div className="content-heading"><button className="mobile-nav-trigger" type="button" onClick={() => setNavOpen(true)} aria-label="打开导航">☰</button><div><strong>{view === "total" ? overviewTitle : selected?.metadata.primaryModel || "会话分析"}</strong><span>{report.metadata.scope.label}</span></div></div><div className="topbar-actions"><TokenUnitControl unit={unit} onChange={setUnit} /><PrivacyInfo /><div className="connection"><span className={`live-dot ${report.metadata.live.status}`} /><span>{refreshing ? "刷新中…" : error ? "连接异常" : !summarySelectionIds.length ? navigationView === "project" ? "无匹配会话" : "尚未选择" : report.metadata.live.status === "empty" ? "当前范围无活动" : "实时接通"}</span><button className="icon-button small" onClick={refresh} type="button" aria-label="立即刷新">↻</button></div></div></header>
        {error && <div className="alert error"><strong>实时服务异常：</strong> {error}</div>}
        <div className="report-content">
          {view === "total" ? <>
            <section className="hero"><div className="hero-copy"><p className="kicker">MULTI-SESSION OVERVIEW</p><h1>{report.metadata.scope.label}</h1><p className="path">{selectedProjectCount} 个项目 · {summarySelectionIds.length} 个会话 · {report.metadata.live.selectedRolloutCount} 个 rollout · {report.metadata.selection.timeZone}</p></div><SummaryBrief usage={report.summary.finalUsage} turns={report.summary.turnCount} tools={report.summary.toolCallCount} compactions={sessions.reduce((sum, session) => sum + session.summary.contextCompactions, 0)} unit={unit} /></section>
            {!summarySelectionIds.length ? <div className="empty-state scoped-empty"><h2>{navigationView === "project" ? "当前筛选没有会话" : "尚未选择会话"}</h2><p>{navigationView === "project" ? "调整日期、模型或搜索条件后再查看。" : "在最近列表中勾选一个或多个会话。"}</p></div> : report.summary.sessionCount === 0 ? <div className="empty-state scoped-empty"><h2>当前范围无活动</h2><p>会话仍保留在最近列表；可切换日期范围查看历史统计。</p></div> : <><ModelUsageDonuts models={report.summary.modelUsage} sessions={filteredSessions} rateCard={report.metadata.rateCard} unit={unit} selectedModels={selectedModels} onToggleModel={toggleModel} onSelectSession={openSession} planExcluded={report.summary.planExcludedUsage} /><DailyUsage daily={report.summary.dailyUsage} unit={unit} /></>}
          </> : selected ? <>
            <section className="session-overview" style={{ "--model-color": modelColor(selected.metadata.primaryModel) } as React.CSSProperties}>
              <header className="session-overview-head"><div className="session-title-row"><button className="back-total" type="button" onClick={() => setView("total")}>← 返回总览</button><div><h1 title={selected.metadata.title}>{selected.metadata.title}</h1><p>{selected.metadata.projectLabel}<span aria-hidden="true">·</span>{selected.metadata.primaryModel}</p></div></div></header>
              <div className="session-overview-grid"><div className="session-ring-panel"><TokenContextRing turns={visibleTurns} selectedId={drawerTurn?.turnId ?? null} selectedToolCategories={toolCategories} unit={unit} onSelectTurn={openTurn} onSelectTool={openTool} /></div><SummaryBrief stacked usage={selected.summary.finalUsage} turns={selected.summary.turnCount} tools={selected.summary.toolCallCount} compactions={selected.summary.contextCompactions} unit={unit} /></div>
            </section>
            {selected.summary.turnCount === 0 && <div className="range-empty-note">当前日期范围内没有活动；该会话仍可查看和导航。</div>}
            <section className="analysis-controls">
              <div className="filter-row"><label className="search-field"><span>⌕</span><input type="search" value={turnQuery} onChange={(event) => setTurnQuery(event.target.value)} placeholder="搜索 ID、来源、模型或消息全文" /></label><fieldset className="filter-group"><legend>状态</legend>{(["complete", "aborted", "incomplete"] as const).map((status) => <label className="filter-option" key={status}><input type="checkbox" checked={statuses.has(status)} onChange={() => toggleStatus(status)} />{status}</label>)}</fieldset>{tab === "composition" && <fieldset className="filter-group"><legend>刻度</legend>{(["linear", "log"] as const).map((item) => <label className="filter-option" key={item}><input type="radio" checked={scale === item} onChange={() => setScale(item)} />{item === "linear" ? "线性" : "对数"}</label>)}</fieldset>}<span className="visible-count">显示 {visibleTurns.length} 轮</span><button className="reset-filters" type="button" onClick={resetAnalysisFilters}>清除筛选</button></div>
              <fieldset className="tool-filter-list"><legend>工具</legend>{toolFilterCategories.map((category) => <label className="filter-option" key={category} style={{ "--tool-color": toolCategoryColor(category) } as React.CSSProperties}><input type="checkbox" checked={toolCategories.has(category)} onChange={() => toggleTool(category)} /><i />{toolCategoryLabel(category)} <small>{selected.summary.toolCategories[category] ?? 0}</small></label>)}</fieldset>
            </section>
            <section className="analysis-shell"><div className="analysis-tabbar"><nav className="analysis-tabs" aria-label="分析视图">{(["composition", "cumulative", "detail", "session"] as AnalysisTab[]).map((item) => <button className={`analysis-tab${tab === item ? " active" : ""}`} type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item === "composition" ? "单轮构成" : item === "cumulative" ? "累计趋势" : item === "detail" ? "逐轮明细" : "会话详情"}</button>)}</nav></div><div className="tab-panel">{tab === "composition" ? <TurnCompositionChart turns={visibleTurns} scale={scale} unit={unit} onSelect={openTurn} /> : tab === "cumulative" ? <CumulativeChart turns={visibleTurns} unit={unit} onSelect={openTurn} /> : tab === "detail" ? <TurnHeatTable turns={visibleTurns} unit={unit} onSelect={openTurn} /> : <SessionDetails session={selected} warnings={report.warnings} />}</div></section>
          </> : <div className="empty-state"><h2>会话不可用</h2><p>它可能已被移动或删除，请从左侧重新打开。</p></div>}
          {view === "total" && <WarningsPanel warnings={report.warnings} integrityErrors={report.summary.integrityErrorCount} warningCount={report.summary.warningCount} />}
        </div>
      </section>
    </div>
    <TurnDetailDrawer turn={drawerTurn} tool={drawerTool} unit={unit} onClose={closeDrawer} />
  </main>;
}
