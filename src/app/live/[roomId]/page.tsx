"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { createClient } from "@/lib/supabase";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  GridLayout,
  ParticipantTile,
  useTracks,
  useParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";

interface StreamInfo {
  id: string;
  host_id: string;
  room_name: string;
  title: string;
  is_active: boolean;
  started_at: string;
  host_name: string;
}

// ── Viewer count display ────────────────────────────────────────────────────
function ViewerCount() {
  const participants = useParticipants();
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-950/80 border border-gold/15 backdrop-blur-sm"
    >
      <span className="text-xs">👁</span>
      <span
        className="text-xs font-black text-gold"
      >
        {participants.length}
      </span>
      <span className="text-[10px] font-bold text-navy-200">
        watching
      </span>
    </div>
  );
}

// ── Custom stage for viewers ────────────────────────────────────────────────
function ViewerStage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  return (
    <div className="flex-1 min-h-0">
      <GridLayout
        tracks={tracks}
        style={{
          height: "100%",
          width: "100%",
        }}
      >
        <ParticipantTile />
      </GridLayout>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function StreamRoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [stream, setStream] = useState<StreamInfo | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const isHost = user && stream ? user.id === stream.host_id : false;

  // Fetch stream info
  useEffect(() => {
    async function load() {
      const supabase = createClient();

      type StreamRow = {
        id: string;
        host_id: string;
        room_name: string;
        title: string;
        is_active: boolean;
        started_at: string;
      };

      const { data, error: fetchErr } = await supabase
        .from("live_streams")
        .select("id, host_id, room_name, title, is_active, started_at")
        .eq("id", roomId)
        .single();

      const row = data as StreamRow | null;

      if (fetchErr || !row) {
        setError("Stream not found");
        setLoading(false);
        return;
      }

      if (!row.is_active) {
        setError("This stream has ended");
        setLoading(false);
        return;
      }

      // Fetch host name
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", row.host_id)
        .single();

      setStream({
        ...row,
        host_name: (profile as { name: string } | null)?.name ?? "Anonymous",
      });
      setLoading(false);
    }

    load();
  }, [roomId]);

  // Fetch LiveKit token once we have stream info + user
  useEffect(() => {
    if (!stream || !user || authLoading) return;

    async function fetchToken() {
      try {
        // Fetch user's profile name for display
        const supabase = createClient();
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("name")
          .eq("user_id", user!.id)
          .single();

        const displayName =
          (myProfile as { name: string } | null)?.name ?? "Viewer";
        const isHostUser = user!.id === stream!.host_id;

        const res = await fetch(
          `/api/livekit/token?room=${encodeURIComponent(
            stream!.room_name
          )}&username=${encodeURIComponent(
            displayName
          )}&publish=${isHostUser}`
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(
            (body as { error?: string }).error ?? "Failed to get stream token"
          );
          return;
        }

        const data = (await res.json()) as { token: string };
        setToken(data.token);
      } catch {
        setError("Failed to connect to stream");
      }
    }

    fetchToken();
  }, [stream, user, authLoading]);

  // Subscribe to stream updates (e.g. host ends stream)
  useEffect(() => {
    if (!stream) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`stream-${stream.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "live_streams",
          filter: `id=eq.${stream.id}`,
        },
        (payload) => {
          const updated = payload.new as { is_active?: boolean };
          if (updated.is_active === false) {
            setError("This stream has ended");
            setToken(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stream]);

  const handleEndStream = useCallback(async () => {
    if (!stream || !user || ending) return;
    setEnding(true);

    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("live_streams") as any)
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq("id", stream.id);

    router.push("/live");
  }, [stream, user, ending, router]);

  function timeSince(dateStr: string): string {
    const seconds = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 1000
    );
    if (seconds < 60) return "Just started";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  // ── Loading / Error states ────────────────────────────────────────────────
  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#F0C040", borderTopColor: "transparent" }}
        />
        <p className="mt-3 text-sm font-bold" style={{ color: "var(--text-muted)" }}>
          Connecting to stream...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl mb-4">📡</div>
        <h1 className="text-xl font-black text-[color:var(--text-primary)] mb-2">{error}</h1>
        <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
          The stream may have ended or the link might be invalid.
        </p>
        <button
          onClick={() => router.push("/live")}
          className="px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
          style={{
            background: "var(--bg-card)",
            color: "var(--gold)",
            border: "1px solid rgba(240,192,64,0.2)",
          }}
        >
          ← Back to Live
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-black text-[color:var(--text-primary)] mb-2">
          Sign in to watch
        </h1>
        <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
          You need an account to watch live streams.
        </p>
        <button
          onClick={() => router.push("/profile")}
          className="px-5 py-2.5 rounded-xl text-sm font-bold"
          style={{
            background: "linear-gradient(160deg, #FFD700, #F0C040)",
            color: "#1A1000",
          }}
        >
          Sign In
        </button>
      </div>
    );
  }

  if (!token || !stream) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#F0C040", borderTopColor: "transparent" }}
        />
        <p className="mt-3 text-sm font-bold" style={{ color: "var(--text-muted)" }}>
          Joining stream...
        </p>
      </div>
    );
  }

  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!livekitUrl) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-black text-[color:var(--text-primary)] mb-2">
          Streaming Not Configured
        </h1>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          LiveKit environment variables are not set. Contact the site admin.
        </p>
      </div>
    );
  }

  // ── Stream room ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: "56px",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.85) 100%)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/live")}
            className="text-xs font-bold px-2 py-1 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)", background: "rgba(255,255,255,0.03)" }}
          >
            ← Back
          </button>

          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
            style={{
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.3)",
            }}
          >
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: "#EF4444" }}
            />
            <span
              className="text-[10px] font-black uppercase tracking-wider"
              style={{ color: "#EF4444" }}
            >
              Live
            </span>
          </div>

          <div className="min-w-0">
            <h1 className="text-sm font-black text-[color:var(--text-primary)] truncate leading-tight">
              {stream.title}
            </h1>
            <p className="text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>
              {stream.host_name} · {timeSince(stream.started_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isHost && (
            <button
              onClick={handleEndStream}
              disabled={ending}
              className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all"
              style={{
                background: "rgba(239,68,68,0.15)",
                color: "#EF4444",
                border: "1px solid rgba(239,68,68,0.3)",
              }}
            >
              {ending ? "Ending..." : "End Stream"}
            </button>
          )}
        </div>
      </div>

      {/* LiveKit room */}
      <div className="flex-1 min-h-0 relative">
        <LiveKitRoom
          serverUrl={livekitUrl}
          token={token}
          connect={true}
          video={isHost}
          audio={isHost}
          onMediaDeviceFailure={(failure) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const kind = (failure as any)?.kind;
            if (kind === "videoinput") {
              setMediaError(
                "Camera access failed. If you're already streaming on another app (OBS, Twitch, YouTube, etc.), your camera may be locked to that app. Try closing the other app first, or use Screen Share instead."
              );
            } else if (kind === "audioinput") {
              setMediaError(
                "Microphone access failed. Another app may be using your mic exclusively, or browser permissions were denied. Check your browser settings."
              );
            } else {
              setMediaError(
                "Could not access your camera or microphone. Make sure browser permissions are allowed and no other app is locking the device."
              );
            }
          }}
          onDisconnected={() => {
            if (!isHost) {
              setError("Disconnected from stream");
            }
          }}
          style={{ height: "100%" }}
          data-lk-theme="default"
        >
          {/* Camera/mic error banner for host */}
          {isHost && mediaError && (
            <div
              className="absolute top-0 left-0 right-0 z-40 px-4 py-3"
              style={{
                background: "rgba(239,68,68,0.12)",
                borderBottom: "1px solid rgba(239,68,68,0.3)",
                backdropFilter: "blur(8px)",
              }}
            >
              <div className="max-w-2xl mx-auto flex items-start gap-3">
                <span className="text-lg shrink-0 mt-0.5">⚠️</span>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-bold leading-relaxed"
                    style={{ color: "#F0A0A0" }}
                  >
                    {mediaError}
                  </p>
                  <p
                    className="text-[10px] font-bold mt-1.5"
                    style={{ color: "#6B3030" }}
                  >
                    Tip: You can still use Screen Share from the controls below to
                    stream your screen instead of your camera.
                  </p>
                </div>
                <button
                  onClick={() => setMediaError(null)}
                  className="text-xs font-bold shrink-0 px-2 py-1 rounded-lg"
                  style={{ color: "#EF4444", background: "rgba(239,68,68,0.1)" }}
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {isHost ? (
            /* Host sees full video conference controls */
            <VideoConference />
          ) : (
            /* Viewer sees the stream + audio */
            <div className="flex flex-col h-full">
              <ViewerStage />
              <RoomAudioRenderer />
            </div>
          )}

          {/* Viewer count overlay */}
          <div className="absolute top-3 right-3 z-30">
            <ViewerCount />
          </div>
        </LiveKitRoom>
      </div>
    </div>
  );
}
