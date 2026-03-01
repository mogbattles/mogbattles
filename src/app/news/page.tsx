"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth, usePermissions } from "@/context/AuthContext";

interface NewsPost {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  published_at: string;
  is_published: boolean;
  author_id: string | null;
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
  const { user } = useAuth();
  const perms = usePermissions();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);

  // Add / edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", image_url: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadPosts() {
    const { data } = await db()
      .from("news_posts")
      .select("id, title, content, image_url, published_at, is_published, author_id")
      .eq("is_published", true)
      .order("published_at", { ascending: false });
    setPosts((data ?? []) as NewsPost[]);
    setLoading(false);
  }

  useEffect(() => { loadPosts(); }, []);

  async function deletePost(id: string) {
    setDeleting(true);
    const { error } = await db().from("news_posts").delete().eq("id", id);
    setDeleting(false);
    setConfirmDelete(null);
    if (error) {
      setMsg("\u274C " + (error as { message: string }).message);
      setTimeout(() => setMsg(null), 3000);
    } else {
      setPosts((prev) => prev.filter((p) => p.id !== id));
    }
  }

  function resetForm() {
    setForm({ title: "", content: "", image_url: "" });
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(post: NewsPost) {
    setEditingId(post.id);
    setForm({
      title: post.title,
      content: post.content ?? "",
      image_url: post.image_url ?? "",
    });
    setShowForm(true);
  }

  async function publishNews() {
    if (!form.title.trim()) return;
    setSaving(true);

    if (editingId) {
      const { error } = await db()
        .from("news_posts")
        .update({
          title: form.title.trim(),
          content: form.content.trim() || null,
          image_url: form.image_url.trim() || null,
        })
        .eq("id", editingId);
      setSaving(false);
      if (error) {
        setMsg("\u274C " + (error as { message: string }).message);
      } else {
        setMsg("\u2705 Updated!");
        resetForm();
        loadPosts();
      }
    } else {
      const { error } = await db()
        .from("news_posts")
        .insert({
          title: form.title.trim(),
          content: form.content.trim() || null,
          image_url: form.image_url.trim() || null,
          is_published: true,
          author_id: user?.id ?? null,
        });
      setSaving(false);
      if (error) {
        setMsg("\u274C " + (error as { message: string }).message);
      } else {
        setMsg("\u2705 Published!");
        resetForm();
        loadPosts();
      }
    }
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-20 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📰</span>
            <h1 className="font-heading tracking-wide text-3xl text-gradient-gold">
              News
            </h1>
          </div>
          <p className="text-xs font-bold text-navy-200">Latest updates from the MogBattles team</p>
        </div>
        {perms.canManageNews && (
          <button
            onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}
            className="btn-dark text-xs font-black px-4 py-2 rounded-xl"
          >
            {showForm ? "Cancel" : "\uFF0B Post News"}
          </button>
        )}
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2 rounded-xl text-sm font-bold bg-navy-700 ${msg.startsWith("\u2705") ? "text-game-green" : "text-game-red"}`}>
          {msg}
        </div>
      )}

      {/* Post / Edit form */}
      {showForm && perms.canManageNews && (
        <div className="mb-6 game-card rounded-2xl p-5 space-y-3 !border-purple/25">
          <p className="text-xs font-black uppercase tracking-widest text-purple-bright">
            {editingId ? "Edit Post" : "New Post"}
          </p>
          <input
            type="text"
            placeholder="Headline *"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="game-input text-sm"
          />
          <textarea
            placeholder="Body text (optional)"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={4}
            className="game-input text-sm resize-none"
          />
          <input
            type="text"
            placeholder="Image URL (optional)"
            value={form.image_url}
            onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
            className="game-input text-sm"
          />
          <div className="flex justify-end">
            <button
              onClick={publishNews}
              disabled={saving || !form.title.trim()}
              className="btn-purple px-6 py-2 rounded-xl text-sm font-black disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving\u2026" : editingId ? "Save Changes" : "Publish"}
            </button>
          </div>
        </div>
      )}

      {/* Posts */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl h-32 animate-pulse bg-navy-800" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-24">
          <div className="text-5xl mb-4 opacity-30">📰</div>
          <p className="font-black text-navy-200">No news yet</p>
          <p className="text-sm mt-1 text-navy-400">Check back soon for updates from the team</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post, i) => (
            <article
              key={post.id}
              className="rounded-2xl overflow-hidden game-card"
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
                      <span className="badge-purple !text-[9px] mb-3 inline-block">
                        Latest
                      </span>
                    )}
                    <h2 className="text-white font-black text-lg leading-snug mb-2">{post.title}</h2>
                    {post.content && (
                      <p className="text-sm leading-relaxed mb-3 text-navy-200">
                        {post.content}
                      </p>
                    )}
                    <p className="text-[10px] font-bold uppercase tracking-widest text-navy-400">
                      {timeAgo(post.published_at)}
                    </p>
                  </div>
                  {perms.canManageNews && (
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => startEdit(post)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors bg-purple/10 text-purple-bright border border-purple/20 hover:bg-purple/20"
                        title="Edit post"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => setConfirmDelete({ id: post.id, title: post.title })}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors bg-game-red/10 text-game-red border border-game-red/20 hover:bg-game-red/20"
                        title="Delete post"
                      >
                        🗑
                      </button>
                    </div>
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
            className="w-80 rounded-2xl p-6 space-y-4 bg-navy-800 border border-game-red/30"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white font-black text-base">Delete this post?</p>
            <p className="text-sm leading-snug text-navy-200">
              &ldquo;{confirmDelete.title}&rdquo; will be permanently removed. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-navy-200 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deletePost(confirmDelete.id)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-black disabled:opacity-50 transition-colors bg-game-red text-white"
              >
                {deleting ? "Deleting\u2026" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
