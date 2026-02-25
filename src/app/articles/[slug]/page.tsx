"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

interface Article {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  published_at: string;
  author_display: string | null;
}

function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    db()
      .from("articles")
      .select("id, title, content, image_url, published_at, author_display")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle()
      .then(({ data }) => {
        setArticle(data as Article | null);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="h-8 rounded-xl animate-pulse" style={{ background: "#111827" }} />
        <div className="h-64 rounded-2xl animate-pulse" style={{ background: "#111827" }} />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 text-center">
        <div className="text-5xl mb-4">📝</div>
        <p className="text-zinc-400 font-semibold">Article not found</p>
        <Link href="/articles" className="text-xs font-bold mt-4 inline-block" style={{ color: "#4D9FFF" }}>
          ← Back to Articles
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/articles" className="inline-flex items-center gap-1 text-xs font-bold mb-6 transition-colors" style={{ color: "#3D5070" }}>
        ← Articles
      </Link>

      {article.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.image_url} alt="" className="w-full h-56 object-cover rounded-2xl mb-6"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}

      <h1 className="text-3xl font-black text-white leading-snug mb-3">{article.title}</h1>

      <div className="flex items-center gap-3 mb-8 text-xs font-bold" style={{ color: "#3D5070" }}>
        {article.author_display && <span>By {article.author_display}</span>}
        <span>{new Date(article.published_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
      </div>

      {article.content && (
        <div className="space-y-4">
          {article.content.split("\n\n").map((para, i) => (
            <p key={i} className="text-base leading-relaxed" style={{ color: "#8096B0" }}>{para}</p>
          ))}
        </div>
      )}

      <div className="mt-12 pt-6 border-t" style={{ borderColor: "#1B2338" }}>
        <Link href="/articles" className="text-xs font-bold transition-colors" style={{ color: "#4D9FFF" }}>
          ← More Articles
        </Link>
      </div>
    </div>
  );
}
