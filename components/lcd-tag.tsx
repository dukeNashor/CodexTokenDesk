import { LcdSegmentWord } from "./lcd-segment-word";

/** Fixed LCD legends retain an unlit electrode beneath the active glyph. */
export function LcdTag({ children, className = "", active = true, decorative = false, segmented = false }: {
  children: string;
  className?: string;
  active?: boolean;
  decorative?: boolean;
  segmented?: boolean;
}) {
  const glyph = segmented ? <LcdSegmentWord value={children} /> : children;
  return <span className={`lcd-tag ${className}`} data-lit={active} aria-hidden={!active || decorative ? true : undefined}>
    <span className="lcd-tag-ghost" aria-hidden="true">{glyph}</span>
    <span className="lcd-tag-lit">{glyph}</span>
  </span>;
}
