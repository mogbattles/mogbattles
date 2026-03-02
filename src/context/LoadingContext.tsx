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
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  const [progress, setProgressRaw] = useState(0);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(false);

  // Keep ref in sync
  useEffect(() => { isLoadingRef.current = visible; }, [visible]);

  const cleanup = useCallback(() => {
    if (simInterval.current) { clearInterval(simInterval.current); simInterval.current = null; }
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (safetyTimer.current) { clearTimeout(safetyTimer.current); safetyTimer.current = null; }
  }, []);

  const finish = useCallback(() => {
    cleanup();
    setProgressRaw(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgressRaw(0);
    }, 100);
  }, [cleanup]);

  const start = useCallback(() => {
    cleanup();
    setProgressRaw(0);
    setVisible(true);

    // Very fast simulation — reaches ~90% in under a second
    let current = 0;
    simInterval.current = setInterval(() => {
      if (current < 40) current += 12;
      else if (current < 70) current += 6;
      else if (current < 85) current += 2;
      else if (current < 95) current += 0.3;
      current = Math.min(current, 95);
      setProgressRaw(Math.round(current));
    }, 30);

    // Safety: never stay visible longer than 2.5s
    safetyTimer.current = setTimeout(() => {
      finish();
    }, 2500);
  }, [cleanup, finish]);

  const setProgress = useCallback((v: number) => {
    const clamped = Math.min(100, Math.max(0, v));
    setProgressRaw(clamped);
    if (clamped > 0 && clamped < 100) setVisible(true);
    if (clamped >= 100) finish();
  }, [finish]);

  // ─── Route change detection via pathname ────────────────────────────────

  const prevPathname = useRef(pathname);

  // When pathname changes, the new page has rendered → finish loading
  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      if (isLoadingRef.current) {
        finish();
      }
    }
  }, [pathname, finish]);

  // ─── Click detection for internal navigation ───────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

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

    // Back/forward button
    const handlePop = () => { start(); };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePop);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePop);
      cleanup();
    };
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
