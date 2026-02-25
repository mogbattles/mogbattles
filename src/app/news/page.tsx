"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { usePermissions } from "@/context/AuthContext";

interface NewsPost {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  published_at: string;
  is_published: boolean;
}

type ConfirmDelete = { id: string; title: string } | null;

function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NewsPage() {
  const perms = usePermissions();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin: add news form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", image_url: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    db()
      .from("news_posts")
      .select("id, title, content, image_url, published_at, is_published")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .then(({ data }) => {
        setPosts((data ?? []) as NewsPost[]);
        setLoading(false);
      });
  }, []);

  async function deletePost(id: string) {
    setDeleting(true);
    const { error } = await db().from("news_posts").delete().eq("id", id);
    setDeleting(false);
    setConfirmDelete(null);
    if (error) {
      setMsg("❌ " + (error as { message: string }).message);
      setTimeout(() => setMsg(null), 3000);
    } else {
      setPosts((prev) => prev.filter((p) => p.id !== id));
    }
  }

  async function publishNews() {
    if (!form.title.trim()) return;
    setSaving(true);
    const { error } = await db()
      .from("news_posts")
      .insert({ title: form.title.trim(), content: form.content.trim() || null, image_url: form.image_url.trim() || null, is_published: true });
    setSaving(false);
    if (error) {
      setMsg("❌ " + (error as { message: string }).message);
    } else {
      setMsg("✅ Published!");
      setForm({ title: "", content: "", image_url: "" });
      setShowForm(false);
      // Re-fetch
      db().from("news_posts").select("id, title, content, image_url, published_at, is_published").eq("is_published", true).order("published_at", { ascending: false })
        .then(({ data }) => setPosts((data ?? []) as NewsPost[]));
    }
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            📰 <span>News</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Latest updates from the MogBattles team</p>
        </div>
        {perms.canManageNews && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs font-black px-4 py-2 rounded-xl transition-colors"
            style={{ background: "rgba(240,192,64,0.1)", color: "#F0C040", border: "1px solid rgba(240,192,64,0.2)" }}
          >
            {showForm ? "Cancel" : "＋ Post News"}
          </button>
        )}
      </div>

      {msg && (
        <div className="mb-4 px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "#141A2C", color: msg.startsWith("✅") ? "#22C55E" : "#EF4444" }}>
          {msg}
        </div>
      )}

      {/* Admin: post form */}
      {showForm && perms.canManageNews && (
        <div className="mb-6 rounded-2xl p-5 space-y-3" style={{ background: "#0D1120", border: "1px solid rgba(240,192,64,0.2)" }}>
          <p className="text-xs font-black uppercase tracking-widest" style={{ color: "#F0C040" }}>New Post</p>
          <input
            type="text"
            placeholder="Headline *"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-500"
          />
          <textarea
            placeholder="Body text (optional)"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={4}
            className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-500 resize-none"
          />
          <input
            type="text"
            placeholder="Image URL (optional)"
            value={form.image_url}
            onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-yellow-500"
          />
          <div className="flex justify-end">
            <button
              onClick={publishNews}
              disabled={saving || !form.title.trim()}
              className="px-6 py-2 rounded-xl text-sm font-black disabled:opacity-50 transition-colors"
              style={{ background: "#F0C040", color: "#07090F" }}
            >
              {saving ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      )}

      {/* Posts */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl h-32 animate-pulse" style={{ background: "#111827" }} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-24">
          <div className="text-5xl mb-4">📰</div>
          <p className="text-zinc-400 font-semibold">No news yet</p>
          <p className="text-zinc-600 text-sm mt-1">Check back soon for updates from the team</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post, i) => (
            <article
              key={post.id}
              className="rounded-2xl overflow-hidden"
              style={{ background: "#0D1120", border: "1px solid #1B2338" }}
            >
              {post.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.image_url} alt="" className="w-full h-48 object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {i === 0 && (
                      <span
                        className="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-3"
                        style={{ background: "rgba(240,192,64,0.12)", color: "#F0C040", border: "1px solid rgba(240,192,64,0.2)" }}
                      >
                        Latest
                      </span>
                    )}
                    <h2 className="text-white font-black text-lg leading-snug mb-2">{post.title}</h2>
                    {post.content && (
                      <p className="text-sm leading-relaxed mb-3" style={{ color: "#4D6080" }}>
                        {post.content}
                      </p>
                    )}
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#253147" }}>
                      {timeAgo(post.published_at)}
                    </p>
                  </div>
                  {perms.canManageNews && (
                    <button
                      onClick={() => setConfirmDelete({ id: post.id, title: post.title })}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors"
                      style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}
                      title="Delete post"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-80 rounded-2xl p-6 space-y-4"
            style={{ background: "#0D1120", border: "1px solid rgba(239,68,68,0.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white font-black text-base">Delete this post?</p>
            <p className="text-sm leading-snug" style={{ color: "#4D6080" }}>
              &ldquo;{confirmDelete.title}&rdquo; will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold"
                style={{ color: "#3D5070" }}
              >
                Cancel
              </button>
              <button
                onClick={() => deletePost(confirmDelete.id)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-black disabled:opacity-50 transition-colors"
                style={{ background: "#EF4444", color: "#fff" }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
