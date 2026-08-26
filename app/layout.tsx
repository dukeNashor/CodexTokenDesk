import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Codex Token Desk",
  description: "Codex rollout Token 实时监控台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
