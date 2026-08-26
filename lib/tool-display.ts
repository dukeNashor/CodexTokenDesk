export const DEFAULT_VISIBLE_TOOL_CATEGORIES = ["computer-use", "chrome-use", "imagegen", "web-search"] as const;

export const TOOL_CATEGORY_LABELS: Record<string, string> = {
  "computer-use": "Computer Use",
  "chrome-use": "Chrome Use / Browser Use",
  imagegen: "ImageGen",
  "exec-reasoning": "Exec Reasoning",
  shell: "Shell / Terminal",
  "code-interpreter": "Code Interpreter",
  "web-search": "Web Search",
  "file-search": "File Search",
  mcp: "MCP",
  "function-calling": "Function Calling",
  other: "其他工具",
};

export const TOOL_CATEGORY_COLORS: Record<string, string> = {
  "computer-use": "#4f78a8",
  "chrome-use": "#3b8b78",
  imagegen: "#bd7556",
  "exec-reasoning": "#9a8f84",
  shell: "#8c78bd",
  "code-interpreter": "#6d8c45",
  "web-search": "#4f9d87",
  "file-search": "#d9874c",
  mcp: "#b35f79",
  "function-calling": "#a56c3f",
  other: "#6f8fb7",
};

export function toolCategoryLabel(category: string): string {
  return TOOL_CATEGORY_LABELS[category] ?? category;
}

export function toolCategoryColor(category: string): string {
  return TOOL_CATEGORY_COLORS[category] ?? TOOL_CATEGORY_COLORS.other;
}

export function filterToolsByCategory<T extends { category: string }>(tools: T[], selectedCategories: ReadonlySet<string>): T[] {
  return tools.filter((tool) => selectedCategories.has(tool.category));
}
