"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase";

interface LiveStream {
  id: string;
  host_id: string;
  room_name: string;
  title: string;
  is_active: boolean;
  started_at: string;
  host_name: string;
  host_image: string | null;
}

export default function LivePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  type StreamRow = {
    id: string;
    host_id: string;
    room_name: string;
    title: string;
    is_active: boolean;
    started_at: string;
  };

  const fetchStreams = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("live_streams")
      .select("id, host_id, room_name, title, is_active, started_at")
      .eq("is_active", true)
      .order("started_at", { ascending: false });

    const rows = (data ?? []) as StreamRow[];

    if (rows.length === 0) {
      setStreams([]);
      setLoading(false);
      return;
    }

    // Fetch host profiles
    const hostIds = [...new Set(rows.map((r) => r.host_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name, image_url")
      .in("user_id", hostIds);

    type PRow = { user_id: string; name: string; image_url: string | null };
    const profileMap = new Map(
      ((profiles ?? []) as PRow[]).map((p) => [p.user_id, p])
    );

    const enriched: LiveStream[] = rows.map((r) => {
      const profile = profileMap.get(r.host_id);
      return {
        ...r,
        host_name: profile?.name ?? "Anonymous",
        host_image: profile?.image_url ?? null,
      };
    });

    setStreams(enriched);
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    fetchStreams();
  }, [fetchStreams]);

  // Realtime subscription for live stream updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("live-streams-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_streams" },
        () => {
          fetchStreams();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStreams]);

  async function handleGoLive() {
    if (!user || !title.trim()) return;
    setCreating(true);

    try {
      const supabase = createClient();
      const roomName = `mog-${user.id.slice(0, 8)}-${Date.now()}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("live_streams") as any)
        .insert({
          host_id: user.id,
          room_name: roomName,
          title: title.trim(),
        })
        .select("id")
        .single();

      if (error) {
        console.error("Failed to create stream:", error);
        setCreating(false);
        return;
      }

      router.push(`/live/${(data as { id: string }).id}`);
    } catch {
      setCreating(false);
    }
  }

  function timeSince(dateStr: string): string {
    const seconds = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 1000
    );
    if (seconds < 60) return "Just started";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  }

  return (
    <div className="min-h-screen px-4 pt-20 pb-28">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl animate-pulse">🔴</span>
              <h1
                className="text-2xl font-black uppercase tracking-wider"
                style={{
                  background:
                    "linear-gradient(90deg, #FFD700 0%, #F0C040 50%, #FF8040 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Live Streams
              </h1>
            </div>
            <p className="text-xs font-bold" style={{ color: "#3D5070" }}>
              Watch MOG battles happen in real time
            </p>
          </div>

          {user && !authLoading && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all duration-150"
              style={{
                background:
                  "linear-gradient(160deg, #FFD700 0%, #F0C040 50%, #FF6B2B 100%)",
                color: "#1A1000",
                boxShadow:
                  "0 4px 0 #8B6914, 0 4px 16px rgba(240,192,64,0.35)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform =
                  "translateY(-1px)";
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "0 6px 0 #8B6914, 0 6px 24px rgba(240,192,64,0.5)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform =
                  "translateY(0)";
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "0 4px 0 #8B6914, 0 4px 16px rgba(240,192,64,0.35)";
              }}
            >
              <span className="text-base">📡</span>
              Go Live
            </button>
          )}
        </div>

        {/* Stream grid */}
        {loading || authLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "#F0C040", borderTopColor: "transparent" }}
            />
            <p
              className="mt-3 text-sm font-bold"
              style={{ color: "#3D5070" }}
            >
              Loading streams...
            </p>
          </div>
        ) : streams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4 opacity-30">📡</div>
            <h2
              className="text-lg font-black mb-2"
              style={{ color: "#4D6080" }}
            >
              No one is live right now
            </h2>
            <p className="text-xs max-w-xs" style={{ color: "#2E3D58" }}>
              {user
                ? "Be the first to go live! Click the Go Live button to start streaming."
                : "Sign in to start your own live stream."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {streams.map((stream) => (
              <button
                key={stream.id}
                onClick={() => router.push(`/live/${stream.id}`)}
                className="text-left rounded-2xl overflow-hidden transition-all duration-150 group"
                style={{
                  background: "#141A2C",
                  border: "2px solid #1B2338",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "rgba(240,192,64,0.4)";
                  (e.currentTarget as HTMLElement).style.transform =
                    "translateY(-2px)";
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 8px 24px rgba(0,0,0,0.4), 0 0 20px rgba(240,192,64,0.1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "#1B2338";
                  (e.currentTarget as HTMLElement).style.transform =
                    "translateY(0)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                }}
              >
                {/* Thumbnail area */}
                <div
                  className="relative aspect-video flex items-center justify-center"
                  style={{ background: "#0C1020" }}
                >
                  {stream.host_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={stream.host_image}
                      alt={stream.host_name}
                      className="w-full h-full object-cover opacity-40"
                    />
                  ) : (
                    <span className="text-5xl opacity-20">🎬</span>
                  )}

                  {/* LIVE badge */}
                  <div
                    className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg"
                    style={{
                      background: "rgba(239,68,68,0.9)",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{ background: "#fff" }}
                    />
                    <span className="text-[10px] font-black text-white uppercase tracking-wider">
                      Live
                    </span>
                  </div>

                  {/* Time since */}
                  <div
                    className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[9px] font-bold"
                    style={{
                      background: "rgba(0,0,0,0.7)",
                      color: "#8FA0C0",
                    }}
                  >
                    {timeSince(stream.started_at)}
                  </div>

                  {/* Big play icon overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{
                        background: "rgba(240,192,64,0.9)",
                        boxShadow: "0 0 20px rgba(240,192,64,0.5)",
                      }}
                    >
                      <span className="text-xl ml-0.5">▶</span>
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {/* Host avatar */}
                    <div
                      className="w-8 h-8 rounded-full overflow-hidden shrink-0"
                      style={{
                        background: "#0C1020",
                        border: "2px solid #1B2338",
                      }}
                    >
                      {stream.host_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={stream.host_image}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs">
                          👤
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3
                        className="text-sm font-black text-white truncate leading-tight"
                      >
                        {stream.title}
                      </h3>
                      <p
                        className="text-[10px] font-bold truncate"
                        style={{ color: "#4D6080" }}
                      >
                        {stream.host_name}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Go Live Modal ────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={() => {
            if (!creating) setShowModal(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{
              background: "#141A2C",
              border: "2px solid #1B2338",
              boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">📡</span>
              <h2 className="text-lg font-black text-white">Start Streaming</h2>
            </div>

            <p
              className="text-xs font-bold mb-4"
              style={{ color: "#3D5070" }}
            >
              Your camera and microphone will be used. Viewers can watch you
              live on MogBattles.
            </p>

            <label className="block mb-4">
              <span
                className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                style={{ color: "#4D6080" }}
              >
                Stream Title
              </span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Live MOG Rating Session"
                maxLength={100}
                className="w-full px-4 py-3 rounded-xl text-sm font-bold text-white outline-none transition-colors"
                style={{
                  background: "#0C1020",
                  border: "2px solid #1B2338",
                }}
                onFocus={(e) =>
                  ((e.target as HTMLElement).style.borderColor =
                    "rgba(240,192,64,0.4)")
                }
                onBlur={(e) =>
                  ((e.target as HTMLElement).style.borderColor = "#1B2338")
                }
                autoFocus
              />
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={creating}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-colors"
                style={{
                  background: "#0C1020",
                  color: "#4D6080",
                  border: "1px solid #1B2338",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleGoLive}
                disabled={!title.trim() || creating}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all duration-150"
                style={{
                  background:
                    title.trim() && !creating
                      ? "linear-gradient(160deg, #FFD700 0%, #F0C040 50%, #FF6B2B 100%)"
                      : "#1B2338",
                  color: title.trim() && !creating ? "#1A1000" : "#3D5070",
                  boxShadow:
                    title.trim() && !creating
                      ? "0 4px 0 #8B6914, 0 4px 16px rgba(240,192,64,0.25)"
                      : "none",
                }}
              >
                {creating ? "Starting..." : "Go Live 🔴"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
