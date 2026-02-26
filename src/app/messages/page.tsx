"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getConversations, type ConversationWithDetails } from "@/lib/messaging";
import { createClient } from "@/lib/supabase";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

function Avatar({ src, name, size = 44 }: { src: string | null; name: string; size?: number }) {
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=111827&color=888&size=${size * 2}&bold=true`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src ?? fallback}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
      onError={(e) => { (e.target as HTMLImageElement).src = fallback; }}
    />
  );
}

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [convos, setConvos] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const data = await getConversations(user.id);
    setConvos(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/profile"); return; }
    load();
  }, [user, authLoading, load, router]);

  // Realtime: refresh unread counts when a new DM arrives
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel("messages-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#F0C040", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-white mb-6">💬 Messages</h1>

      {convos.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "#111827", border: "1px solid #1B2338" }}
        >
          <p className="text-4xl mb-3">💬</p>
          <p className="font-bold text-white mb-1">No conversations yet</p>
          <p className="text-sm mb-5" style={{ color: "#3D5070" }}>
            Follow someone and have them follow you back to start chatting.
          </p>
          <Link
            href="/leaderboard/members"
            className="inline-block py-2.5 px-5 rounded-xl font-black text-sm uppercase tracking-wide"
            style={{
              background: "rgba(240,192,64,0.15)",
              border: "1px solid rgba(240,192,64,0.4)",
              color: "#F0C040",
            }}
          >
            Browse Players
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {convos.map((c) => (
            <Link
              key={c.id}
              href={`/messages/${c.other_user_id}`}
              className="flex items-center gap-3 p-3.5 rounded-2xl transition-colors hover:bg-white/5"
              style={{ background: "#111827", border: "1px solid #1B2338" }}
            >
              <div className="relative">
                <Avatar src={c.other_user_image} name={c.other_user_name} size={46} />
                {c.unread_count > 0 && (
                  <span
                    className="absolute -top-1 -right-1 text-xs font-black rounded-full flex items-center justify-center"
                    style={{
                      background: "#EF4444",
                      color: "#fff",
                      minWidth: "18px",
                      height: "18px",
                      padding: "0 4px",
                      fontSize: "10px",
                    }}
                  >
                    {c.unread_count > 99 ? "99+" : c.unread_count}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`font-black text-sm truncate ${c.unread_count > 0 ? "text-white" : "text-white/80"}`}>
                    {c.other_user_name}
                  </p>
                  {c.last_message_at && (
                    <p className="text-xs shrink-0" style={{ color: "#3D5070" }}>
                      {timeAgo(c.last_message_at)}
                    </p>
                  )}
                </div>
                <p
                  className={`text-sm truncate mt-0.5 ${c.unread_count > 0 ? "font-semibold text-white/90" : "text-white/40"}`}
                >
                  {c.last_message_preview ?? "No messages yet"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
