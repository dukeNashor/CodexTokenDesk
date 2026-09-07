"use client";

export const SCALE_STOPS = [0, 1.5, 2, 3, 4, 6, -1] as const;
export function scaleWindowSize(scale: number, automatic: number, total: number) {
  return Math.max(1, Math.min(total, scale === -1 ? total : scale === 0 ? automatic : Math.round(automatic * scale)));
}
const label = (value: number) => value === -1 ? "全部" : value === 0 ? "自动" : `${value}×`;
export function TrackScaleLever({ value, actual, onChange }: { value: number; actual: number; onChange: (value: number) => void }) {
  return <div className="track-scale-lever">
    <output aria-live="polite">同屏 <b>{actual}</b></output>
    <div className="track-scale-gate">
      <input type="range" min="0" max="6" step="1" value={SCALE_STOPS.indexOf(value as typeof SCALE_STOPS[number])} aria-label="同屏轮次档位" aria-valuetext={`${label(value)}，实际 ${actual} 轮`} onChange={event => onChange(SCALE_STOPS[Number(event.target.value)])} onKeyDown={event => event.stopPropagation()} />
      <div className="track-scale-stops">{SCALE_STOPS.map(stop => <button key={stop} type="button" aria-label={`同屏轮次：${label(stop)}`} aria-pressed={stop === value} onClick={() => onChange(stop)}>{label(stop)}</button>)}</div>
    </div>
  </div>;
}
