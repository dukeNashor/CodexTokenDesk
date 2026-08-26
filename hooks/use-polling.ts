"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PollingState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
}

export function usePolling<T>(url: string, interval: number, request?: { method: "GET" | "POST"; body?: string }): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const abortController = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const id = ++requestId.current;
    const controller = new AbortController();
    abortController.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        method: request?.method ?? "GET",
        headers: request?.body ? { "Content-Type": "application/json" } : undefined,
        body: request?.body,
        signal: controller.signal,
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "请求失败");
      if (id !== requestId.current) return;
      setData(payload as T);
      setError(null);
    } catch (cause) {
      if (id !== requestId.current) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "请求失败");
    } finally {
      if (id === requestId.current) {
        inFlight.current = false;
        abortController.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [request?.body, request?.method, url]);

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
      abortController.current?.abort();
      abortController.current = null;
      inFlight.current = false;
    };
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, interval);
    return () => window.clearInterval(timer);
  }, [interval, load]);

  return { data, error, loading, refreshing, refresh: () => void load() };
}
