// Only digits and the decimal point use DSEG. Units, separators and comparison
// signs keep the UI typeface, so values such as <0.1M remain readable.
export function LcdNumber({ value, unit, small = false }: { value: string; unit?: string; small?: boolean }) {
  return <span className={`lcd-display${small ? " lcd-display-small" : ""}`} aria-label={`${value}${unit ? ` ${unit}` : ""}`}>
    <span className="lcd-content" aria-hidden="true">{value.split(/([0-9.]+)/).filter(Boolean).map((part, index) => <span key={index} className={/^[0-9.]+$/.test(part) ? "lcd-digits" : "lcd-symbol"}>{part}</span>)}{unit && <span className="lcd-unit">{unit}</span>}</span>
  </span>;
}
