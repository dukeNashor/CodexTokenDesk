"use client";

import { useMemo, useState } from "react";

import { formatTokens, type TokenUnit } from "@/lib/token-display";
import { filterToolsByCategory, toolCategoryColor, toolCategoryLabel } from "@/lib/tool-display";
import { arcBandPath, arcLinePath, contextBands, radialEntries, radialPoint } from "@/lib/visualization-geometry";
import type { AggregatedTurnReport, ToolCall } from "@/lib/types";

const SOURCE_PALETTE = ["#3b8b78", "#4f78a8", "#bd7556", "#8c78bd", "#6d8c45", "#a56c3f"];

function hashColor(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return SOURCE_PALETTE[Math.abs(hash) % SOURCE_PALETTE.length];
}

function contextColor(rate: number | null): string {
  if (rate === null) return "#9d9385";
  if (rate >= 90) return "#c34f4f";
  if (rate >= 75) return "#c47b2f";
  if (rate >= 50) return "#b29a36";
  return "#3b8b78";
}

type Tooltip = { x: number; y: number; turn: AggregatedTurnReport; tool: ToolCall | null } | null;

export function TokenContextRing({ turns, selectedId, selectedToolCategories, unit, onSelectTurn, onSelectTool }: {
  turns: AggregatedTurnReport[];
  selectedId: string | null;
  selectedToolCategories: Set<string>;
  unit: TokenUnit;
  onSelectTurn: (turn: AggregatedTurnReport) => void;
  onSelectTool: (turn: AggregatedTurnReport, tool: ToolCall) => void;
}) {
  const [tooltip, setTooltip] = useState<Tooltip>(null);
  const [hovered, setHovered] = useState<AggregatedTurnReport | null>(null);
  const entries = useMemo(() => radialEntries(turns), [turns]);
  const total = turns.reduce((sum, turn) => sum + Math.max(0, turn.usage.total), 0);
  const peak = turns.reduce<AggregatedTurnReport | null>((best, turn) => (turn.contextSnapshot.occupancyRate ?? -1) > (best?.contextSnapshot.occupancyRate ?? -1) ? turn : best, null);
  const cx = 380;
  const cy = 308;
  const innerBase = 105;
  const innerMax = 178;
  const outerInner = 202;
  const outerOuter = 234;
  const moveTooltip = (event: React.PointerEvent, turn: AggregatedTurnReport, tool: ToolCall | null = null) => {
    if (event.pointerType === "touch") return;
    setTooltip({ x: Math.min(window.innerWidth - 340, event.clientX + 14), y: Math.min(window.innerHeight - 230, event.clientY + 14), turn, tool });
  };
  const activateTurn = (turn: AggregatedTurnReport) => onSelectTurn(turn);
  const center = hovered ?? null;
  return <div className="radial-stage">
    <div className="radial-legend">
      <span><i className="legend-line token" />外环 Token</span><span><i className="legend-line context" />内环 Context</span><span><i className="legend-dot subagent" />子代理</span><span><i className="legend-dot tool" />工具</span>
    </div>
    <svg className="context-radial" viewBox="0 0 760 650" role="img" aria-label="Token 和 Context 双环图">
      <defs>
        <pattern id="unknown-context" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="8" stroke="#8f8576" strokeWidth="2" opacity=".4" /></pattern>
        <marker id="compaction-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 Z" fill="#b77a26" /></marker>
      </defs>
      <path d={arcBandPath(cx, cy, outerInner, outerOuter, 0, 1)} fill="#e9e2d7" />
      <path d={arcBandPath(cx, cy, innerBase + (innerMax - innerBase) * .75, innerMax, 0, 1)} className="context-danger-zone" />
      {[25, 50, 75, 100].map((rate) => {
        const radius = innerBase + (innerMax - innerBase) * rate / 100;
        const point = radialPoint(cx, cy, radius, 0);
        return <g key={rate}><path d={arcLinePath(cx, cy, radius, 0, 1)} className={`context-reference${rate === 75 ? " warning" : rate === 100 ? " capacity" : ""}`} /><text x={point.x + 6} y={point.y + 3} className="context-reference-label">{rate === 100 ? "Context 100%" : `${rate}%`}</text></g>;
      })}
      <g className="radial-center" aria-hidden="true">
        <text x={cx} y={cy - 42}>{center ? `${center.sourceLabel} · ${center.status}` : "完整会话"}</text>
        <text x={cx} y={cy - 4} className="radial-center-value">{formatTokens(center?.usage.total ?? total, unit)} Token</text>
        <text x={cx} y={cy + 25}>{center ? (center.contextSnapshot.occupancyRate === null ? "Context 未知" : `Context ${center.contextSnapshot.occupancyRate.toFixed(2)}%`) : peak?.contextSnapshot.occupancyRate === null || !peak ? "Context 峰值未知" : `Context 峰值 ${peak.contextSnapshot.occupancyRate.toFixed(2)}%`}</text>
        <text x={cx} y={cy + 48}>{center ? `${center.compactions} 次 Compaction` : `${turns.reduce((sum, turn) => sum + turn.compactions, 0)} 次 Compaction`}</text>
      </g>
      {entries.map((entry) => {
        const { turn } = entry;
        const color = hashColor(turn.sourceRolloutId);
        const laneInner = outerOuter + 42 + entry.lane * 18;
        const laneOuter = laneInner + 11;
        const turnStart = entry.tokens ? entry.start : Math.max(0, entry.start - .002);
        const turnEnd = entry.tokens ? entry.end : Math.min(1, entry.start + .002);
        const selected = selectedId === turn.turnId;
        const visibleTools = filterToolsByCategory(turn.toolCalls, selectedToolCategories);
        const handleKey = (event: React.KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activateTurn(turn); } };
        return <g key={`${turn.sourceRolloutId}-${turn.turnId}`} className={`context-turn ${turn.status}${entry.satellite ? " satellite" : ""}${selected ? " selected" : ""}`} role="button" tabIndex={0} aria-label={`${turn.sourceLabel}，${formatTokens(turn.usage.total, unit)} Token`} onPointerEnter={(event) => { setHovered(turn); moveTooltip(event, turn); }} onPointerMove={(event) => moveTooltip(event, turn)} onPointerLeave={() => { setHovered(null); setTooltip(null); }} onFocus={() => setHovered(turn)} onBlur={() => setHovered(null)} onKeyDown={handleKey} onClick={() => activateTurn(turn)}>
          {entry.satellite ? <>
            <line {...(() => { const from = radialPoint(cx, cy, laneInner - 2, entry.middle); const parentEntry = entries.find((candidate) => candidate.turn === entry.parent); const to = radialPoint(cx, cy, outerOuter + 7, parentEntry?.middle ?? entry.middle); return { x1: from.x, y1: from.y, x2: to.x, y2: to.y }; })()} className="satellite-connector" />
            {entry.tokens ? <path d={arcBandPath(cx, cy, laneInner, laneOuter, turnStart, turnEnd)} fill={color} className="token-sector" /> : <line {...(() => { const a = radialPoint(cx, cy, laneInner, entry.middle); const b = radialPoint(cx, cy, laneOuter, entry.middle); return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; })()} stroke={color} />}
            <circle {...(() => { const point = radialPoint(cx, cy, laneInner - 9, entry.middle); return { cx: point.x, cy: point.y }; })()} r="3.5" fill={contextColor(turn.contextSnapshot.occupancyRate)} />
          </> : <>
            {entry.tokens ? <path d={arcBandPath(cx, cy, outerInner, outerOuter, turnStart, turnEnd)} fill={color} className="token-sector" /> : <line {...(() => { const a = radialPoint(cx, cy, innerBase, entry.middle); const b = radialPoint(cx, cy, outerOuter, entry.middle); return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; })()} stroke={color} />}
            {contextBands(turn).map((band, index) => {
              const start = (entry.tokenStart + band.start) / Math.max(1, total);
              const end = (entry.tokenStart + band.end) / Math.max(1, total);
              const rate = band.occupancyRate;
              const radius = rate === null ? innerMax : innerBase + (innerMax - innerBase) * Math.max(0, Math.min(100, rate)) / 100;
              return <g key={index}><path d={arcBandPath(cx, cy, innerBase, Math.max(innerBase + 1.5, radius), start, end)} fill={rate === null ? "url(#unknown-context)" : color} opacity={rate === null ? .72 : .2} className="context-band" />{rate !== null && <path d={arcLinePath(cx, cy, Math.max(innerBase + 1.5, radius), start, end)} stroke={contextColor(rate)} className="context-contour" />}</g>;
            })}
          </>}
          {turn.contextCompactions.map((event, index) => {
            const fraction = (entry.tokenStart + Math.max(0, Math.min(entry.tokens, event.turnTokenOffset))) / Math.max(1, total);
            const beforeRate = event.before?.occupancyRate;
            const afterRate = event.after?.occupancyRate;
            const outer = radialPoint(cx, cy, entry.satellite ? laneOuter + 9 : outerOuter + 12, fraction);
            const before = radialPoint(cx, cy, innerBase + (innerMax - innerBase) * Math.max(0, Math.min(100, beforeRate ?? 100)) / 100, fraction);
            const after = radialPoint(cx, cy, innerBase + (innerMax - innerBase) * Math.max(0, Math.min(100, afterRate ?? 100)) / 100, fraction);
            return <g className="context-compaction" key={`${event.timestamp}-${index}`}><line x1={outer.x} y1={outer.y} x2={before.x} y2={before.y} className="compaction-position-line" />{!entry.satellite && beforeRate !== null && beforeRate !== undefined && afterRate !== null && afterRate !== undefined && <line x1={before.x} y1={before.y} x2={after.x} y2={after.y} className="compaction-jump-line" markerEnd="url(#compaction-arrow)" />}<circle cx={before.x} cy={before.y} r="3.5" className="compaction-before" /><circle cx={after.x} cy={after.y} r="3.5" className="compaction-after" /></g>;
          })}
          {visibleTools.map((tool, index) => {
            const fraction = entry.start + Math.max(0.0005, entry.end - entry.start) * (index + .5) / Math.max(1, visibleTools.length);
            const radius = outerOuter + 76 + (index % 3) * 14 + entry.lane * 4;
            const point = radialPoint(cx, cy, radius, fraction);
            const parent = radialPoint(cx, cy, entry.satellite ? laneOuter + 2 : outerOuter + 3, fraction);
            return <g className="tool-satellite" key={`${tool.callId ?? tool.sequence}-${index}`} role="button" tabIndex={0} aria-label={`${toolCategoryLabel(tool.category)}，${tool.usageReported ? `${formatTokens(tool.usage.total, unit)} Token` : "Token 未知"}`} onPointerEnter={(event) => { event.stopPropagation(); moveTooltip(event, turn, tool); }} onPointerMove={(event) => { event.stopPropagation(); moveTooltip(event, turn, tool); }} onPointerLeave={(event) => { event.stopPropagation(); setTooltip(null); }} onClick={(event) => { event.stopPropagation(); onSelectTool(turn, tool); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelectTool(turn, tool); } }}>
              <line x1={parent.x} y1={parent.y} x2={point.x} y2={point.y} className="tool-satellite-connector" />
              {tool.usageReported ? <circle cx={point.x} cy={point.y} r={Math.max(4, Math.min(8, 4 + Math.log10(tool.usage.total + 1)))} fill={toolCategoryColor(tool.category)} /> : <path d={`M${point.x - 4},${point.y - 4} L${point.x + 4},${point.y + 4} M${point.x + 4},${point.y - 4} L${point.x - 4},${point.y + 4}`} className="tool-unknown" />}
            </g>;
          })}
        </g>;
      })}
    </svg>
    {tooltip && <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
      <div className="tooltip-title"><strong>{tooltip.tool ? toolCategoryLabel(tooltip.tool.category) : `第 ${tooltip.turn.index} 轮`}</strong><span>{tooltip.tool ? tooltip.tool.category : tooltip.turn.status}</span></div>
      {tooltip.tool ? <><div className="tooltip-metrics"><div><small>工具 Token</small><strong>{tooltip.tool.usageReported ? formatTokens(tooltip.tool.usage.total, unit) : "未知"}</strong></div><div><small>来源轮次</small><strong>#{tooltip.turn.index}</strong></div></div><p>{tooltip.tool.provider || tooltip.tool.rawName}</p></> : <><div className="tooltip-metrics"><div><small>Context 占用</small><strong>{tooltip.turn.contextSnapshot.occupancyRate === null ? "—" : `${tooltip.turn.contextSnapshot.occupancyRate.toFixed(2)}%`}</strong></div><div><small>本轮 Token</small><strong>{formatTokens(tooltip.turn.usage.total, unit)}</strong></div></div><dl><dt>来源</dt><dd>{tooltip.turn.sourceLabel}</dd><dt>模型</dt><dd>{tooltip.turn.models.join(", ") || "—"}</dd><dt>Compaction</dt><dd>{tooltip.turn.compactions}</dd></dl><pre>{tooltip.turn.messages[0]?.text || "没有用户消息"}</pre></>}
    </div>}
  </div>;
}
