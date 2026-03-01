"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth, usePermissions } from "@/context/AuthContext";

interface Article {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  published_at: string;
  slug: string;
  author_display: string | null;
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
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)
    + "-" + Math.random().toString(36).slice(2, 6);
}

const FIELDS = "id, title, content, image_url, published_at, slug, author_display, author_id";

export default function ArticlesPage() {
  const { user } = useAuth();
  const perms = usePermissions();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  // Write / edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", image_url: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadArticles() {
    const { data } = await db()
      .from("articles")
      .select(FIELDS)
      .eq("is_published", true)
      .order("published_at", { ascending: false });
    setArticles((data ?? []) as Article[]);
    setLoading(false);
  }

  useEffect(() => { loadArticles(); }, []);

  async function publishArticle() {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);

    if (editingId) {
      // Update existing
      const { error } = await db()
        .from("articles")
        .update({
          title: form.title.trim(),
          content: form.content.trim(),
          image_url: form.image_url.trim() || null,
        })
        .eq("id", editingId);
      setSaving(false);
      if (error) {
        setMsg("\u274C " + (error as { message: string }).message);
      } else {
        setMsg("\u2705 Article updated!");
        resetForm();
        loadArticles();
      }
    } else {
      // Insert new
      const slug = slugify(form.title);
      const { error } = await db()
        .from("articles")
        .insert({
          title: form.title.trim(),
          content: form.content.trim(),
          image_url: form.image_url.trim() || null,
          slug,
          is_published: true,
          author_id: user?.id ?? null,
        });
      setSaving(false);
      if (error) {
        setMsg("\u274C " + (error as { message: string }).message);
      } else {
        setMsg("\u2705 Article published!");
        resetForm();
        loadArticles();
      }
    }
    setTimeout(() => setMsg(null), 3000);
  }

  function resetForm() {
    setForm({ title: "", content: "", image_url: "" });
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(article: Article) {
    setEditingId(article.id);
    setForm({
      title: article.title,
      content: article.content ?? "",
      image_url: article.image_url ?? "",
    });
    setShowForm(true);
  }

  async function deleteArticle(id: string) {
    setDeleting(true);
    const { error } = await db().from("articles").delete().eq("id", id);
    setDeleting(false);
    setConfirmDelete(null);
    if (error) {
      setMsg("\u274C " + (error as { message: string }).message);
      setTimeout(() => setMsg(null), 3000);
    } else {
      setArticles((prev) => prev.filter((a) => a.id !== id));
    }
  }

  // Can this user edit/delete this article?
  // Admin: always. Mod: only if author is NOT admin.
  // RLS enforces this server-side; client just hides buttons accordingly.
  function canManageArticle(article: Article): boolean {
    if (perms.isAdmin) return true;
    if (perms.isModerator) return true; // RLS will block admin-authored
    return false;
  }

  const preview = (text: string | null, max = 160) =>
    text ? (text.length > max ? text.slice(0, max) + "\u2026" : text) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-20 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📝</span>
            <h1 className="font-heading tracking-wide text-3xl text-gradient-gold">
              Articles
            </h1>
          </div>
          <p className="text-xs font-bold text-navy-200">In-depth pieces by moderators &amp; admins</p>
        </div>
        {perms.canWriteArticles && (
          <button
            onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}
            className="btn-dark text-xs font-black px-4 py-2 rounded-xl"
          >
            {showForm ? "Cancel" : "\u270D\uFE0F Write Article"}
          </button>
        )}
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2 rounded-xl text-sm font-bold bg-navy-700 ${msg.startsWith("\u2705") ? "text-game-green" : "text-game-red"}`}>
          {msg}
        </div>
      )}

      {/* Write / Edit form */}
      {showForm && perms.canWriteArticles && (
        <div className="mb-6 game-card rounded-2xl p-5 space-y-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--accent)" }}>
            {editingId ? "Edit Article" : "New Article"}
          </p>
          <input type="text" placeholder="Title *" value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="game-input text-sm"
          />
          <textarea placeholder="Article body *" value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            rows={8}
            className="game-input text-sm resize-none"
          />
          <input type="text" placeholder="Cover image URL (optional)" value={form.image_url}
            onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
            className="game-input text-sm"
          />
          <div className="flex justify-end">
            <button onClick={publishArticle} disabled={saving || !form.title.trim() || !form.content.trim()}
              className="btn-accent px-6 py-2 rounded-xl text-sm font-black disabled:opacity-50"
            >
              {saving ? "Saving\u2026" : editingId ? "Save Changes" : "Publish Article"}
            </button>
          </div>
        </div>
      )}

      {/* Article list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl h-28 animate-pulse bg-navy-800" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-24">
          <div className="text-5xl mb-4 opacity-30">📝</div>
          <p className="font-black text-navy-200">No articles yet</p>
          {perms.canWriteArticles && (
            <p className="text-sm mt-1 text-navy-400">Be the first to write one</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {articles.map((article) => (
            <div key={article.id} className="relative rounded-2xl overflow-hidden game-card transition-all duration-200 hover:border-navy-300 hover:shadow-[0_0_20px_rgba(0,0,0,0.2)]">
              <Link href={`/articles/${article.slug}`} className="block">
                <div className="flex gap-4 p-4">
                  {article.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.image_url} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-white font-black text-base leading-snug mb-1 line-clamp-2">{article.title}</h2>
                    {preview(article.content) && (
                      <p className="text-xs leading-relaxed line-clamp-2 mb-2 text-navy-200">
                        {preview(article.content)}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wide text-navy-400">
                      {article.author_display && <span>{article.author_display}</span>}
                      <span>{timeAgo(article.published_at)}</span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* Edit / Delete buttons for mods + admins */}
              {canManageArticle(article) && (
                <div className="absolute top-3 right-3 flex gap-1.5 z-10">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); startEdit(article); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[11px] transition-colors"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete({ id: article.id, title: article.title }); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[11px] transition-colors bg-game-red/10 text-game-red border border-game-red/20 hover:bg-game-red/20"
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>
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
            <p className="text-white font-black text-base">Delete this article?</p>
            <p className="text-sm leading-snug text-navy-200">
              &ldquo;{confirmDelete.title}&rdquo; will be permanently removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-navy-200 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteArticle(confirmDelete.id)}
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
