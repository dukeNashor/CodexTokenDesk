"use client";

import { useMemo, useState } from "react";

import { formatTokens, type TokenUnit } from "@/lib/token-display";
import type { AggregatedTurnReport } from "@/lib/types";

const SEGMENTS = [
  ["cachedInput", "缓存输入", "#d89b42"],
  ["cacheWriteInput", "缓存写入", "#e8c46a"],
  ["otherNonCachedInput", "其他输入", "#4f78a8"],
  ["ordinaryOutput", "普通输出", "#3b8b78"],
  ["reasoningOutput", "推理输出", "#8c78bd"],
] as const;
export function TurnCompositionChart({ turns, scale, unit, onSelect }: { turns: AggregatedTurnReport[]; scale: "linear" | "log"; unit: TokenUnit; onSelect: (turn: AggregatedTurnReport) => void }) {
  const width = Math.max(920, turns.length * 30 + 100);
  const height = 410;
  const margin = { top: 18, right: 20, bottom: 48, left: 74 };
  const innerHeight = height - margin.top - margin.bottom;
  const innerWidth = width - margin.left - margin.right;
  const max = Math.max(1, ...turns.map((turn) => turn.usage.total));
  const scaleValue = (value: number) => scale === "log" ? Math.log10(1 + value) / Math.log10(1 + max) : value / max;
  const step = innerWidth / Math.max(1, turns.length);
  const barWidth = Math.max(4, Math.min(19, step * .7));
  return <div className="chart-card"><header className="chart-head"><div><h3>单轮 Token 构成</h3><p>{scale === "log" ? "对数刻度" : "线性刻度"} · 点击柱体查看详情</p></div><div className="segment-legend">{SEGMENTS.map(([, label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div></header><div className="chart-scroll"><svg className="turn-chart" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} role="img" aria-label="逐轮 Token 构成柱状图">
    {[0, .25, .5, .75, 1].map((fraction) => { const y = margin.top + innerHeight * (1 - fraction); return <g key={fraction}><line x1={margin.left} x2={width - margin.right} y1={y} y2={y} className="grid-line" /><text x={margin.left - 9} y={y + 4} textAnchor="end" className="axis-label">{formatTokens(Math.round(max * fraction), unit)}</text></g>; })}
    {turns.map((turn, position) => {
      const x = margin.left + position * step + (step - barWidth) / 2;
      const totalHeight = innerHeight * scaleValue(turn.usage.total);
      let y = margin.top + innerHeight;
      return <g key={`${turn.sourceRolloutId}-${turn.turnId}`} className="bar-target" role="button" tabIndex={0} aria-label={`第 ${turn.index} 轮，${formatTokens(turn.usage.total, unit)} Token`} onClick={() => onSelect(turn)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(turn); } }}>
        {SEGMENTS.map(([key, label, color]) => { const value = Math.max(0, turn.breakdown[key]); if (!value || !turn.usage.total) return null; const segmentHeight = totalHeight * value / turn.usage.total; y -= segmentHeight; return <rect key={key} x={x} y={y} width={barWidth} height={Math.max(.6, segmentHeight)} rx="1.5" fill={color}><title>{label} {formatTokens(value, unit)}</title></rect>; })}
        <text x={x + barWidth / 2} y={height - 22} textAnchor="middle" className="axis-label">{turn.index}</text>
      </g>;
    })}
  </svg></div></div>;
}

export function CumulativeChart({ turns, unit, onSelect }: { turns: AggregatedTurnReport[]; unit: TokenUnit; onSelect: (turn: AggregatedTurnReport) => void }) {
  const width = Math.max(920, turns.length * 28 + 100);
  const height = 390;
  const margin = { top: 22, right: 24, bottom: 45, left: 74 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  let running = 0;
  const points = turns.map((turn, index) => { running += turn.usage.total; return { turn, total: running, x: margin.left + innerWidth * (index / Math.max(1, turns.length - 1)) }; });
  const max = Math.max(1, running);
  const pointText = points.map((point) => `${point.x.toFixed(2)},${(margin.top + innerHeight * (1 - point.total / max)).toFixed(2)}`).join(" ");
  return <div className="chart-card"><header className="chart-head"><div><h3>累计 Token 趋势</h3><p>按当前筛选顺序累计</p></div><strong className="lcd-small">{formatTokens(running, unit)}</strong></header><div className="chart-scroll"><svg className="turn-chart" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }} role="img" aria-label="累计 Token 趋势图">
    {[0, .25, .5, .75, 1].map((fraction) => { const y = margin.top + innerHeight * (1 - fraction); return <g key={fraction}><line x1={margin.left} x2={width - margin.right} y1={y} y2={y} className="grid-line" /><text x={margin.left - 9} y={y + 4} textAnchor="end" className="axis-label">{formatTokens(max * fraction, unit)}</text></g>; })}
    <polyline points={pointText} fill="none" stroke="#3b8b78" strokeWidth="3" strokeLinejoin="round" />
    {points.map((point, index) => { const y = margin.top + innerHeight * (1 - point.total / max); return <g key={`${point.turn.sourceRolloutId}-${point.turn.turnId}`} className="trend-point" role="button" tabIndex={0} onClick={() => onSelect(point.turn)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(point.turn); } }}><circle cx={point.x} cy={y} r="5" /><text x={point.x} y={height - 20} textAnchor="middle" className="axis-label">{index + 1}</text><title>第 {point.turn.index} 轮 · 累计 {formatTokens(point.total, unit)}</title></g>; })}
  </svg></div></div>;
}

type SortKey = "index" | "total" | "context" | "cached" | "tools";

export function TurnHeatTable({ turns, unit, onSelect }: { turns: AggregatedTurnReport[]; unit: TokenUnit; onSelect: (turn: AggregatedTurnReport) => void }) {
  const [sort, setSort] = useState<SortKey>("index");
  const [descending, setDescending] = useState(false);
  const sorted = useMemo(() => [...turns].sort((left, right) => {
    const value = (turn: AggregatedTurnReport) => sort === "index" ? turn.index : sort === "total" ? turn.usage.total : sort === "context" ? turn.contextSnapshot.occupancyRate ?? -1 : sort === "cached" ? turn.breakdown.cachedInput : turn.toolSummary.callCount;
    return (value(left) - value(right)) * (descending ? -1 : 1);
  }), [descending, sort, turns]);
  const maxTotal = Math.max(1, ...turns.map((turn) => turn.usage.total));
  const selectSort = (key: SortKey) => { if (sort === key) setDescending((value) => !value); else { setSort(key); setDescending(false); } };
  const heading = (key: SortKey, label: string) => <button type="button" onClick={() => selectSort(key)}>{label}{sort === key ? descending ? " ↓" : " ↑" : ""}</button>;
  return <div className="chart-card detail-table-card"><header className="chart-head"><div><h3>逐轮明细</h3><p>点击表头排序，点击行打开完整消息</p></div></header><div className="table-scroll"><table className="heat-table"><thead><tr><th>{heading("index", "轮次")}</th><th>来源</th><th>状态</th><th>{heading("total", "总 Token")}</th><th>{heading("cached", "缓存")}</th><th>普通输入</th><th>输出</th><th>{heading("context", "Context")}</th><th>{heading("tools", "工具")}</th><th>首条消息</th></tr></thead><tbody>{sorted.map((turn) => <tr key={`${turn.sourceRolloutId}-${turn.turnId}`} onClick={() => onSelect(turn)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(turn); } }}><td>#{turn.index}</td><td>{turn.sourceLabel}</td><td><span className={`status-tag ${turn.status}`}>{turn.status}</span></td><td><div className="heat-value"><span style={{ width: `${100 * turn.usage.total / maxTotal}%` }} /><b>{formatTokens(turn.usage.total, unit)}</b></div></td><td>{formatTokens(turn.breakdown.cachedInput, unit)}</td><td>{formatTokens(turn.breakdown.otherNonCachedInput, unit)}</td><td>{formatTokens(turn.breakdown.ordinaryOutput + turn.breakdown.reasoningOutput, unit)}</td><td>{turn.contextSnapshot.occupancyRate === null ? "—" : `${turn.contextSnapshot.occupancyRate.toFixed(1)}%`}</td><td>{turn.toolSummary.callCount || "—"}</td><td className="message-preview">{turn.messages[0]?.text || "—"}</td></tr>)}</tbody></table></div></div>;
}
