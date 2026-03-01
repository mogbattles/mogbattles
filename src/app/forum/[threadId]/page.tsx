"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth, usePermissions, useImpersonation } from "@/context/AuthContext";
import ForumVoteButton from "@/components/ForumVoteButton";

interface Thread {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
  is_locked: boolean;
  author_name: string | null;
  author_id: string | null;
  vote_score: number;
}

interface Reply {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  likes: number;
  author_name: string | null;
  author_id: string | null;
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
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const perms = usePermissions();
  const { isImpersonating, profile: impProfile } = useImpersonation();

  const [thread, setThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [replyImage, setReplyImage] = useState("");
  const [posting, setPosting] = useState(false);
  const [confirmDeleteThread, setConfirmDeleteThread] = useState(false);
  const [confirmDeleteReply, setConfirmDeleteReply] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Map of targetId → user's vote (+1, -1, or 0)
  const [myVotes, setMyVotes] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!threadId) return;
    Promise.all([
      db()
        .from("forum_threads")
        .select("id, title, content, image_url, created_at, is_locked, author_name, author_id, vote_score")
        .eq("id", threadId)
        .single(),
      db()
        .from("forum_replies")
        .select("id, content, image_url, created_at, likes, author_name, author_id")
        .eq("thread_id", threadId)
        .order("created_at"),
    ]).then(([{ data: t }, { data: r }]) => {
      setThread(t as Thread | null);
      setReplies((r ?? []) as Reply[]);
      setLoading(false);
    });
  }, [threadId]);

  // Fetch current user's votes for this thread + its replies
  useEffect(() => {
    if (!threadId || !user) return;
    db()
      .rpc("get_my_forum_votes", { p_thread_id: threadId })
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, number>();
        for (const row of data as { thread_id: string | null; reply_id: string | null; vote: number }[]) {
          if (row.thread_id) map.set(row.thread_id, row.vote);
          if (row.reply_id) map.set(row.reply_id, row.vote);
        }
        setMyVotes(map);
      });
  }, [threadId, user]);

  async function postReply() {
    if (!replyText.trim() || !user || !thread) return;
    setPosting(true);

    let failed = false;

    if (isImpersonating && impProfile) {
      // Post reply as impersonated seeded profile via admin RPC
      const { error } = await db().rpc("admin_post_as_profile", {
        p_type: "reply",
        p_profile_id: impProfile.id,
        p_thread_id: thread.id,
        p_content: replyText.trim(),
        p_image_url: replyImage.trim() || null,
      });
      failed = !!error;
    } else {
      // Normal reply
      const { error } = await db().from("forum_replies").insert({
        thread_id: thread.id,
        author_id: user.id,
        content: replyText.trim(),
        image_url: replyImage.trim() || null,
      });
      failed = !!error;
    }

    setPosting(false);
    if (!failed) {
      setReplyText("");
      setReplyImage("");
      // Refresh replies
      db()
        .from("forum_replies")
        .select("id, content, image_url, created_at, likes, author_name")
        .eq("thread_id", thread.id)
        .order("created_at")
        .then(({ data }) => setReplies((data ?? []) as Reply[]));
    }
  }

  async function deleteThread() {
    if (!thread) return;
    setDeletingId(thread.id);
    const { error } = await db().from("forum_threads").delete().eq("id", thread.id);
    setDeletingId(null);
    setConfirmDeleteThread(false);
    if (!error) router.push("/forum");
  }

  async function deleteReply(replyId: string) {
    setDeletingId(replyId);
    const { error } = await db().from("forum_replies").delete().eq("id", replyId);
    setDeletingId(null);
    setConfirmDeleteReply(null);
    if (!error) setReplies((prev) => prev.filter((r) => r.id !== replyId));
  }

  // Can this user delete this item? Admin: always. Mod: non-admin content. Author: own content.
  function canDelete(authorId: string | null): boolean {
    if (perms.isAdmin) return true;
    if (perms.isModerator) return true; // RLS enforces admin-author protection
    if (user && authorId === user.id) return true;
    return false;
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-20 pb-28">
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl h-20 animate-pulse bg-navy-800" />
          ))}
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-20 pb-28 text-center py-24">
        <p className="font-black text-navy-200">Thread not found</p>
        <Link
          href="/forum"
          className="text-xs font-bold mt-4 inline-block hover:text-white transition-colors"
          style={{ color: "var(--accent)" }}
        >
          ← Back to Forum
        </Link>
      </div>
    );
  }

  const canVote = perms.canCommentForum || isImpersonating;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-20 pb-28">
      {/* Back link */}
      <Link
        href="/forum"
        className="inline-flex items-center gap-1 text-xs font-bold mb-5 transition-colors text-navy-200 hover:text-white"
      >
        ← Forum
      </Link>

      {/* OP post */}
      <div className="rounded-2xl overflow-hidden mb-4 game-card" style={{ borderColor: "rgba(253,41,123,0.2)" }}>
        {thread.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thread.image_url}
            alt=""
            className="w-full max-h-80 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="p-5 flex gap-3">
          {/* Vote column */}
          <ForumVoteButton
            targetType="thread"
            targetId={thread.id}
            initialScore={thread.vote_score}
            userVote={myVotes.get(thread.id) ?? 0}
            canVote={canVote}
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="badge-accent !text-[9px]">OP</span>
              <span className="text-[10px] font-bold text-navy-400">
                {thread.author_name ?? "Anon"} · {timeAgo(thread.created_at)}
              </span>
              {thread.is_locked && (
                <span className="ml-auto text-[9px] font-bold text-navy-200">
                  🔒 Locked
                </span>
              )}
              {canDelete(thread.author_id) && (
                <button
                  onClick={() => setConfirmDeleteThread(true)}
                  className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-[11px] transition-colors bg-game-red/10 text-game-red border border-game-red/20 hover:bg-game-red/20"
                  title="Delete thread"
                >
                  🗑
                </button>
              )}
            </div>
            <h1 className="text-white font-black text-xl leading-snug mb-3">
              {thread.title}
            </h1>
            {thread.content && (
              <p className="text-sm leading-relaxed text-navy-100">
                {thread.content}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      <div className="space-y-2 mb-6">
        {replies.map((reply, i) => (
          <div
            key={reply.id}
            className="rounded-xl p-4 bg-navy-800 border border-navy-500 flex gap-3"
          >
            {/* Vote column */}
            <ForumVoteButton
              targetType="reply"
              targetId={reply.id}
              initialScore={reply.likes}
              userVote={myVotes.get(reply.id) ?? 0}
              canVote={canVote}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[9px] font-black text-navy-200">
                  #{i + 1}
                </span>
                <span className="text-[10px] font-bold text-navy-400">
                  {reply.author_name ?? "Anon"} · {timeAgo(reply.created_at)}
                </span>
                {canDelete(reply.author_id) && (
                  <button
                    onClick={() => setConfirmDeleteReply(reply.id)}
                    className="ml-auto w-6 h-6 flex items-center justify-center rounded-md text-[10px] transition-colors bg-game-red/10 text-game-red border border-game-red/20 hover:bg-game-red/20"
                    title="Delete reply"
                  >
                    🗑
                  </button>
                )}
              </div>
              {reply.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={reply.image_url}
                  alt=""
                  className="w-full max-h-60 object-cover rounded-lg mb-2"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <p className="text-sm leading-relaxed text-navy-100">
                {reply.content}
              </p>
            </div>
          </div>
        ))}
        {replies.length === 0 && (
          <p className="text-center py-6 text-xs font-bold text-navy-400">
            No replies yet — be the first
          </p>
        )}
      </div>

      {/* Reply box */}
      {!thread.is_locked && (perms.canCommentForum || isImpersonating) && (
        <div className="game-card rounded-2xl p-4 space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-navy-200">
            Reply
          </p>
          <textarea
            placeholder="Write your reply…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={3}
            className="game-input text-sm resize-none"
          />
          <input
            type="text"
            placeholder="Image URL (optional)"
            value={replyImage}
            onChange={(e) => setReplyImage(e.target.value)}
            className="game-input text-sm"
          />
          <div className="flex justify-end">
            <button
              onClick={postReply}
              disabled={posting || !replyText.trim()}
              className="btn-accent px-6 py-2 rounded-xl text-sm font-black disabled:opacity-50"
            >
              {posting ? "Posting…" : "Post Reply"}
            </button>
          </div>
        </div>
      )}

      {!perms.canCommentForum && !isImpersonating && (
        <div className="rounded-xl px-4 py-3 text-xs font-bold text-center bg-navy-800 border border-navy-500 text-navy-200">
          <Link
            href="/profile"
            className="hover:text-white transition-colors"
            style={{ color: "var(--accent)" }}
          >
            Sign in
          </Link>{" "}
          as a member to leave a reply
        </div>
      )}

      {thread.is_locked && (
        <div className="rounded-xl px-4 py-3 text-xs font-bold text-center bg-navy-800 border border-navy-500 text-navy-200">
          🔒 This thread is locked
        </div>
      )}

      {/* Delete thread modal */}
      {confirmDeleteThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }} onClick={() => setConfirmDeleteThread(false)}>
          <div className="w-80 rounded-2xl p-6 space-y-4 bg-navy-800 border border-game-red/30" onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-black text-base">Delete this thread?</p>
            <p className="text-sm leading-snug text-navy-200">This will also delete all replies. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDeleteThread(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-navy-200 hover:text-white transition-colors">Cancel</button>
              <button onClick={deleteThread} disabled={deletingId === thread.id} className="px-4 py-2 rounded-xl text-sm font-black disabled:opacity-50 transition-colors bg-game-red text-white">
                {deletingId === thread.id ? "Deleting\u2026" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete reply modal */}
      {confirmDeleteReply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }} onClick={() => setConfirmDeleteReply(null)}>
          <div className="w-80 rounded-2xl p-6 space-y-4 bg-navy-800 border border-game-red/30" onClick={(e) => e.stopPropagation()}>
            <p className="text-white font-black text-base">Delete this reply?</p>
            <p className="text-sm leading-snug text-navy-200">This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDeleteReply(null)} className="px-4 py-2 rounded-xl text-sm font-bold text-navy-200 hover:text-white transition-colors">Cancel</button>
              <button onClick={() => deleteReply(confirmDeleteReply)} disabled={deletingId === confirmDeleteReply} className="px-4 py-2 rounded-xl text-sm font-black disabled:opacity-50 transition-colors bg-game-red text-white">
                {deletingId === confirmDeleteReply ? "Deleting\u2026" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
