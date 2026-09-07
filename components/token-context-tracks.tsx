"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { contextConnections, trackBands, SOURCE_COLORS, contextDeltas } from "@/lib/context-track";
import { nearestCurve, type CurvePoint } from "@/lib/curve-hit";
import { formatTokens, type TokenUnit } from "@/lib/token-display";
import { filterToolsByCategory, toolCategoryLabel } from "@/lib/tool-display";
import type { AggregatedTurnReport, ToolCall } from "@/lib/types";

import { TrackThumbwheel } from "./track-thumbwheel";

import { TrackScaleLever, SCALE_STOPS, scaleWindowSize } from "./track-scale-lever";

const PAGE_SIZE = 16;
const identity = (turn: AggregatedTurnReport) => `${turn.sourceRolloutId}:${turn.turnId}`;
const statusLabel = { complete: "完成", aborted: "已中止", incomplete: "进行中 / 未完成" };

export function TokenContextTracks({ turns, contextTurns = turns, selectedToolCategories, unit, selectedTurnId, onSelectTurn, onSelectTool }: {
  turns: AggregatedTurnReport[];
  contextTurns?: AggregatedTurnReport[];
  selectedToolCategories: Set<string>;
  unit: TokenUnit;
  selectedTurnId?: string;
  onSelectTurn: (turn: AggregatedTurnReport) => void;
  onSelectTool: (turn: AggregatedTurnReport, tool: ToolCall) => void;
}) {
  const patternId = useId().replaceAll(":", "");
  const [page, setPage] = useState(0);
  const [scale, setScale] = useState(-1);
  useEffect(() => { try { const stored = localStorage.getItem("token-desk-track-scale-v2"); const saved = stored === null ? -1 : Number(stored); if (SCALE_STOPS.some(stop => stop === saved)) setScale(saved); } catch { /* Storage may be unavailable. */ } }, []);
  const changeScale = (value: number) => { setScale(value); try { localStorage.setItem("token-desk-track-scale-v2", String(value)); } catch { /* Keep the in-memory preference. */ } };
  const previousSize = useRef<number | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [toolGroup, setToolGroup] = useState<{ turnId: string; category: string } | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotSize, setPlotSize] = useState({ width: 940, mainHeight: 640 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; source: string; label: string } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;
    const box = tooltipRef.current.getBoundingClientRect();
    setTooltipPosition({
      left: Math.max(8, Math.min(tooltip.x + 14, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(tooltip.y + 14, window.innerHeight - box.height - 8)),
    });
  }, [tooltip]);
  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const width = Math.max(240, Math.floor(box.width) - 48);
      const mainHeight = Math.max(540, Math.round(window.innerHeight * .9 - (box.top + window.scrollY) - 52));
      setPlotSize((previous) => previous.width === width && previous.mainHeight === mainHeight ? previous : { width, mainHeight });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    const clearTooltip = () => setTooltip(null);
    window.addEventListener("scroll", clearTooltip, true);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", clearTooltip, true); };
  }, []);
  const deltas = useMemo(() => contextDeltas(contextTurns), [contextTurns]);
  const maxTokens = turns.reduce((max, turn) => Math.max(max, turn.usage.total), 1);
  const width = plotSize.width;
  const LEFT = Math.min(width * .5, Math.max(width >= 650 ? 180 : 100, formatTokens(maxTokens, unit).length * 10 + 24));
  const slotWidth = Math.max(80, formatTokens(maxTokens, unit).length * 10 + 20);
  const autoSize = Math.max(1, Math.min(PAGE_SIZE, Math.floor((width - LEFT - 24) / slotWidth)));
  const pageSize = scaleWindowSize(scale, autoSize, turns.length);
  const selectedIndex = turns.findIndex(turn => identity(turn) === selectedTurnId);
  const maxStart = Math.max(0, turns.length - pageSize);
  useEffect(() => {
    const oldSize = previousSize.current;
    previousSize.current = pageSize;
    setPage(previous => {
      if (oldSize !== null && oldSize !== pageSize) {
        const oldStart = Math.min(previous, Math.max(0, turns.length - oldSize));
        const anchor = selectedIndex >= oldStart && selectedIndex < oldStart + oldSize ? selectedIndex : oldStart + (oldSize - 1) / 2;
        return Math.max(0, Math.min(maxStart, Math.round(anchor - (pageSize - 1) / 2)));
      }
      return selectedIndex < 0 ? Math.min(previous, maxStart) : selectedIndex < previous ? selectedIndex : selectedIndex >= previous + pageSize ? Math.min(maxStart, selectedIndex - pageSize + 1) : previous;
    });
    setHoveredId(null); setTooltip(null); setToolGroup(null);
  }, [selectedIndex, pageSize, maxStart, turns.length]);
  const start = Math.min(page, maxStart);
  const moveWindow = useCallback((steps: number) => {
    setPage(previous => Math.max(0, Math.min(maxStart, Math.min(previous, maxStart) + steps)));
    setHoveredId(null); setToolGroup(null); setTooltip(null);
  }, [maxStart]);
  const visible = turns.slice(start, start + pageSize);
  const STEP = (width - LEFT - 24) / Math.max(1, visible.length);
  const inset = Math.min(4, STEP * .1);
  const barWidth = Math.min(22, STEP * .7);
  const allSources = [...new Set(turns.map((turn) => turn.sourceRolloutId))];
  const sourceColor = (id: string) => SOURCE_COLORS[allSources.indexOf(id) % SOURCE_COLORS.length];
  const connections = contextConnections(visible);
  const categories = [...new Set(visible.flatMap((turn) => filterToolsByCategory(turn.toolCalls, selectedToolCategories).map((tool) => tool.category)))];
  const tokenFrameTop = 40;
  const tokenFrameBottom = tokenFrameTop + (plotSize.mainHeight - 84) * .4;
  const tokenTop = tokenFrameTop + 70;
  const tokenBottom = tokenFrameBottom - 28;
  const tokenRange = tokenBottom - tokenTop;
  const contextFrameTop = tokenFrameBottom + 44;
  const contextFrameBottom = plotSize.mainHeight;
  const contextTop = contextFrameTop + 64;
  const contextBottom = contextFrameBottom - 28;
  const contextY = (rate: number) => contextBottom - Math.max(0, Math.min(100, rate)) / 100 * (contextBottom - contextTop);
  const toolsY = contextFrameBottom + 12;
  const height = toolsY + categories.length * 42 + (categories.length ? 14 : 0);
  const annotationTurn = visible.find(turn => identity(turn) === (hoveredId ?? selectedTurnId));
  const delta = annotationTurn ? deltas.get(identity(annotationTurn)) : null;
  const magnitude = Math.abs(delta ?? 0);
  const deltaText = delta == null ? "—" : delta === 0 ? "±0.0%" : `${delta > 0 ? "+" : "−"}${magnitude < .1 ? "<0.1" : magnitude.toFixed(1)}%`;
  const endingRate = annotationTurn?.contextSnapshot.occupancyRate;
  const endingText = endingRate == null ? "—" : `${endingRate.toFixed(1)}%`;
  const annotationHalfWidth = Math.max(endingText.length * 7.5, deltaText.length * 4) + 6;
  const annotationX = annotationTurn ? Math.max(LEFT + annotationHalfWidth, Math.min(width - 24 - annotationHalfWidth, LEFT + (visible.indexOf(annotationTurn) + .5) * STEP)) : 0;
  const annotationRates = annotationTurn ? trackBands(annotationTurn).flatMap(band => band.occupancyRate === null ? [] : [band.occupancyRate]) : [];
  const annotationY = Math.max(contextFrameTop + 32, annotationRates.length ? contextY(Math.max(...annotationRates)) - 32 : contextTop - 32);
  const hovered = turns.find((turn) => identity(turn) === hoveredId);
  const groupTurn = visible.find((turn) => identity(turn) === toolGroup?.turnId);
  const groupTools = groupTurn && toolGroup && selectedToolCategories.has(toolGroup.category)
    ? groupTurn.toolCalls.filter((tool) => tool.category === toolGroup.category) : [];
  const activateKey = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); }
  };

  const curves: Array<{ key: string; d: string; points: CurvePoint[]; turn: AggregatedTurnReport; rate?: number; kind: string }> = [];
  connections.forEach((connection) => {
    const fromX = LEFT + (connection.from + 1) * STEP - inset;
    const toX = LEFT + connection.to * STEP + inset;
    curves.push({ key: `connection-${connection.to}`, d: `M${fromX},${contextY(connection.before)} H${toX}`, points: [[fromX, contextY(connection.before)], [toX, contextY(connection.before)]], turn: visible[connection.from], rate: connection.before, kind: "track-connection" });
    if (connection.before !== connection.after) curves.push({ key: `connection-step-${connection.to}`, d: `M${toX},${contextY(connection.before)} V${contextY(connection.after)}`, points: [[toX, contextY(connection.before)], [toX, contextY(connection.after)]], turn: visible[connection.to], rate: connection.after, kind: "track-connection" });
  });
  visible.forEach((turn, index) => {
    const x = LEFT + index * STEP;
    const bands = trackBands(turn);
    bands.forEach((band, bandIndex) => {
      if (band.occupancyRate === null) return;
      const from = x + inset + band.start * (STEP - inset * 2);
      const to = x + inset + band.end * (STEP - inset * 2);
      const previous = bands[bandIndex - 1];
      curves.push({ key: `band-${index}-${bandIndex}`, d: `M${from},${contextY(band.occupancyRate)} H${to}`, points: [[from, contextY(band.occupancyRate)], [to, contextY(band.occupancyRate)]], turn, kind: band.occupancyRate >= 90 ? "danger" : "" });
      if (previous && previous.occupancyRate !== null) {
        const compaction = turn.contextCompactions.some((event) => Math.abs(event.turnTokenOffset / Math.max(1, turn.usage.total) - band.start) < 1e-6);
        curves.push({ key: `step-${index}-${bandIndex}`, d: `M${from},${contextY(previous.occupancyRate)} V${contextY(band.occupancyRate)}`, points: [[from, contextY(previous.occupancyRate)], [from, contextY(band.occupancyRate)]], turn, kind: compaction ? "track-event" : "" });
      }
    });
  });
  const resolveCurve = (event: React.MouseEvent | React.PointerEvent, fallback: typeof curves[number]) => {
    const box = event.currentTarget.closest("svg")!.getBoundingClientRect();
    const x = (event.clientX - box.left) * width / box.width;
    const y = (event.clientY - box.top) * height / box.height;
    const localTurn = visible[Math.floor((x - LEFT) / STEP)];
    return nearestCurve(curves, [x, y], curve => Boolean(localTurn && identity(curve.turn) === identity(localTurn))) ?? fallback;
  };
  const hoverCurve = (event: React.PointerEvent, fallback: typeof curves[number]) => {
    const curve = resolveCurve(event, fallback);
    const turn = curve.turn;
    if (event.pointerType === "touch") return;
    setHoveredId(identity(turn));
    setTooltip({ x: event.clientX, y: event.clientY, source: turn.sourceRolloutId, label: curve.rate === undefined ? turn.sourceLabel : `${turn.sourceLabel} · ${curve.rate.toFixed(2)}% · 第 ${turn.index} 轮` });
  };

  if (!turns.length) return <div ref={plotRef} className="track-empty" role="status">当前筛选没有轮次</div>;
  return <div ref={plotRef} className="track-instrument">
    <div className="track-toolbar">
      <span>轮次 {start + 1}–{Math.min(start + pageSize, turns.length)} <span className="track-muted">/ {turns.length}</span></span>
      <TrackScaleLever value={scale} actual={Math.min(pageSize, turns.length)} onChange={changeScale} />
      <div className="track-pagination"><button type="button" disabled={start === 0} onClick={() => moveWindow(-pageSize)} aria-label="上一组轮次">上一组</button><button type="button" disabled={start === maxStart} onClick={() => moveWindow(pageSize)} aria-label="下一组轮次">下一组</button></div>
    </div>
    <div className="track-plot" role="region" aria-label="轮次轨道">
      <div className="track-wheel-mount" style={{ top: tokenFrameTop + (contextFrameBottom - tokenFrameTop) * .26, height: (contextFrameBottom - tokenFrameTop) * .48 }}><TrackThumbwheel value={start} max={maxStart} step={Math.max(1, Math.round(Math.min(pageSize, turns.length) * .05))} onMove={moveWindow} /></div>
      <svg className="track-chart" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Token、Context 和工具轨道">
        <defs>
          <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0,6 L6,0" className="track-unknown-line" /></pattern>
          <pattern id={`${patternId}-pixels`} width="4" height="4" patternUnits="userSpaceOnUse"><image href="/images/lcd-pixels.svg" width="4" height="4" /></pattern>
        </defs>
        <rect x="2" y={tokenFrameTop} width={width - 4} height={tokenFrameBottom - tokenFrameTop} rx="3" className="track-screen" />
        <rect x="2" y={contextFrameTop} width={width - 4} height={contextFrameBottom - contextFrameTop} rx="3" className="track-screen" />
        <g aria-hidden="true" pointerEvents="none">
          {[{ top: tokenFrameTop + 2, bottom: tokenFrameBottom - 2 }, { top: contextFrameTop + 2, bottom: contextFrameBottom - 2 }].map(({ top, bottom }) => <g key={top}>
            <rect x="4" y={top} width={width - 8} height={bottom - top} fill={`url(#${patternId}-pixels)`} />
            <path d={`M6,${bottom - 1} V${top + 2} H${width - 6}`} className="track-glass-shadow" />
            <path d={`M8,${top + 7} H${width - 8}`} className="track-glass-reflection" />
            <path d={`M7,${bottom - 1} H${width - 6} V${top + 3}`} className="track-glass-edge" />
          </g>)}
          {[tokenTop, tokenBottom].map((y) => <line key={y} x1={LEFT} x2={width - 24} y1={y} y2={y} className="track-grid track-grid-major" />)}
          {Array.from({ length: 21 }, (_, index) => index * 5).map((rate) => {
            const y = contextY(rate);
            const major = rate % 50 === 0;
            const full = rate % 10 === 0;
            const tick = major ? 9 : full ? 6 : 3;
            return <g key={rate}>
              {full && <line x1={LEFT} x2={width - 24} y1={y} y2={y} className={major ? "track-grid track-grid-major" : "track-grid-minor"} />}
              <path d={`M${LEFT - tick},${y} H${LEFT} M${width - 24},${y} h${tick}`} className={major ? "track-tick-major" : "track-tick"} />
            </g>;
          })}
          {Array.from({ length: visible.length + 1 }, (_, index) => LEFT + index * STEP).map((x) => <path key={x} d={`M${x},${tokenTop} V${tokenBottom} M${x},${contextTop} V${contextBottom}`} className="track-column-guide" />)}
        </g>
        <rect x="6" y="2" width="180" height="32" className="track-title-glass" />
        <text x="16" y="27" className="track-section-label">Token</text>
        <text x={LEFT - 12} y={tokenTop + 7} textAnchor="end" className="track-axis">{formatTokens(maxTokens, unit)}</text>
        <text x={LEFT - 12} y={tokenBottom + 7} textAnchor="end" className="track-axis">0</text>
        <rect x="6" y={tokenFrameBottom + 6} width="180" height="32" className="track-title-glass" />
        <text x="16" y={tokenFrameBottom + 31} className="track-section-label">Context</text>
        {[0, 50, 100].map((rate) => <text key={rate} x={LEFT - 12} y={contextY(rate) + 7} textAnchor="end" className="track-axis">{rate}%</text>)}
        {categories.map((category, index) => <g key={category}><line x1="16" x2={width - 24} y1={toolsY + index * 42} y2={toolsY + index * 42} className="track-grid" /><text x="16" y={toolsY + index * 42 + 28} className="track-source-label"><title>{toolCategoryLabel(category)}</title>{toolCategoryLabel(category).split(" / ")[0].slice(0, Math.floor((LEFT - 20) / 10))}</text></g>)}
        {visible.map((turn, index) => {
          const x = LEFT + index * STEP;
          const barHeight = Math.max(0, turn.usage.total) / maxTokens * tokenRange;
          const key = identity(turn);
          const active = selectedTurnId === key || hoveredId === key || toolGroup?.turnId === key;
          const plottedBands = trackBands(turn);
          const denominator = Math.max(1, turn.usage.total);
          return <g key={key} className={`track-column${active ? " active" : ""}`} style={{ "--source-ink": sourceColor(turn.sourceRolloutId) } as CSSProperties}>
            {active && <><rect x={x} y={tokenFrameTop + 3} width={STEP} height={tokenFrameBottom - tokenFrameTop - 6} className="track-selection" /><rect x={x} y={contextFrameTop + 3} width={STEP} height={contextFrameBottom - contextFrameTop - 6} className="track-selection" /></>}
            <g className={`track-turn ${turn.status}`} role="button" tabIndex={0} aria-label={`第 ${turn.index} 轮，${turn.sourceLabel}，${formatTokens(turn.usage.total, unit)} Token，Context ${turn.contextSnapshot.occupancyRate === null ? "未知" : `${turn.contextSnapshot.occupancyRate.toFixed(1)}%`}，${statusLabel[turn.status]}${turn.parentThreadId ? `，父任务 ${turn.parentThreadId}` : ""}`} onClick={() => onSelectTurn(turn)} onKeyDown={(event) => activateKey(event, () => onSelectTurn(turn))} onPointerEnter={() => setHoveredId(key)} onPointerLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(key)} onBlur={() => setHoveredId(null)}>
              <title>{`第 ${turn.index} 轮 · ${turn.sourceLabel} · ${statusLabel[turn.status]} · ${formatTokens(turn.usage.total, unit)} Token`}</title>
              <rect x={x + inset / 2} y={tokenFrameTop + 3} width={STEP - inset} height={tokenFrameBottom - tokenFrameTop - 6} fill="transparent" /><rect x={x + inset / 2} y={contextFrameTop + 3} width={STEP - inset} height={contextFrameBottom - contextFrameTop - 6} fill="transparent" />
              {(index % Math.max(1, Math.ceil(48 / STEP)) === 0 || active) && <text x={x + STEP / 2} y={tokenFrameTop + 29} textAnchor="middle" className="track-round">{String(turn.index).padStart(2, "0")}</text>}
              {turn.usage.total > 0 ? <rect x={x + STEP / 2 - barWidth / 2} y={tokenBottom - Math.max(2, barHeight)} width={barWidth} height={Math.max(2, barHeight)} className="track-bar" /> : <text x={x + STEP / 2} y={tokenBottom - 12} textAnchor="middle" className="track-axis">0</text>}
              {STEP >= slotWidth && <text x={x + STEP / 2} y={tokenBottom - barHeight - 12} textAnchor="middle" className="track-value">{turn.usage.total > 0 ? formatTokens(turn.usage.total, unit) : ""}</text>}
              {plottedBands.map((band, bandIndex) => {
                const from = x + inset + band.start * (STEP - inset * 2);
                const to = x + inset + band.end * (STEP - inset * 2);
                return band.occupancyRate === null ? <rect key={bandIndex} x={from} y={contextTop} width={Math.max(1, to - from)} height={contextBottom - contextTop} fill={`url(#${patternId})`}><title>Context 未知</title></rect> : null;
              })}
              {turn.contextCompactions.map((event, eventIndex) => {
                const eventX = x + inset + Math.min(1, Math.max(0, event.turnTokenOffset / denominator)) * (STEP - inset * 2);
                const before = event.before?.occupancyRate;
                const after = event.after?.occupancyRate;
                return <g key={eventIndex}><title>{`压缩 · ${before == null ? "未知" : `${before.toFixed(1)}%`} → ${after == null ? "未知" : `${after.toFixed(1)}%`}`}</title><line x1={eventX} x2={eventX} y1={contextTop - 4} y2={contextBottom + 10} className="track-event-guide" />{before != null && after != null && <line x1={eventX} x2={eventX} y1={contextY(before)} y2={contextY(after)} className="track-event" />}<path d={`M${eventX - 5},${contextBottom + 12} l5,-5 l5,5 l-5,5 Z`} className="track-event-marker" /></g>;
              })}
            </g>
            {categories.map((category, categoryIndex) => {
              const tools = turn.toolCalls.filter((tool) => tool.category === category);
              if (!tools.length) return null;
              const unknown = tools.some((tool) => !tool.usageReported);
              const y = toolsY + categoryIndex * 42 + 4;
              const open = () => { setToolGroup({ turnId: key, category }); if (tools.length === 1) onSelectTool(turn, tools[0]); };
              return <g key={category} className="track-tool" role="button" tabIndex={0} aria-label={`第 ${turn.index} 轮 ${toolCategoryLabel(category)} ${tools.length} 次${unknown ? "，含 Token 未知" : ""}`} onClick={open} onKeyDown={(event) => activateKey(event, open)}><title>{`${tools.length} 次 ${toolCategoryLabel(category)}${unknown ? " · 含 Token 未知" : ""}`}</title><rect x={x + STEP / 2 - Math.min(50, STEP - inset) / 2} y={y} width={Math.min(50, STEP - inset)} height="32" rx="2" className="track-tool-target" /><text x={x + STEP / 2} y={y + 24} textAnchor="middle" className={unknown ? "track-tool-unknown" : "track-value"}>{tools.length}{unknown ? "*" : ""}</text></g>;
            })}
          </g>;
        })}
        <g className="track-curves" pointerEvents="none">
          {curves.map((curve) => <path key={curve.key} d={curve.d} className={`track-context ${curve.kind}${tooltip?.source === curve.turn.sourceRolloutId ? " source-hovered" : ""}`} style={{ "--source-ink": sourceColor(curve.turn.sourceRolloutId) } as CSSProperties} />)}
        </g>
        {annotationTurn && <g className="track-context-annotation" pointerEvents="none" style={{ "--source-ink": sourceColor(annotationTurn.sourceRolloutId) } as CSSProperties} aria-label={`第 ${annotationTurn.index} 轮结束时 Context 占用率 ${endingRate == null ? "未知" : endingText}，Context 净变化 ${delta == null ? "未知" : `${delta > 0 ? "+" : ""}${Number(delta.toFixed(2))} 个百分点`}`}>
          <text className="track-context-ending" x={annotationX} y={annotationY} textAnchor="middle">{endingText}</text>
          <text className="track-context-delta" x={annotationX} y={annotationY + 22} textAnchor="middle">{deltaText}</text>
        </g>}
        <g className="track-curve-targets" aria-hidden="true">
          {curves.map((curve) => <path key={curve.key} d={curve.d} data-curve={curve.key} data-turn={identity(curve.turn)} data-context-rate={curve.rate} data-source={curve.turn.sourceRolloutId} data-source-label={curve.turn.sourceLabel} className="track-curve-hit" onPointerEnter={(event) => hoverCurve(event, curve)} onPointerMove={(event) => hoverCurve(event, curve)} onPointerLeave={() => { setTooltip(null); setHoveredId(null); }} onClick={(event) => onSelectTurn(resolveCurve(event, curve).turn)} />)}
        </g>
      </svg>
    </div>
    {tooltip && <div ref={tooltipRef} role="tooltip" className="track-source-tooltip" style={tooltipPosition}>{tooltip.label}</div>}
    <div className="track-readout" aria-live="polite">{hovered ? <><strong>第 {hovered.index} 轮</strong><span>{hovered.sourceLabel}</span><span>{formatTokens(hovered.usage.total, unit)} Token</span><span>Context {hovered.contextSnapshot.occupancyRate === null ? "未知" : `${hovered.contextSnapshot.occupancyRate.toFixed(1)}%`}</span><span>压缩 {hovered.compactions}</span><span>{statusLabel[hovered.status]}</span></> : <><span><i className="event-key" />压缩</span><span><i className="unknown-key" />Context 未知</span><span>* 工具 Token 未知</span></>}</div>
    {groupTurn && groupTools.length > 0 && <section className="track-tool-list" aria-label="本轮工具调用"><header><strong>第 {groupTurn.index} 轮 · {toolCategoryLabel(toolGroup!.category)}</strong><button type="button" onClick={() => setToolGroup(null)} aria-label="收起工具调用">收起</button></header><div>{groupTools.map((tool, index) => <button type="button" key={`${tool.callId ?? tool.sequence}-${index}`} onClick={() => onSelectTool(groupTurn, tool)}><span>{tool.name}</span><span>{tool.status}</span><span>{tool.usageReported ? `${formatTokens(tool.usage.total, unit)} Token` : "Token 未知"}</span></button>)}</div></section>}
  </div>;
}
