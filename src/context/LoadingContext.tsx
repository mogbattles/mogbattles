"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LoadingContextValue {
  progress: number;
  isLoading: boolean;
  startLoading: () => void;
  finishLoading: () => void;
  setProgress: (v: number) => void;
}

const LoadingContext = createContext<LoadingContextValue>({
  progress: 0,
  isLoading: false,
  startLoading: () => {},
  finishLoading: () => {},
  setProgress: () => {},
});

export const useLoading = () => useContext(LoadingContext);

// ─── Provider ────────────────────────────────────────────────────────────────

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [progress, setProgressRaw] = useState(0);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoadingRef = useRef(false);

  // Keep ref in sync
  useEffect(() => { isLoadingRef.current = visible; }, [visible]);

  const cleanup = useCallback(() => {
    if (simInterval.current) { clearInterval(simInterval.current); simInterval.current = null; }
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }, []);

  const finish = useCallback(() => {
    cleanup();
    setProgressRaw(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgressRaw(0);
    }, 350);
  }, [cleanup]);

  const start = useCallback(() => {
    cleanup();
    setProgressRaw(0);
    setVisible(true);

    // Simulate smooth progress: fast start, slowing down, never exceeds 92%
    let current = 0;
    simInterval.current = setInterval(() => {
      if (current < 25) current += 5;
      else if (current < 50) current += 3;
      else if (current < 75) current += 1.5;
      else if (current < 92) current += 0.4;
      current = Math.min(current, 92);
      setProgressRaw(Math.round(current));
    }, 60);
  }, [cleanup]);

  const setProgress = useCallback((v: number) => {
    const clamped = Math.min(100, Math.max(0, v));
    setProgressRaw(clamped);
    if (clamped > 0 && clamped < 100) setVisible(true);
    if (clamped >= 100) finish();
  }, [finish]);

  // ─── Route change detection ──────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect internal link clicks → start loading
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element)?.closest?.("a");
      if (
        anchor?.href &&
        anchor.href.startsWith(window.location.origin) &&
        !anchor.href.includes("#") &&
        !anchor.target &&
        !e.ctrlKey && !e.metaKey && !e.shiftKey &&
        anchor.href !== window.location.href
      ) {
        start();
      }
    };

    // Detect when <main> children change → route finished
    const mainEl = document.querySelector("main");
    let observer: MutationObserver | null = null;
    if (mainEl) {
      observer = new MutationObserver(() => {
        // Use ref to avoid stale closure
        if (isLoadingRef.current) finish();
      });
      observer.observe(mainEl, { childList: true, subtree: false });
    }

    // Back/forward button
    const handlePop = () => { if (!isLoadingRef.current) start(); };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePop);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePop);
      observer?.disconnect();
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Initial page load ───────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.readyState === "complete") return; // Already loaded

    start();
    const done = () => finish();
    window.addEventListener("load", done);
    return () => window.removeEventListener("load", done);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LoadingContext.Provider
      value={{
        progress,
        isLoading: visible,
        startLoading: start,
        finishLoading: finish,
        setProgress,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
}
