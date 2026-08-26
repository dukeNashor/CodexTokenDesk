"use client";

import { formatTokens, type TokenUnit } from "@/lib/token-display";
import { arcBandPath, donutSegments } from "@/lib/visualization-geometry";
import type { ModelUsageBucket, ProjectSessionListItem, RateCardMetadata } from "@/lib/types";

const PALETTE = ["#3b8b78", "#4f78a8", "#bd7556", "#8c78bd", "#6d8c45", "#a56c3f", "#c23b75"];

function modelColor(model: string): string {
  if (model === "Spark") return "#c23b75";
  let hash = 0;
  for (let index = 0; index < model.length; index += 1) hash = (hash * 31 + model.charCodeAt(index)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function Donut({ title, caption, models, sessions, weighted, unit, selectedModels, onToggleModel, onSelectSession }: {
  title: string;
  caption: string;
  models: ModelUsageBucket[];
  sessions: ProjectSessionListItem[];
  weighted: boolean;
  unit: TokenUnit;
  selectedModels: Set<string>;
  onToggleModel: (model: string) => void;
  onSelectSession: (session: ProjectSessionListItem) => void;
}) {
  const value = (bucket: ModelUsageBucket) => weighted ? bucket.weightedTokens : bucket.rawTokens;
  const total = models.reduce((sum, bucket) => sum + value(bucket), 0);
  const modelSegments = donutSegments(models, value);
  const sessionSegments = donutSegments(sessions, (session) => weighted ? session.summary.modelUsage.reduce((sum, bucket) => sum + bucket.weightedTokens, 0) : session.summary.finalUsage.total);
  return <article className="pie-card"><header className="pie-card-head"><div><h3>{title}</h3><p>{caption}</p></div><span className="pie-card-kicker">{weighted ? "SOL EQ" : "RAW"}</span></header><div className="pie-chart-wrap"><svg viewBox="0 0 360 340" role="img" aria-label={title}>
    <path d={arcBandPath(180, 165, 78, 122, 0, 1)} fill="#ece5da" />
    {modelSegments.map(({ item, start, end }) => <path key={item.model} d={arcBandPath(180, 165, 78, 122, start, end)} fill={modelColor(item.model)} className={`donut-sector${selectedModels.size && !selectedModels.has(item.model) ? " dim" : ""}`} role="button" tabIndex={0} aria-label={`${item.model}，${formatTokens(value(item), unit)}`} onClick={() => onToggleModel(item.model)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onToggleModel(item.model); } }}><title>{item.model} · {formatTokens(value(item), unit)}</title></path>)}
    {sessionSegments.map(({ item, start, end, value: sessionValue }) => <path key={item.metadata.threadId} d={arcBandPath(180, 165, 132, 143, start, end)} fill={modelColor(item.metadata.primaryModel)} className="session-donut-sector" role="button" tabIndex={0} aria-label={`${item.metadata.title}，${formatTokens(sessionValue, unit)} Token`} onDoubleClick={() => onSelectSession(item)} onKeyDown={(event) => { if (event.key === "Enter") onSelectSession(item); }}><title>双击进入 · {item.metadata.title} · {formatTokens(sessionValue, unit)}</title></path>)}
    <text x="180" y="154" textAnchor="middle" className="donut-center-label">{weighted ? "Sol 等价" : "原始 Token"}</text><text x="180" y="184" textAnchor="middle" className="donut-center-value">{formatTokens(total, unit)}</text>
  </svg></div><div className="model-pie-legend">{models.map((bucket) => <button className={`pie-legend-row${selectedModels.has(bucket.model) ? " selected" : ""}`} key={bucket.model} onClick={() => onToggleModel(bucket.model)} type="button"><i className="swatch" style={{ background: modelColor(bucket.model) }} /><span className="name"><strong>{bucket.model}</strong><small>{bucket.rateStatus === "official" ? bucket.rateMultiplier === null ? "公开费率" : `${bucket.rateMultiplier}× Sol` : "回退估算"}</small></span><span className="value"><strong>{formatTokens(value(bucket), unit)}</strong><small>{total ? `${(100 * value(bucket) / total).toFixed(1)}%` : "0%"}</small></span></button>)}</div></article>;
}

export function ModelUsageDonuts({ models, sessions, rateCard, unit, selectedModels, onToggleModel, onSelectSession, planExcluded }: {
  models: ModelUsageBucket[];
  sessions: ProjectSessionListItem[];
  rateCard: RateCardMetadata;
  unit: TokenUnit;
  selectedModels: Set<string>;
  onToggleModel: (model: string) => void;
  onSelectSession: (session: ProjectSessionListItem) => void;
  planExcluded: { models: string[]; rawTokens: number; turnCount: number };
}) {
  return <section className="model-pie-view">
    <div className="model-rate-meta">费率核验于 {rateCard.checkedAt.slice(0, 10)}</div>
    {planExcluded.rawTokens > 0 && <div className="model-plan-note"><span>◇</span><div><strong>Spark 单独列示</strong><br />{formatTokens(planExcluded.rawTokens, unit)} Token / {planExcluded.turnCount} 轮不参与 Sol 等价比较。</div></div>}
    <div className="pie-grid"><Donut title="原始 Token" caption="各模型实际记录的 Token" models={models} sessions={sessions} weighted={false} unit={unit} selectedModels={selectedModels} onToggleModel={onToggleModel} onSelectSession={onSelectSession} /><Donut title="Sol 等价 Token" caption="按公开文本费率折算" models={models} sessions={sessions} weighted unit={unit} selectedModels={selectedModels} onToggleModel={onToggleModel} onSelectSession={onSelectSession} /></div>
  </section>;
}
