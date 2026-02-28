"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth, usePermissions, useImpersonation } from "@/context/AuthContext";

interface Thread {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
  is_locked: boolean;
  author_name: string | null;
}

interface Reply {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  likes: number;
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
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const { user } = useAuth();
  const perms = usePermissions();
  const { isImpersonating, profile: impProfile } = useImpersonation();

  const [thread, setThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [replyImage, setReplyImage] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!threadId) return;
    Promise.all([
      db().from("forum_threads").select("id, title, content, image_url, created_at, is_locked, author_name").eq("id", threadId).single(),
      db().from("forum_replies").select("id, content, image_url, created_at, likes, author_name").eq("thread_id", threadId).order("created_at"),
    ]).then(([{ data: t }, { data: r }]) => {
      setThread(t as Thread | null);
      setReplies((r ?? []) as Reply[]);
      setLoading(false);
    });
  }, [threadId]);

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
      db().from("forum_replies").select("id, content, image_url, created_at, likes, author_name")
        .eq("thread_id", thread.id).order("created_at")
        .then(({ data }) => setReplies((data ?? []) as Reply[]));
    }
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
        <Link href="/forum" className="text-xs font-bold mt-4 inline-block text-purple-bright hover:text-white transition-colors">← Back to Forum</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-20 pb-28">
      {/* Back link */}
      <Link href="/forum" className="inline-flex items-center gap-1 text-xs font-bold mb-5 transition-colors text-navy-200 hover:text-white">
        ← Forum
      </Link>

      {/* OP post */}
      <div className="rounded-2xl overflow-hidden mb-4 game-card !border-purple/20">
        {thread.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thread.image_url} alt="" className="w-full max-h-80 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="badge-purple !text-[9px]">OP</span>
            <span className="text-[10px] font-bold text-navy-400">
              {thread.author_name ?? "Anon"} · {timeAgo(thread.created_at)}
            </span>
            {thread.is_locked && (
              <span className="ml-auto text-[9px] font-bold text-navy-200">🔒 Locked</span>
            )}
          </div>
          <h1 className="text-white font-black text-xl leading-snug mb-3">{thread.title}</h1>
          {thread.content && (
            <p className="text-sm leading-relaxed text-navy-100">{thread.content}</p>
          )}
        </div>
      </div>

      {/* Replies */}
      <div className="space-y-2 mb-6">
        {replies.map((reply, i) => (
          <div
            key={reply.id}
            className="rounded-xl p-4 bg-navy-800 border border-navy-500"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-black text-navy-200">#{i + 1}</span>
              <span className="text-[10px] font-bold text-navy-400">
                {reply.author_name ?? "Anon"} · {timeAgo(reply.created_at)}
              </span>
              <span className="ml-auto text-[10px] font-bold text-navy-400">
                ❤️ {reply.likes}
              </span>
            </div>
            {reply.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reply.image_url} alt="" className="w-full max-h-60 object-cover rounded-lg mb-2"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <p className="text-sm leading-relaxed text-navy-100">{reply.content}</p>
          </div>
        ))}
        {replies.length === 0 && (
          <p className="text-center py-6 text-xs font-bold text-navy-400">No replies yet — be the first</p>
        )}
      </div>

      {/* Reply box */}
      {!thread.is_locked && (perms.canCommentForum || isImpersonating) && (
        <div className="game-card rounded-2xl p-4 space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-navy-200">Reply</p>
          <textarea
            placeholder="Write your reply…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={3}
            className="game-input text-sm resize-none"
          />
          <input type="text" placeholder="Image URL (optional)" value={replyImage}
            onChange={(e) => setReplyImage(e.target.value)}
            className="game-input text-sm"
          />
          <div className="flex justify-end">
            <button onClick={postReply} disabled={posting || !replyText.trim()}
              className="btn-purple px-6 py-2 rounded-xl text-sm font-black disabled:opacity-50"
            >
              {posting ? "Posting…" : "Post Reply"}
            </button>
          </div>
        </div>
      )}

      {!perms.canCommentForum && (
        <div className="rounded-xl px-4 py-3 text-xs font-bold text-center bg-navy-800 border border-navy-500 text-navy-200">
          <Link href="/profile" className="text-purple-bright hover:text-white transition-colors">Sign in</Link> as a member to leave a reply
        </div>
      )}

      {thread.is_locked && (
        <div className="rounded-xl px-4 py-3 text-xs font-bold text-center bg-navy-800 border border-navy-500 text-navy-200">
          🔒 This thread is locked
        </div>
      )}
    </div>
  );
}
