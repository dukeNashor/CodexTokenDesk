export const TOKEN_UNIT_ORDER = ["raw", "K", "M", "B"] as const;

export type TokenUnit = (typeof TOKEN_UNIT_ORDER)[number];

export const TOKEN_UNIT_LABELS: Record<TokenUnit, string> = {
  raw: "原始",
  K: "K",
  M: "M",
  B: "B",
};

const TOKEN_UNIT_CONFIG: Record<TokenUnit, { divisor: number; suffix: string }> = {
  raw: { divisor: 1, suffix: "" },
  K: { divisor: 1_000, suffix: "K" },
  M: { divisor: 1_000_000, suffix: "M" },
  B: { divisor: 1_000_000_000, suffix: "B" },
};

export function formatCount(value: number): string {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  const sign = numeric < 0 ? "-" : "";
  const [integer, fraction] = String(Math.abs(numeric)).split(".");
  const grouped = integer.replace(/\B(?=(\d{4})+(?!\d))/g, " ");
  return `${sign}${grouped}${fraction ? `.${fraction}` : ""}`;
}

export function formatTokens(value: number, unit: TokenUnit): string {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  if (unit === "raw") return formatCount(numeric);
  const config = TOKEN_UNIT_CONFIG[unit];
  if (numeric > 0 && numeric < config.divisor / 10) return `<0.1${config.suffix}`;
  return `${(numeric / config.divisor).toFixed(1).replace(/\.0$/, "")}${config.suffix}`;
}

export function isLcdValue(value: string): boolean {
  return /^[\d .\-]+[KMB]?$/.test(value);
}
