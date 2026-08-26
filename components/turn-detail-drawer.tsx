"use client";

import { useEffect } from "react";

import { formatTokens, type TokenUnit } from "@/lib/token-display";
import type { AggregatedTurnReport, ToolCall } from "@/lib/types";

const formatDate = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";

export function TurnDetailDrawer({ turn, tool, unit, onClose }: { turn: AggregatedTurnReport | null; tool: ToolCall | null; unit: TokenUnit; onClose: () => void }) {
  useEffect(() => {
    if (!turn) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, turn]);
  if (!turn) return null;
  const snapshot = turn.contextSnapshot;
  return <div className="drawer-layer" role="presentation">
    <button className="drawer-backdrop" onClick={onClose} aria-label="关闭详情" type="button" />
    <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <header className="drawer-head">
        <div><p className="kicker">{tool ? "TOOL CALL" : "TURN DETAIL"}</p><h2 id="drawer-title">{tool ? tool.name : `第 ${turn.index} 轮 · ${turn.sourceLabel}`}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="关闭详情" type="button">×</button>
      </header>
      {tool ? <>
        <dl className="detail-grid">
          <div><dt>类别</dt><dd>{tool.category}</dd></div><div><dt>状态</dt><dd>{tool.status}</dd></div>
          <div><dt>Provider</dt><dd>{tool.provider || "—"}</dd></div><div><dt>调用 ID</dt><dd>{tool.callId || "—"}</dd></div>
          <div><dt>开始</dt><dd>{formatDate(tool.timestamp)}</dd></div><div><dt>结束</dt><dd>{formatDate(tool.endedAt)}</dd></div>
          <div><dt>Token</dt><dd>{tool.usageReported ? formatTokens(tool.usage.total, unit) : "未知"}</dd></div><div><dt>归因来源</dt><dd>{tool.classificationSource}</dd></div>
        </dl>
        <section className="drawer-section"><h3>工具 Token</h3><div className="token-ledger"><span>输入 <b>{formatTokens(tool.usage.input, unit)}</b></span><span>缓存 <b>{formatTokens(tool.usage.cached, unit)}</b></span><span>输出 <b>{formatTokens(tool.usage.output, unit)}</b></span><span>推理 <b>{formatTokens(tool.usage.reasoning, unit)}</b></span></div></section>
      </> : <>
        <dl className="detail-grid">
          <div><dt>状态</dt><dd>{turn.status}</dd></div><div><dt>轮次 ID</dt><dd>{turn.turnId}</dd></div>
          <div><dt>来源</dt><dd>{turn.sourceLabel}</dd></div><div><dt>模型</dt><dd>{turn.models.join(", ") || "—"}</dd></div>
          <div><dt>开始</dt><dd>{formatDate(turn.startedAt)}</dd></div><div><dt>结束</dt><dd>{formatDate(turn.endedAt)}</dd></div>
          <div><dt>Context</dt><dd>{snapshot.tokens === null ? "未知" : `${formatTokens(snapshot.tokens, unit)} / ${snapshot.windowTokens === null ? "—" : formatTokens(snapshot.windowTokens, unit)}`}</dd></div>
          <div><dt>占用率</dt><dd>{snapshot.occupancyRate === null ? "—" : `${snapshot.occupancyRate.toFixed(2)}%`}</dd></div>
        </dl>
        <section className="drawer-section"><h3>Token 构成 · {formatTokens(turn.usage.total, unit)}</h3><div className="token-ledger">
          <span>缓存输入 <b>{formatTokens(turn.breakdown.cachedInput, unit)}</b></span><span>缓存写入 <b>{formatTokens(turn.breakdown.cacheWriteInput, unit)}</b></span>
          <span>其他输入 <b>{formatTokens(turn.breakdown.otherNonCachedInput, unit)}</b></span><span>普通输出 <b>{formatTokens(turn.breakdown.ordinaryOutput, unit)}</b></span>
          <span>推理输出 <b>{formatTokens(turn.breakdown.reasoningOutput, unit)}</b></span><span>工具调用 <b>{turn.toolSummary.callCount}</b></span>
        </div></section>
        <section className="drawer-section"><h3>用户消息</h3>{turn.messages.length ? turn.messages.map((message, index) => <article className="message-block" key={`${message.timestamp}-${index}`}><time>{formatDate(message.timestamp)}</time><pre>{message.text}</pre></article>) : <p className="empty-copy">没有记录用户消息。</p>}</section>
        <section className="drawer-section"><h3>Agent 输出</h3>{turn.outputs.length ? turn.outputs.map((output, index) => <article className="message-block output" key={`${output.timestamp}-${index}`}><time>{formatDate(output.timestamp)}{output.phase ? ` · ${output.phase}` : ""}</time><pre>{output.text}</pre></article>) : <p className="empty-copy">没有记录 Agent 输出。</p>}</section>
        {turn.contextCompactions.length > 0 && <section className="drawer-section"><h3>Compaction</h3>{turn.contextCompactions.map((event, index) => <div className="compaction-row" key={`${event.timestamp}-${index}`}><time>{formatDate(event.timestamp)}</time><strong>{event.before?.tokens === null || event.before === null ? "未知" : formatTokens(event.before.tokens, unit)} → {event.after?.tokens === null || event.after === null ? "未知" : formatTokens(event.after.tokens, unit)}</strong></div>)}</section>}
      </>}
    </aside>
  </div>;
}
