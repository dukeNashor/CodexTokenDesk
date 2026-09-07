"use client";

import { useEffect, useRef, type CSSProperties } from "react";

export function TrackThumbwheel({ value, max, step = 1, onMove }: { value: number; max: number; step?: number; onMove: (steps: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let remainder = 0;
    let lastTime = 0;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.timeStamp - lastTime > 180) remainder = 0;
      lastTime = event.timeStamp;
      remainder += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const steps = Math.trunc(remainder / 40);
      if (steps) { remainder -= steps * 40; onMove(Math.sign(steps) * step); }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [onMove, step]);
  return <div ref={ref} className="track-thumbwheel" role="slider" tabIndex={0} aria-label="轮次拨轮" aria-orientation="vertical" aria-valuemin={1} aria-valuemax={max + 1} aria-valuenow={value + 1} aria-valuetext={`从第 ${value + 1} 个轮次开始`} style={{ "--wheel-phase": `${value * 5}px` } as CSSProperties}
    onKeyDown={event => {
      const steps = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : event.key === "Home" ? -max : event.key === "End" ? max : 0;
      if (steps || ["Home", "End"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); onMove(steps); }
    }}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = event.clientY; }}
    onPointerMove={event => { if (drag.current === null) return; const steps = Math.trunc((event.clientY - drag.current) / 12); if (steps) { drag.current += steps * 12; onMove(steps * step); } }}
    onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
    <span className="track-thumbwheel-rim" aria-hidden="true" />
  </div>;
}
