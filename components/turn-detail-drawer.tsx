"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LcdTag } from "./lcd-tag";
import { SubscriptionUsageCard } from "./subscription-usage";
import { aggregateSubscriptionUsage } from "@/lib/subscription-billing";
import { formatCreditUsd } from "@/lib/credit-display";
import { formatTokens, type TokenUnit } from "@/lib/token-display";
import { adjacentTurn } from "@/lib/turn-navigation";
import type { AggregatedTurnReport, ToolCall } from "@/lib/types";
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
const statusLabel = { complete: "完成", aborted: "已中止", incomplete: "未完成" };

export function RecordText({ text, raw }: { text: string; raw: boolean }) {
  return raw ? <pre className="record-raw">{text}</pre> : <div className="record-markdown"><Markdown remarkPlugins={[remarkGfm]} components={{ a: ({children, href}) => <a href={href} target="_blank" rel="noreferrer">{children}</a>, img: ({alt, src}) => <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noreferrer">{alt || "图片"}</a> }}>{text}</Markdown></div>;
}

export function TurnDetailDrawer({ turn, tool, turns, unit, sourceColor, onSelectTurn, onClose }: {
  turn: AggregatedTurnReport | null; tool: ToolCall | null; turns: AggregatedTurnReport[]; unit: TokenUnit; sourceColor: string;
  onSelectTurn: (turn: AggregatedTurnReport) => void; onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);
  const [raw, setRaw] = useState(false);
  const opened = Boolean(turn);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!opened) return;
    const trigger = document.activeElement && "focus" in document.activeElement ? document.activeElement as HTMLElement : null;
    panel.current?.focus({ preventScroll: true });
    return () => { queueMicrotask(() => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); }); };
  }, [opened]);
  useEffect(() => {
    if (!opened || !mobile) return;
    const background = document.querySelector<HTMLElement>(".report-layout");
    const previousInert = background?.inert;
    const previousOverflow = document.body.style.overflow;
    if (background) background.inert = true;
    document.body.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    return () => { if (background) background.inert = previousInert ?? false; document.body.style.overflow = previousOverflow; };
  }, [opened, mobile]);
  useEffect(() => { body.current?.scrollTo(0, 0); }, [turn?.turnId, turn?.sourceRolloutId, tool?.sequence]);
  useEffect(() => {
    if (!turn) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (mobile && event.key === "Tab") {
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), summary, [tabindex="0"]') ?? []).filter(item => item.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (mobile || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="tab"], [role="radio"]') || window.getSelection()?.toString()) return;
      event.preventDefault();
      const next = adjacentTurn(turns, turn, event.key === "ArrowLeft" ? -1 : 1);
      if (next) onSelectTurn(next);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [turn, turns, mobile, onClose, onSelectTurn]);
  if (!turn) return null;
  const snapshot = turn.contextSnapshot;
  const usage = aggregateSubscriptionUsage([turn]);
  const navigate = (direction: -1 | 1, sameSource = false) => { const next = adjacentTurn(turns, turn, direction, sameSource); if (next) onSelectTurn(next); };
  return <div className="drawer-layer inspector-layer">
    <aside ref={panel} tabIndex={-1} className="detail-drawer turn-inspector" role="dialog" aria-modal={mobile || undefined} aria-labelledby="drawer-title" style={{ "--source-ink": sourceColor } as CSSProperties}>
      <header className="drawer-head inspector-head">
        <div><div className="inspector-source">{turn.sourceLabel}</div><h2 id="drawer-title">{tool ? tool.name : `第 ${turn.index} 轮`}</h2><div className="inspector-tags"><LcdTag>{statusLabel[turn.status]}</LcdTag>{turn.models.map(model => <LcdTag key={model} segmented>{model}</LcdTag>)}</div></div>
        <button type="button" onClick={onClose} aria-label="关闭详情">{mobile ? "返回" : "×"}</button>
      </header>
      <nav className="inspector-navigation" aria-label="轮次导航">
        <button type="button" disabled={!adjacentTurn(turns, turn, -1)} onClick={() => navigate(-1)}>← 上一轮</button>
        <button type="button" disabled={!adjacentTurn(turns, turn, 1)} onClick={() => navigate(1)}>下一轮 →</button>
        <span />
        <button type="button" aria-label="同来源上一轮" title="同来源上一轮" disabled={!adjacentTurn(turns, turn, -1, true)} onClick={() => navigate(-1, true)}>同源 ←</button>
        <button type="button" aria-label="同来源下一轮" title="同来源下一轮" disabled={!adjacentTurn(turns, turn, 1, true)} onClick={() => navigate(1, true)}>→</button>
      </nav>
      <div ref={body} className="inspector-body">
      {tool ? <><button type="button" className="inspector-back" onClick={() => onSelectTurn(turn)}>返回第 {turn.index} 轮</button><section className="inspector-tool">        <dl className="detail-grid">
          <div><dt>类别</dt><dd>{tool.category}</dd></div><div><dt>状态</dt><dd>{tool.status}</dd></div>
          <div><dt>Provider</dt><dd>{tool.provider || "—"}</dd></div><div><dt>调用 ID</dt><dd>{tool.callId || "—"}</dd></div>
          <div><dt>开始</dt><dd>{formatDate(tool.timestamp)}</dd></div><div><dt>结束</dt><dd>{formatDate(tool.endedAt)}</dd></div>
          <div><dt>Token</dt><dd>{tool.usageReported ? formatTokens(tool.usage.total, unit) : "未知"}</dd></div><div><dt>归因来源</dt><dd>{tool.classificationSource}</dd></div>
        </dl>
        <section className="drawer-section"><h3>工具 Token</h3><div className="token-ledger"><span>输入 <b>{formatTokens(tool.usage.input, unit)}</b></span><span>缓存 <b>{formatTokens(tool.usage.cached, unit)}</b></span><span>输出 <b>{formatTokens(tool.usage.output, unit)}</b></span><span>推理 <b>{formatTokens(tool.usage.reasoning, unit)}</b></span></div></section>
</section></> : <>
        <section className="inspector-readouts" aria-label="轮次摘要">
          <div><span>Token</span><strong>{formatTokens(turn.usage.total, unit)}</strong></div>
          <div><span>Context</span><strong>{snapshot.occupancyRate === null ? "未知" : `${snapshot.occupancyRate.toFixed(1)}%`}</strong></div>
          <div><span>消耗 <LcdTag className="estimate-tag">估算</LcdTag></span><strong>{formatCreditUsd(usage.estimatedCredits)}</strong>{usage.unpricedTokens > 0 && <LcdTag className="estimate-tag">含未定价</LcdTag>}</div>
          <div><span>工具调用</span><strong>{turn.toolSummary.callCount}</strong></div>
        </section>
        <details className="inspector-disclosure"><summary>读数明细</summary>        <dl className="detail-grid">
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
</details>
        <div className="inspector-estimate"><SubscriptionUsageCard usage={usage} unit={unit} detailsOnly /></div>
        <section className="record-screen">
          <header className="record-head"><h3>记录</h3><div role="group" aria-label="记录显示方式"><button type="button" aria-pressed={!raw} onClick={() => setRaw(false)}>排版</button><button type="button" aria-pressed={raw} onClick={() => setRaw(true)}>原文</button></div></header>
          <h4>用户消息</h4>
          {turn.messages.length ? turn.messages.map((message, index) => <article className="record-entry" key={index}><time>{formatDate(message.timestamp)}</time><RecordText text={message.text} raw={raw} /></article>) : <p className="record-empty">未记录</p>}
          <h4>Agent 输出</h4>
          {turn.outputs.length ? turn.outputs.map((output, index) => <article className="record-entry" key={index}><time>{formatDate(output.timestamp)}{output.phase ? ` · ${output.phase}` : ""}</time><RecordText text={output.text} raw={raw} /></article>) : <p className="record-empty">未记录</p>}
        </section>
        {turn.contextCompactions.length > 0 && <section className="drawer-section"><h3>Compaction</h3>{turn.contextCompactions.map((event, index) => <div className="compaction-row" key={`${event.timestamp}-${index}`}><time>{formatDate(event.timestamp)}</time><strong>{event.before?.tokens === null || event.before === null ? "未知" : formatTokens(event.before.tokens, unit)} → {event.after?.tokens === null || event.after === null ? "未知" : formatTokens(event.after.tokens, unit)}</strong></div>)}</section>}
      </>}
      </div>
    </aside>
  </div>;
}
