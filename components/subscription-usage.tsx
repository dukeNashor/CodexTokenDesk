import { LcdTag } from "@/components/lcd-tag";
import { BILLING_ISSUES, SUBSCRIPTION_RATE_CARD } from "@/lib/subscription-billing";
import { formatTokens, type TokenUnit } from "@/lib/token-display";
import type { SubscriptionUsage } from "@/lib/types";
import { LcdNumber } from "@/components/lcd-number";
import { formatCreditUsd } from "@/lib/credit-display";

export function SubscriptionUsageCard({ usage, unit, detailsOnly = false }: { usage: SubscriptionUsage; unit: TokenUnit; detailsOnly?: boolean }) {
  if (detailsOnly) return <details className="subscription-disclosure"><summary><span>订阅消耗明细 <LcdTag className="estimate-tag">估算</LcdTag></span><LcdTag className="estimate-tag" active={usage.models.some((model) => model.issues.length > 0)}>含缺失信息</LcdTag></summary><SubscriptionUsageCard usage={usage} unit={unit} /></details>;
  return <section className="subscription-card" aria-label="订阅消耗估算">
    <header className="subscription-head">
      <div><h3>订阅消耗 <LcdTag className="estimate-tag">估算</LcdTag></h3><p>费率 {SUBSCRIPTION_RATE_CARD.checkedAt}</p></div>
      <LcdNumber value={formatCreditUsd(usage.estimatedCredits)} small />
    </header>
    <p className="subscription-basis">费率 {SUBSCRIPTION_RATE_CARD.checkedAt} · {SUBSCRIPTION_RATE_CARD.basis}</p>
    {usage.unpricedTokens > 0 && <p className="subscription-note">另有 {formatTokens(usage.unpricedTokens, unit)} Token 无公开积分费率，未计入上述金额。</p>}
    {usage.models.length > 0 ? <div className="subscription-models">{usage.models.map((model) => <article key={model.model} className="subscription-model">
      <div className="subscription-model-head"><strong>{model.model}</strong><span>{model.estimatedCredits === null ? "未定价" : <LcdNumber value={formatCreditUsd(model.estimatedCredits)} small />} {model.estimatedCredits !== null && <LcdTag className="estimate-tag">估算</LcdTag>}</span></div>
      <p>{formatTokens(model.rawTokens, unit)} Token · 单次输入峰值 {model.peakInputTokens === null ? "未知" : `${formatTokens(model.peakInputTokens, unit)} Token`}{model.fastRequests > 0 ? ` · Fast ${model.fastRequests} 次` : ""}{model.longContextRequests > 0 ? ` · 超过 272K 输入 ${model.longContextRequests} 次` : ""}</p>
      {model.issues.length > 0 && <details className="subscription-issues"><summary>估算依据／缺失信息 · {model.issues.length} 项</summary><ul>{model.issues.map((issue) => <li key={issue}>{BILLING_ISSUES[issue] ?? issue}</li>)}</ul></details>}
    </article>)}</div> : <p className="subscription-basis">当前范围没有已记录的 Token 用量。</p>}
    <footer><a href={SUBSCRIPTION_RATE_CARD.source} target="_blank" rel="noreferrer">官方积分费率</a><span> · </span><a href={SUBSCRIPTION_RATE_CARD.speedSource} target="_blank" rel="noreferrer">Fast 规则</a><span> · </span><a href={SUBSCRIPTION_RATE_CARD.usdSource} target="_blank" rel="noreferrer">美元等值参考</a><span> · Batch／Flex 为 API 档位，不用于订阅估算。</span></footer>
  </section>;
}
