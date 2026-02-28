"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { usePermissions } from "@/context/AuthContext";

interface Article {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  published_at: string;
  slug: string;
  author_display: string | null;
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

export default function ArticlesPage() {
  const perms = usePermissions();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  // Write form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", image_url: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    db()
      .from("articles")
      .select("id, title, content, image_url, published_at, slug, author_display")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .then(({ data }) => {
        setArticles((data ?? []) as Article[]);
        setLoading(false);
      });
  }, []);

  async function publishArticle() {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    const slug = slugify(form.title);
    const { error } = await db()
      .from("articles")
      .insert({
        title: form.title.trim(),
        content: form.content.trim(),
        image_url: form.image_url.trim() || null,
        slug,
        is_published: true,
      });
    setSaving(false);
    if (error) {
      setMsg("❌ " + (error as { message: string }).message);
    } else {
      setMsg("✅ Article published!");
      setForm({ title: "", content: "", image_url: "" });
      setShowForm(false);
      db().from("articles").select("id, title, content, image_url, published_at, slug, author_display")
        .eq("is_published", true).order("published_at", { ascending: false })
        .then(({ data }) => setArticles((data ?? []) as Article[]));
    }
    setTimeout(() => setMsg(null), 3000);
  }

  const preview = (text: string | null, max = 160) =>
    text ? (text.length > max ? text.slice(0, max) + "…" : text) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-20 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📝</span>
            <h1 className="font-heading tracking-wide text-3xl text-gradient-purple">
              Articles
            </h1>
          </div>
          <p className="text-xs font-bold text-navy-200">In-depth pieces by moderators &amp; admins</p>
        </div>
        {perms.canWriteArticles && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-dark text-xs font-black px-4 py-2 rounded-xl"
          >
            {showForm ? "Cancel" : "✍️ Write Article"}
          </button>
        )}
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-2 rounded-xl text-sm font-bold bg-navy-700 ${msg.startsWith("✅") ? "text-game-green" : "text-game-red"}`}>
          {msg}
        </div>
      )}

      {/* Write form */}
      {showForm && perms.canWriteArticles && (
        <div className="mb-6 game-card rounded-2xl p-5 space-y-3 !border-purple/25">
          <p className="text-xs font-black uppercase tracking-widest text-purple-bright">New Article</p>
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
              className="btn-purple px-6 py-2 rounded-xl text-sm font-black disabled:opacity-50"
            >
              {saving ? "Publishing…" : "Publish Article"}
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
            <Link
              key={article.id}
              href={`/articles/${article.slug}`}
              className="block rounded-2xl overflow-hidden game-card transition-all duration-200 hover:border-purple/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.06)]"
            >
              <div className="flex gap-4 p-4">
                {article.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={article.image_url} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div className="min-w-0">
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
          ))}
        </div>
      )}
    </div>
  );
}
