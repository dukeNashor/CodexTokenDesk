"use client";

import { useMemo } from "react";

import { ChevronIcon, ConversationIcon, ExplorerIcon, FolderIcon, RecentIcon, SearchIcon } from "@/components/icons";
import { filterNavigationSessions, modelWatermarkLabel, navigationEffortLabel, navigationModelColor, visibleProjectIdsForSessions } from "@/lib/session-navigation";
import { formatCount, formatTokens, type TokenUnit } from "@/lib/token-display";
import type { ProjectIdentity, SessionNavigationItem } from "@/lib/types";

export type NavigationView = "project" | "recent";

type Props = {
  projects: ProjectIdentity[];
  sessions: SessionNavigationItem[];
  recentSelectedIds: Set<string>;
  openedId: string | null;
  view: NavigationView;
  query: string;
  unit: TokenUnit;
  selectedModels: Set<string>;
  expandedProjectIds: Set<string>;
  onViewChange: (view: NavigationView) => void;
  onQueryChange: (query: string) => void;
  onRecentSelectionChange: (ids: Set<string>) => void;
  onExpandedProjectIdsChange: (ids: Set<string>) => void;
  onOpenSession: (id: string) => void;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function SessionWatermark({ model }: { model: string }) {
  return <span className="session-watermark" aria-hidden="true">{modelWatermarkLabel(model)}</span>;
}

export function SessionNavigator(props: Props) {
  const {
    projects, sessions, recentSelectedIds, openedId, view, query, unit, selectedModels, expandedProjectIds,
    onViewChange, onQueryChange, onRecentSelectionChange, onExpandedProjectIdsChange, onOpenSession,
  } = props;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredSessions = useMemo(() => filterNavigationSessions(sessions, selectedModels, query), [query, selectedModels, sessions]);
  const filteredIds = useMemo(() => new Set(filteredSessions.map((session) => session.metadata.threadId)), [filteredSessions]);
  const projectSessionIds = useMemo(() => new Map(projects.map((project) => [project.id, sessions.filter((session) => session.metadata.projectId === project.id).map((session) => session.metadata.threadId)])), [projects, sessions]);
  const autoExpanded = useMemo(() => normalizedQuery ? new Set([...expandedProjectIds, ...filteredSessions.map((session) => session.metadata.projectId)]) : expandedProjectIds, [expandedProjectIds, filteredSessions, normalizedQuery]);
  const visibleProjectIds = useMemo(() => visibleProjectIdsForSessions(filteredSessions), [filteredSessions]);

  const toggleExpanded = (projectId: string) => {
    const next = new Set(expandedProjectIds);
    if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
    onExpandedProjectIdsChange(next);
  };
  const toggleRecent = (id: string) => {
    const next = new Set(recentSelectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onRecentSelectionChange(next);
  };

  const sessionRow = (session: SessionNavigationItem) => {
    const id = session.metadata.threadId;
    const model = session.metadata.primaryModel;
    const isPlanExcluded = modelWatermarkLabel(model) === "Spark";
    return <div
      className={`explorer-session-row${openedId === id ? " opened" : ""}${isPlanExcluded ? " plan-excluded" : ""}`}
      data-navigator-item key={id} role="button" tabIndex={0}
      style={{ "--model-color": navigationModelColor(model) } as React.CSSProperties}
      onClick={() => onOpenSession(id)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenSession(id); } }}
      aria-label={`${session.metadata.title}，${model}，最后活跃 ${formatDate(session.metadata.lastActivityAt)}`}
    >
      <ConversationIcon className="navigator-icon" />
      <SessionWatermark model={model} />
      {isPlanExcluded && <span className="session-plan-status">计划外</span>}
      <span className="explorer-session-copy"><strong>{session.metadata.title}</strong><small>{formatDate(session.metadata.lastActivityAt)}</small><em>{formatTokens(session.range.usage.total, unit)} Token</em></span>
      <span className="session-effort">{navigationEffortLabel(session.metadata.efforts)}</span>
    </div>;
  };

  return <section className="session-navigator">
    <div className="navigator-view-tabs" aria-label="会话导航视图">
      <button className={view === "project" ? "active" : ""} type="button" onClick={() => onViewChange("project")}><ExplorerIcon />项目</button>
      <button className={view === "recent" ? "active" : ""} type="button" onClick={() => onViewChange("recent")}><RecentIcon />最近</button>
    </div>
    <label className="search-field nav-search"><SearchIcon /><input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索会话、项目、模型或 ID" /></label>
    {view === "project" ? <div className="project-explorer">
      {projects.filter((project) => visibleProjectIds.has(project.id)).map((project) => {
        const ids = projectSessionIds.get(project.id) ?? [];
        const visibleCount = ids.filter((id) => filteredIds.has(id)).length;
        const projectSessions = sessions.filter((session) => session.metadata.projectId === project.id);
        const lastActivity = projectSessions.map((session) => session.metadata.lastActivityAt).filter(Boolean).sort().at(-1) ?? null;
        const expanded = autoExpanded.has(project.id);
        return <section className="project-explorer-group" key={project.id}>
          <div className="project-tile" data-navigator-item>
            <button className={`project-chevron${expanded ? " expanded" : ""}`} type="button" onClick={() => toggleExpanded(project.id)} aria-label={`${expanded ? "折叠" : "展开"}${project.label}`}><ChevronIcon /></button>
            <button className="project-tile-main" type="button" onClick={() => toggleExpanded(project.id)} aria-label={`${expanded ? "折叠" : "展开"}${project.label} 项目`}>
              <FolderIcon className="project-folder" />
              <span className="project-tile-copy"><strong>{project.label}</strong><small>{formatCount(visibleCount)} / {formatCount(ids.length)} 个会话 · {formatCount(project.sessionCount)} rollout · {formatCount(project.worktrees.length)} worktree</small><em>最后活动 {formatDate(lastActivity)}</em></span>
            </button>
          </div>
          {expanded && <div className="project-session-children">{projectSessions.filter((session) => filteredIds.has(session.metadata.threadId)).map(sessionRow)}</div>}
        </section>;
      })}
      {!filteredSessions.length && <p className="navigator-empty">没有匹配的会话。</p>}
    </div> : <div className="recent-session-list">
      {filteredSessions.map((session) => {
        const id = session.metadata.threadId;
        const model = session.metadata.primaryModel;
        const isPlanExcluded = modelWatermarkLabel(model) === "Spark";
        return <div className={`recent-session-row${openedId === id ? " opened" : ""}${isPlanExcluded ? " plan-excluded" : ""}`} key={id} data-navigator-item style={{ "--model-color": navigationModelColor(model) } as React.CSSProperties} onClick={() => onOpenSession(id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenSession(id); } }} aria-label={`${session.metadata.title}，${session.metadata.projectLabel}，${model}，最后活跃 ${formatDate(session.metadata.lastActivityAt)}`}>
          <ConversationIcon className="navigator-icon" />
          <SessionWatermark model={model} />
          {isPlanExcluded && <span className="session-plan-status">计划外</span>}
          <span className="recent-session-copy"><strong>{session.metadata.title}</strong><small>{session.metadata.projectLabel} · {formatDate(session.metadata.lastActivityAt)}</small><em>{formatTokens(session.range.usage.total, unit)} Token</em></span>
          <span className="session-effort">{navigationEffortLabel(session.metadata.efforts)}</span>
          <input type="checkbox" checked={recentSelectedIds.has(id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleRecent(id)} aria-label={`选择 ${session.metadata.title}`} />
        </div>;
      })}
      {!filteredSessions.length && <p className="navigator-empty">没有匹配的会话。</p>}
    </div>}
    <div className="navigator-selection-footer">{view === "project" ? <>当前筛选 {formatCount(filteredSessions.length)} / 全部 {formatCount(sessions.length)} 个会话</> : <>已选 {formatCount(recentSelectedIds.size)} · 当前显示 {formatCount(filteredSessions.length)}</>}</div>
  </section>;
}
