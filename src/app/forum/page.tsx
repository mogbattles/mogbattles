"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth, usePermissions } from "@/context/AuthContext";

interface ForumBoard {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
}

interface ForumThread {
  id: string;
  board_id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
  last_reply_at: string;
  reply_count: number;
  is_pinned: boolean;
  is_locked: boolean;
  author_name: string | null;
}

function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// ─── New Thread Form ──────────────────────────────────────────────────────────

function NewThreadForm({
  boards,
  onCreated,
}: {
  boards: ForumBoard[];
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !user) return;
    setSaving(true);
    const { error } = await db().from("forum_threads").insert({
      board_id: boardId || null,
      author_id: user.id,
      title: title.trim(),
      content: content.trim() || null,
      image_url: imageUrl.trim() || null,
    });
    setSaving(false);
    if (error) {
      setMsg("❌ " + (error as { message: string }).message);
      setTimeout(() => setMsg(null), 3000);
    } else {
      setTitle(""); setContent(""); setImageUrl("");
      onCreated();
    }
  }

  return (
    <div className="rounded-2xl p-5 space-y-3 mb-6" style={{ background: "#0D1120", border: "1px solid rgba(240,192,64,0.2)" }}>
      <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#F0C040" }}>New Thread</p>

      {msg && <p className="text-xs font-bold" style={{ color: "#EF4444" }}>{msg}</p>}

      {boards.length > 1 && (
        <select value={boardId} onChange={(e) => setBoardId(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-yellow-500"
        >
          {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}

      <input type="text" placeholder="Thread title *" value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-500"
      />
      <textarea placeholder="Post content (optional)" value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-500 resize-none"
      />
      <input type="text" placeholder="Image URL (optional)" value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-500"
      />
      <div className="flex justify-end">
        <button onClick={submit} disabled={saving || !title.trim()}
          className="px-6 py-2 rounded-xl text-sm font-black disabled:opacity-50 transition-colors"
          style={{ background: "#F0C040", color: "#07090F" }}
        >
          {saving ? "Posting…" : "Post Thread"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Forum Page ──────────────────────────────────────────────────────────

export default function ForumPage() {
  const perms = usePermissions();
  const [boards, setBoards] = useState<ForumBoard[]>([]);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [activeBoard, setActiveBoard] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewThread, setShowNewThread] = useState(false);

  async function loadThreads(boardId: string | null) {
    setLoading(true);
    let q = db()
      .from("forum_threads")
      .select("id, board_id, title, content, image_url, created_at, last_reply_at, reply_count, is_pinned, is_locked, author_name")
      .order("is_pinned", { ascending: false })
      .order("last_reply_at", { ascending: false })
      .limit(50);
    if (boardId) q = q.eq("board_id", boardId);
    const { data } = await q;
    setThreads((data ?? []) as ForumThread[]);
    setLoading(false);
  }

  useEffect(() => {
    // Load boards first
    db().from("forum_boards").select("*").order("sort_order").then(({ data }) => {
      const b = (data ?? []) as ForumBoard[];
      setBoards(b);
      loadThreads(null);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchBoard(id: string | null) {
    setActiveBoard(id);
    loadThreads(id);
    setShowNewThread(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            💬 <span>Forum</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Community boards — anonymous-friendly</p>
        </div>
        {perms.canPostThread ? (
          <button
            onClick={() => setShowNewThread((v) => !v)}
            className="text-xs font-black px-4 py-2 rounded-xl transition-colors"
            style={{ background: "rgba(240,192,64,0.1)", color: "#F0C040", border: "1px solid rgba(240,192,64,0.2)" }}
          >
            {showNewThread ? "✕ Cancel" : "✏️ New Thread"}
          </button>
        ) : (
          <div
            className="text-[10px] font-bold px-3 py-1.5 rounded-xl"
            style={{ background: "#141A2C", color: "#3D5070", border: "1px solid #1B2338" }}
          >
            {perms.isMember ? "Need arena profile to post" : "Sign in to comment"}
          </div>
        )}
      </div>

      {/* Board tabs */}
      {boards.length > 0 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          <button
            onClick={() => switchBoard(null)}
            className="shrink-0 text-xs font-black px-3 py-1.5 rounded-full border transition-colors"
            style={{
              background: activeBoard === null ? "#F0C040" : "#111827",
              color: activeBoard === null ? "#07090F" : "#4D6080",
              border: `1px solid ${activeBoard === null ? "#F0C040" : "#1B2338"}`,
            }}
          >
            All
          </button>
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => switchBoard(board.id)}
              className="shrink-0 text-xs font-black px-3 py-1.5 rounded-full border transition-colors"
              style={{
                background: activeBoard === board.id ? "#F0C040" : "#111827",
                color: activeBoard === board.id ? "#07090F" : "#4D6080",
                border: `1px solid ${activeBoard === board.id ? "#F0C040" : "#1B2338"}`,
              }}
            >
              /{board.slug}/ — {board.name}
            </button>
          ))}
        </div>
      )}

      {/* New thread form */}
      {showNewThread && perms.canPostThread && (
        <NewThreadForm
          boards={boards}
          onCreated={() => { setShowNewThread(false); loadThreads(activeBoard); }}
        />
      )}

      {/* Permission hint for members without arena profile */}
      {!perms.canPostThread && perms.isMember && (
        <div
          className="mb-4 px-4 py-3 rounded-xl text-xs font-bold"
          style={{ background: "#0D1120", border: "1px solid #1B2338", color: "#3D5070" }}
        >
          💡 To post threads you need to be in at least one arena with a photo uploaded. Comments &amp; likes are open to all members.
        </div>
      )}

      {/* Thread grid — 4chan style */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl h-36 animate-pulse" style={{ background: "#111827" }} />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-24">
          <div className="text-5xl mb-4">💬</div>
          <p className="text-zinc-400 font-semibold">No threads yet</p>
          {perms.canPostThread && (
            <p className="text-zinc-600 text-sm mt-1">Be the first to start a discussion</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/forum/${thread.id}`}
              className="block rounded-2xl overflow-hidden transition-all duration-150 active:scale-[0.98]"
              style={{ background: "#0D1120", border: "1px solid #1B2338" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(240,192,64,0.25)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#1B2338";
              }}
            >
              {thread.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thread.image_url} alt="" className="w-full h-32 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="p-3.5">
                {/* Badges */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  {thread.is_pinned && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full" style={{ background: "rgba(240,192,64,0.12)", color: "#F0C040" }}>
                      📌 Pinned
                    </span>
                  )}
                  {thread.is_locked && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full" style={{ background: "#1B2338", color: "#3D5070" }}>
                      🔒 Locked
                    </span>
                  )}
                  {boards.find((b) => b.id === thread.board_id) && (
                    <span className="text-[9px] font-bold" style={{ color: "#253147" }}>
                      /{boards.find((b) => b.id === thread.board_id)?.slug}/
                    </span>
                  )}
                </div>

                <h3 className="text-white font-black text-sm leading-snug mb-1 line-clamp-2">
                  {thread.title}
                </h3>
                {thread.content && (
                  <p className="text-[11px] leading-snug line-clamp-2 mb-2" style={{ color: "#4D6080" }}>
                    {thread.content}
                  </p>
                )}
                <div className="flex items-center justify-between text-[10px] font-bold" style={{ color: "#253147" }}>
                  <span>
                    {thread.author_name ? `Anon#${thread.author_name.slice(0, 4)}` : "Anon"}
                    {" · "}{timeAgo(thread.created_at)}
                  </span>
                  <span>💬 {thread.reply_count}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
