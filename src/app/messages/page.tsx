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
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a1a&color=888&size=${size * 2}&bold=true`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src ?? fallback}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0 ring-2 ring-navy-500"
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
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-20 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">💬</span>
        <div>
          <h1 className="font-heading tracking-wide text-3xl text-gradient-accent">
            Messages
          </h1>
          <p className="text-[11px] font-bold text-navy-200">
            Direct messages with friends
          </p>
        </div>
      </div>

      {convos.length === 0 ? (
        <div className="game-card rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3 opacity-30">💬</p>
          <p className="font-black text-[color:var(--text-primary)] mb-1">No conversations yet</p>
          <p className="text-sm mb-5 text-navy-200">
            Follow someone and have them follow you back to start chatting.
          </p>
          <Link
            href="/leaderboard/members"
            className="btn-accent inline-block py-2.5 px-5 rounded-xl text-sm uppercase tracking-wide"
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
              className="flex items-center gap-3 p-3.5 rounded-2xl game-card transition-all duration-150 hover:border-white/20 hover:shadow-[0_0_20px_rgba(0,0,0,0.2)] active:scale-[0.98]"
            >
              <div className="relative">
                <Avatar src={c.other_user_image} name={c.other_user_name} size={46} />
                {c.unread_count > 0 && (
                  <span className="absolute -top-1 -right-1 badge-accent flex items-center justify-center"
                    style={{ minWidth: 18, height: 18, padding: "0 4px", fontSize: 10 }}
                  >
                    {c.unread_count > 99 ? "99+" : c.unread_count}
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`font-black text-sm truncate ${c.unread_count > 0 ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-secondary)]"}`}>
                    {c.other_user_name}
                  </p>
                  {c.last_message_at && (
                    <p className="text-[10px] font-bold shrink-0 text-navy-200">
                      {timeAgo(c.last_message_at)}
                    </p>
                  )}
                </div>
                <p
                  className={`text-sm truncate mt-0.5 ${c.unread_count > 0 ? "font-semibold text-[color:var(--text-secondary)]" : "text-[color:var(--text-muted)]"}`}
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
