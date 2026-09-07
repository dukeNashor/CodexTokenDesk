import type { RequestUsage, SubscriptionModelUsage, SubscriptionUsage, TurnReport } from "@/lib/types";

// Independent credit rates: do not derive these from API dollars or apply API tiers.
export const SUBSCRIPTION_RATE_CARD = {
  checkedAt: "2026-09-07",
  source: "https://learn.chatgpt.com/docs/pricing#token-rates",
  speedSource: "https://learn.chatgpt.com/docs/agent-configuration/speed",
  usdSource: "https://help.openai.com/en/articles/20001415-chatgpt-rate-card-enterprise-token-based-pricing",
  basis: "仅按订阅模式统计；历史记录按当前公开积分费率及每 Credit $0.04 估算美元等值，忽略购买折扣，不代表实际扣费或套餐额度百分比。Sol 公开费率含官方促销，未公布促销后价格。处理模式缺失时按 Standard 估算。",
};

type CreditRate = { input: number; cached: number; output: number; fast: number | null; extendedContext: boolean };
const SOL: CreditRate = { input: 100, cached: 10, output: 500, fast: 2.5, extendedContext: true };
const RATES: Record<string, CreditRate> = {
  "gpt-6-astra": { input: 250, cached: 25, output: 1250, fast: 2.5, extendedContext: true },
  "gpt-5.6-sol": SOL,
  "gpt-5.6": SOL,
  "gpt-5.6-terra": { input: 50, cached: 5, output: 300, fast: 2.5, extendedContext: true },
  "gpt-5.6-luna": { input: 5, cached: 0.5, output: 30, fast: 2.5, extendedContext: true },
  "gpt-5.5": { input: 125, cached: 12.5, output: 750, fast: 2.5, extendedContext: true },
  "gpt-5.4": { input: 62.5, cached: 6.25, output: 375, fast: 2, extendedContext: true },
  "gpt-5.4-mini": { input: 18.75, cached: 1.875, output: 113, fast: null, extendedContext: false },
};

export const BILLING_ISSUES: Record<string, string> = {
  mode_missing: "处理模式缺失，按 Standard 估算",
  mode_unsupported: "该处理模式没有订阅积分规则，按 Standard 估算（不套用 API Batch/Flex 折扣）",
  fast_rate_unknown: "该模型 Fast 积分倍率未确认，按 Standard 估算",
  model_unknown: "模型积分费率未配置，按 Sol 标准费率回退估算",
  request_usage_missing: "逐请求用量缺失或不一致，按汇总用量和标准费率估算，无法判断实际上下文",
  long_context_unconfirmed: "单次输入超过 272K；订阅积分加价规则未确认，按基础积分费率估算",
  unclassified_usage: "部分 Token 无法分类，暂按输出费率估算",
  cache_write_rate: "已记录缓存写入；订阅未列独立写入费率，计入普通输入估算",
  no_public_rate: "Spark 研究预览未公布数值积分费率，仅统计 Token",
};

function modelKey(model: string | null): string {
  return (model ?? "").trim().toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}

function requestsForTurn(turn: TurnReport): RequestUsage[] {
  const requests = turn.requestUsage;
  // Retain existing aggregate totals on counter resets or incomplete historical data.
  if (requests?.length && (["input", "cached", "output", "total"] as const).every((key) =>
    requests.reduce((sum, request) => sum + request.usage[key], 0) === turn.usage[key])) return requests;
  return [{
    timestamp: turn.startedAt,
    model: turn.models.length === 1 ? turn.models[0] : null,
    serviceTier: null,
    usage: turn.usage,
    inputTokens: null,
    usageComplete: false,
  }];
}

export function aggregateSubscriptionUsage(turns: TurnReport[]): SubscriptionUsage {
  const buckets = new Map<string, SubscriptionModelUsage>();
  for (const turn of turns) for (const request of requestsForTurn(turn)) {
    if (request.usage.total <= 0) continue;
    const key = modelKey(request.model);
    const model = key || "未知／多模型";
    const excluded = key === "gpt-5.3-codex-spark";
    const rate = RATES[key] ?? SOL;
    const bucket = buckets.get(model) ?? {
      model, estimatedCredits: excluded ? null : 0, rawTokens: 0,
      fastRequests: 0, longContextRequests: 0, peakInputTokens: null, issues: [],
    };
    const issues = new Set(bucket.issues);
    bucket.rawTokens += request.usage.total;
    if (request.inputTokens !== null) bucket.peakInputTokens = Math.max(bucket.peakInputTokens ?? 0, request.inputTokens);
    if (excluded) {
      issues.add("no_public_rate");
    } else {
      const knownModel = Boolean(RATES[key]);
      if (!knownModel) issues.add("model_unknown");
      let multiplier = 1;
      const tier = request.serviceTier?.trim().toLowerCase();
      if (!request.usageComplete) issues.add("request_usage_missing");
      if (!tier) issues.add("mode_missing");
      else if (tier === "fast" || tier === "priority") {
        if (knownModel && rate.fast !== null && request.usageComplete) {
          multiplier = rate.fast;
          bucket.fastRequests += 1;
        } else if (knownModel && rate.fast === null) issues.add("fast_rate_unknown");
      } else if (tier !== "standard" && tier !== "default") issues.add("mode_unsupported");
      if (request.inputTokens !== null && request.inputTokens > 272_000 && (rate.extendedContext || !knownModel)) {
        bucket.longContextRequests += 1;
        issues.add("long_context_unconfirmed");
      }
      const cached = Math.min(request.usage.cached, request.usage.input);
      const input = Math.max(0, request.usage.input - cached);
      const unclassified = Math.max(0, request.usage.total - request.usage.input - request.usage.output);
      if (unclassified) issues.add("unclassified_usage");
      if (request.usage.cache_write > 0) issues.add("cache_write_rate");
      bucket.estimatedCredits! += (input * rate.input + cached * rate.cached
        + (request.usage.output + unclassified) * rate.output) * multiplier / 1_000_000;
    }
    bucket.issues = [...issues];
    buckets.set(model, bucket);
  }
  const models = [...buckets.values()].sort((a, b) => (b.estimatedCredits ?? 0) - (a.estimatedCredits ?? 0) || a.model.localeCompare(b.model));
  return {
    estimatedCredits: models.reduce((sum, model) => sum + (model.estimatedCredits ?? 0), 0),
    unpricedTokens: models.reduce((sum, model) => sum + (model.estimatedCredits === null ? model.rawTokens : 0), 0),
    models,
  };
}
