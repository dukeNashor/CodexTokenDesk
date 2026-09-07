// Dollar equivalent from the published credit/USD rate cards, not account billing.
export const CREDIT_USD_VALUE = 0.04;

export function formatCreditUsd(credits: number): string {
  return `$${Math.round(credits * CREDIT_USD_VALUE).toLocaleString("zh-CN")}`;
}
