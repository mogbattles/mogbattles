"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth, usePermissions, useImpersonation } from "@/context/AuthContext";

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
  vote_score: number;
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
  const { isImpersonating, profile: impProfile } = useImpersonation();
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !user) return;
    setSaving(true);

    let error: { message: string } | null = null;

    if (isImpersonating && impProfile) {
      // Post as impersonated seeded profile via admin RPC
      const { error: rpcErr } = await db().rpc("admin_post_as_profile", {
        p_type: "thread",
        p_profile_id: impProfile.id,
        p_board_id: boardId || null,
        p_title: title.trim(),
        p_content: content.trim() || null,
        p_image_url: imageUrl.trim() || null,
      });
      error = rpcErr as { message: string } | null;
    } else {
      // Normal post
      const { error: insertErr } = await db().from("forum_threads").insert({
        board_id: boardId || null,
        author_id: user.id,
        title: title.trim(),
        content: content.trim() || null,
        image_url: imageUrl.trim() || null,
      });
      error = insertErr as { message: string } | null;
    }

    setSaving(false);
    if (error) {
      setMsg("\u274C " + error.message);
      setTimeout(() => setMsg(null), 3000);
    } else {
      setTitle(""); setContent(""); setImageUrl("");
      onCreated();
    }
  }

  return (
    <div className="game-card rounded-2xl p-5 space-y-3 mb-6" style={{ borderColor: "var(--border)" }}>
      <p className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--accent)" }}>New Thread</p>

      {msg && <p className="text-xs font-bold text-game-red">{msg}</p>}

      {boards.length > 1 && (
        <select value={boardId} onChange={(e) => setBoardId(e.target.value)}
          className="game-input !py-2 text-sm"
        >
          {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}

      <input type="text" placeholder="Thread title *" value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="game-input text-sm"
      />
      <textarea placeholder="Post content (optional)" value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className="game-input text-sm resize-none"
      />
      <input type="text" placeholder="Image URL (optional)" value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        className="game-input text-sm"
      />
      <div className="flex justify-end">
        <button onClick={submit} disabled={saving || !title.trim()}
          className="btn-accent px-6 py-2 rounded-xl text-sm font-black disabled:opacity-50 transition-colors"
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
      .select("id, board_id, title, content, image_url, created_at, last_reply_at, reply_count, vote_score, is_pinned, is_locked, author_name")
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
    <div className="max-w-4xl mx-auto px-4 pt-20 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">💬</span>
            <h1 className="font-heading tracking-wide text-3xl text-gradient-gold">
              Forum
            </h1>
          </div>
          <p className="text-xs font-bold text-navy-200">Community boards — anonymous-friendly</p>
        </div>
        {perms.canPostThread ? (
          <button
            onClick={() => setShowNewThread((v) => !v)}
            className="btn-dark text-xs font-black px-4 py-2 rounded-xl"
          >
            {showNewThread ? "✕ Cancel" : "✏️ New Thread"}
          </button>
        ) : (
          <div className="text-[10px] font-bold px-3 py-1.5 rounded-xl bg-navy-700 text-navy-200 border border-navy-500">
            {perms.isMember ? "Need arena profile to post" : "Sign in to comment"}
          </div>
        )}
      </div>

      {/* Board tabs */}
      {boards.length > 0 && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          <button
            onClick={() => switchBoard(null)}
            className={`shrink-0 text-xs font-black px-3.5 py-1.5 rounded-full border transition-all duration-150 ${
              activeBoard === null
                ? "text-[color:var(--bg-primary)] border-transparent shadow-[0_0_12px_rgba(128,128,128,0.15)]"
                : "bg-navy-800 text-navy-200 border-navy-500 hover:border-navy-300"
            }`}
            style={activeBoard === null ? { background: "var(--accent)" } : undefined}
          >
            All
          </button>
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => switchBoard(board.id)}
              className={`shrink-0 text-xs font-black px-3.5 py-1.5 rounded-full border transition-all duration-150 ${
                activeBoard === board.id
                  ? "text-[color:var(--bg-primary)] border-transparent shadow-[0_0_12px_rgba(128,128,128,0.15)]"
                  : "bg-navy-800 text-navy-200 border-navy-500 hover:border-navy-300"
              }`}
              style={activeBoard === board.id ? { background: "var(--accent)" } : undefined}
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
        <div className="mb-4 px-4 py-3 rounded-xl text-xs font-bold bg-navy-800 border border-navy-500 text-navy-200">
          💡 To post threads you need to be in at least one arena with a photo uploaded. Comments &amp; likes are open to all members.
        </div>
      )}

      {/* Thread grid — 4chan style */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl h-36 animate-pulse bg-navy-800" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-24">
          <div className="text-5xl mb-4 opacity-30">💬</div>
          <p className="font-black text-navy-200">No threads yet</p>
          {perms.canPostThread && (
            <p className="text-sm mt-1 text-navy-400">Be the first to start a discussion</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              href={`/forum/${thread.id}`}
              className="block rounded-2xl overflow-hidden game-card transition-all duration-150 active:scale-[0.98] hover:border-navy-300 hover:shadow-[0_0_20px_rgba(0,0,0,0.2)]"
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
                    <span className="badge-gold !text-[9px]">📌 Pinned</span>
                  )}
                  {thread.is_locked && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-navy-500 text-navy-200">
                      🔒 Locked
                    </span>
                  )}
                  {boards.find((b) => b.id === thread.board_id) && (
                    <span className="text-[9px] font-bold text-navy-400">
                      /{boards.find((b) => b.id === thread.board_id)?.slug}/
                    </span>
                  )}
                </div>

                <h3 className="text-[color:var(--text-primary)] font-black text-sm leading-snug mb-1 line-clamp-2">
                  {thread.title}
                </h3>
                {thread.content && (
                  <p className="text-[11px] leading-snug line-clamp-2 mb-2 text-navy-200">
                    {thread.content}
                  </p>
                )}
                <div className="flex items-center justify-between text-[10px] font-bold text-navy-400">
                  <span>
                    {thread.author_name ? `Anon#${thread.author_name.slice(0, 4)}` : "Anon"}
                    {" · "}{timeAgo(thread.created_at)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={thread.vote_score > 0 ? "text-orange-400" : thread.vote_score < 0 ? "text-blue-400" : ""}>
                      ⬆ {thread.vote_score}
                    </span>
                    <span>💬 {thread.reply_count}</span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
