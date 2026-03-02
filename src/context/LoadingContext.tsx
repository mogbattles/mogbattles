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
  /** Current progress 0–100. 0 = idle (overlay hidden). */
  progress: number;
  /** True while the overlay is visible (progress > 0 and < 100). */
  isLoading: boolean;
  /** Manually start loading (resets to 0 and begins climbing). */
  startLoading: () => void;
  /** Manually finish loading (jumps to 100 then hides). */
  finishLoading: () => void;
  /** Set an explicit progress value 0–100. */
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
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resourceObserverRef = useRef<PerformanceObserver | null>(null);
  const expectedResources = useRef(0);
  const loadedResources = useRef(0);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (resourceObserverRef.current) resourceObserverRef.current.disconnect();
    };
  }, []);

  const setProgress = useCallback((v: number) => {
    const clamped = Math.min(100, Math.max(0, v));
    setProgressRaw(clamped);
    if (clamped > 0 && clamped < 100) {
      setVisible(true);
    }
    if (clamped >= 100) {
      // Keep overlay for a moment at 100% so the user sees completion
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setProgressRaw(0);
      }, 400);
    }
  }, []);

  // ─── Real progress tracking via Performance API ──────────────────────────

  const startResourceTracking = useCallback(() => {
    if (typeof window === "undefined" || !("PerformanceObserver" in window)) return;

    loadedResources.current = 0;
    expectedResources.current = 0;

    // Count currently pending resources from the performance buffer
    const existing = performance.getEntriesByType("resource");
    expectedResources.current = existing.length;
    loadedResources.current = existing.length;

    // Observe new resource loads
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        loadedResources.current += entries.length;

        // Estimate: each new resource we see means one loaded
        // We estimate total based on what we've seen so far + a buffer
        if (expectedResources.current < loadedResources.current + 3) {
          expectedResources.current = loadedResources.current + 3;
        }

        const pct = Math.min(
          90, // Cap real progress at 90% — remaining 10% on completion
          Math.round((loadedResources.current / expectedResources.current) * 90)
        );

        setProgress(pct);
      });

      observer.observe({ entryTypes: ["resource"] });
      resourceObserverRef.current = observer;
    } catch {
      // PerformanceObserver not supported — fall back to simulation
    }
  }, [setProgress]);

  // ─── Intercept fetch for tracking ────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalFetch = window.fetch;
    let activeFetches = 0;
    let completedFetches = 0;

    window.fetch = async (...args) => {
      activeFetches++;
      const totalExpected = activeFetches;

      try {
        const response = await originalFetch(...args);
        completedFetches++;

        // Update progress based on fetch completion ratio
        if (visible && totalExpected > 0) {
          const fetchPct = Math.min(85, Math.round((completedFetches / totalExpected) * 85));
          setProgress(Math.max(progress, fetchPct));
        }

        return response;
      } catch (err) {
        completedFetches++;
        throw err;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
    // Only re-bind on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Navigation-based loading (Next.js route changes) ───────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    let progressInterval: ReturnType<typeof setInterval> | null = null;

    const handleStart = () => {
      setProgressRaw(0);
      setVisible(true);
      loadedResources.current = 0;
      expectedResources.current = 0;

      startResourceTracking();

      // Smooth simulated progress that accelerates then slows
      let current = 0;
      progressInterval = setInterval(() => {
        if (current < 30) {
          current += 4; // Fast start
        } else if (current < 60) {
          current += 2; // Medium
        } else if (current < 85) {
          current += 0.5; // Slow crawl
        }
        // Don't exceed 90 — final 10% reserved for actual completion
        current = Math.min(current, 90);
        setProgressRaw((prev) => Math.max(prev, current));
      }, 80);
    };

    const handleComplete = () => {
      if (progressInterval) clearInterval(progressInterval);
      if (resourceObserverRef.current) {
        resourceObserverRef.current.disconnect();
        resourceObserverRef.current = null;
      }
      setProgress(100);
    };

    // Listen for Next.js navigation events via popstate + click interception
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as Element)?.closest?.("a");
      if (
        anchor &&
        anchor.href &&
        anchor.href.startsWith(window.location.origin) &&
        !anchor.href.includes("#") &&
        !anchor.target &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        anchor.href !== window.location.href
      ) {
        handleStart();
      }
    };

    // Use MutationObserver on <main> to detect route changes
    const mainEl = document.querySelector("main");
    let mutationObserver: MutationObserver | null = null;

    if (mainEl) {
      mutationObserver = new MutationObserver(() => {
        if (visible) {
          handleComplete();
        }
      });
      mutationObserver.observe(mainEl, { childList: true, subtree: false });
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handleStart);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handleStart);
      if (progressInterval) clearInterval(progressInterval);
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, [visible, setProgress, startResourceTracking]);

  // ─── Initial page load ───────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Show loader on initial load
    if (document.readyState !== "complete") {
      setProgressRaw(10);
      setVisible(true);
      startResourceTracking();

      const handleLoad = () => {
        setProgress(100);
      };
      window.addEventListener("load", handleLoad);
      return () => window.removeEventListener("load", handleLoad);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startLoading = useCallback(() => {
    setProgressRaw(5);
    setVisible(true);
    startResourceTracking();
  }, [startResourceTracking]);

  const finishLoading = useCallback(() => {
    setProgress(100);
  }, [setProgress]);

  return (
    <LoadingContext.Provider
      value={{
        progress,
        isLoading: visible,
        startLoading,
        finishLoading,
        setProgress,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
}
