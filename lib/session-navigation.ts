import type { NavigationModelUsageBucket, SessionNavigationItem } from "@/lib/types";

export type SummarySelectionView = "project" | "recent";

const MODEL_WATERMARK_LABELS: Record<string, string> = {
  "gpt-5.6 sol": "SOL",
  "gpt-5.6 terra": "TERRA",
  "gpt-5.6 luna": "LUNA",
  "gpt-5.5": "5.5",
  "gpt-5.5 cyber": "CYBER",
  "gpt-5.4": "5.4",
  "gpt-5.4 mini": "5.4 MINI",
  "gpt-5.3 codex": "5.3 CODEX",
  "gpt-5.2": "5.2",
  "spark": "Spark",
  "多模型": "多模型",
  "未知模型": "未知",
  "计划外": "计划外",
};

export function modelWatermarkLabel(model: string): string {
  const value = model.trim();
  const normalized = value.toLocaleLowerCase().replace(/_+/g, " ").replace(/\s+/g, " ");
  if (normalized.includes("spark")) return "Spark";
  return MODEL_WATERMARK_LABELS[normalized]
    ?? (value.replace(/^gpt[- ]?/i, "").replace(/\s+/g, " ").trim() || "未知");
}

export function navigationEffortLabel(efforts: string[]): string {
  const values = [...new Set(efforts.map((effort) => effort.trim()).filter(Boolean))];
  return values.length ? values.join(" / ") : "未记录 effort";
}

export function navigationModelColor(model: string): string {
  if (modelWatermarkLabel(model) === "Spark") return "#c23b75";
  const palette = ["#3b8b78", "#4f78a8", "#bd7556", "#8c78bd", "#6d8c45", "#a56c3f"];
  let hash = 0;
  for (let index = 0; index < model.length; index += 1) hash = (hash * 31 + model.charCodeAt(index)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function filterNavigationSessions(sessions: SessionNavigationItem[], selectedModels: ReadonlySet<string>, query: string): SessionNavigationItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return sessions.filter((session) => {
    if (session.range.turnCount === 0) return false;
    const rangeModels = session.range.modelUsage.map((bucket) => bucket.model);
    if (selectedModels.size && !rangeModels.some((model) => selectedModels.has(model))) return false;
    if (!normalizedQuery) return true;
    const text = `${session.metadata.title} ${session.metadata.threadId} ${session.metadata.projectLabel} ${rangeModels.join(" ")}`.toLocaleLowerCase();
    return text.includes(normalizedQuery);
  });
}

export function visibleProjectIdsForSessions(sessions: SessionNavigationItem[]): Set<string> {
  return new Set(sessions.map((session) => session.metadata.projectId));
}

export function retainAvailableModelSelection(selectedModels: ReadonlySet<string>, availableModels: NavigationModelUsageBucket[]): Set<string> {
  const available = new Set(availableModels.map((bucket) => bucket.model));
  return new Set([...selectedModels].filter((model) => available.has(model)));
}

export function summarySessionIds(view: SummarySelectionView, filteredSessions: SessionNavigationItem[], recentSelectedIds: ReadonlySet<string>): string[] {
  return view === "project" ? filteredSessions.map((session) => session.metadata.threadId) : [...recentSelectedIds];
}
