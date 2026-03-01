"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { usePermissions } from "@/context/AuthContext";

interface ContentBlock {
  key: string;
  content: string;
}

const ABOUT_KEYS = ["about_hero", "about_body", "about_team", "about_footer"];

const DEFAULT_CONTENT: Record<string, string> = {
  about_hero: "The internet's #1 arena for face-to-face comparisons, powered by ELO.",
  about_body: `MogBattles is a community-driven platform where real faces compete in anonymous, ELO-rated battles across multiple arenas — Actors, Athletes, Looksmaxxers, PSL Icons, and more.

Every vote matters. Every match updates the leaderboard. Over time, a consensus emerges: who actually mogs who.

We built this because the internet argues about it constantly — now there's a way to settle it with data.`,
  about_team: "Built by a small team of developers and designers who spend too much time on forums.",
  about_footer: "MogBattles — Two faces. One winner. You decide.",
};

function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function AboutPage() {
  const perms = usePermissions();
  const [content, setContent] = useState<Record<string, string>>(DEFAULT_CONTENT);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(DEFAULT_CONTENT);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    db()
      .from("site_content")
      .select("key, content")
      .in("key", ABOUT_KEYS)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const map: Record<string, string> = { ...DEFAULT_CONTENT };
        (data as ContentBlock[]).forEach((row) => { map[row.key] = row.content; });
        setContent(map);
        setDraft(map);
      });
  }, []);

  async function saveContent() {
    setSaving(true);
    const upserts = ABOUT_KEYS.map((key) => ({ key, content: draft[key] ?? "" }));
    const { error } = await db().from("site_content").upsert(upserts, { onConflict: "key" });
    setSaving(false);
    if (error) {
      setMsg("❌ " + (error as { message: string }).message);
    } else {
      setContent({ ...draft });
      setEditing(false);
      setMsg("✅ Saved!");
    }
    setTimeout(() => setMsg(null), 3000);
  }

  const c = editing ? draft : content;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Admin toolbar */}
      {perms.canEditAbout && (
        <div className="flex items-center justify-between mb-6">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>
            ✏️ Admin: editing about page
          </span>
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs font-bold" style={{ color: msg.startsWith("✅") ? "#22C55E" : "#EF4444" }}>{msg}</span>}
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setDraft(content); }}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: "var(--text-muted)" }}
                >
                  Cancel
                </button>
                <button onClick={saveContent} disabled={saving}
                  className="text-xs font-black px-4 py-1.5 rounded-lg disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "var(--bg-primary)" }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)}
                className="text-xs font-black px-4 py-1.5 rounded-lg"
                style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                Edit Page
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="text-center mb-12">
        <div
          className="text-6xl mb-6 leading-none"
          style={{ filter: "drop-shadow(0 0 20px rgba(128,128,128,0.2))" }}
        >
          ⚔️
        </div>
        <h1
          className="text-4xl sm:text-5xl font-black tracking-tight mb-4"
          style={{
            color: "var(--text-primary)",
          }}
        >
          MOGBATTLES
        </h1>
        {editing ? (
          <textarea value={draft.about_hero} onChange={(e) => setDraft((d) => ({ ...d, about_hero: e.target.value }))}
            className="w-full rounded-xl px-4 py-3 text-base text-center text-[color:var(--text-primary)] focus:outline-none resize-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            rows={2}
          />
        ) : (
          <p className="text-base font-semibold leading-relaxed" style={{ color: "var(--text-muted)" }}>{c.about_hero}</p>
        )}
      </div>

      {/* Body */}
      <div className="mb-10">
        <h2 className="text-lg font-black text-[color:var(--text-primary)] mb-4">What is MogBattles?</h2>
        {editing ? (
          <textarea value={draft.about_body} onChange={(e) => setDraft((d) => ({ ...d, about_body: e.target.value }))}
            className="w-full rounded-xl px-4 py-3 text-sm text-[color:var(--text-primary)] focus:outline-none resize-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            rows={8}
          />
        ) : (
          <div className="space-y-4">
            {c.about_body.split("\n\n").map((para, i) => (
              <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{para}</p>
            ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="mb-10">
        <h2 className="text-lg font-black text-[color:var(--text-primary)] mb-4">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: "⚔️", title: "Pick your arena", desc: "Actors, athletes, looksmaxxers, PSL icons — choose who you want to judge." },
            { icon: "🗳️", title: "Vote on matchups", desc: "Two faces. You pick who mogs. Every vote counts toward the ELO rating." },
            { icon: "🏆", title: "Leaderboard rises", desc: "After enough votes, a clear ranking emerges. Science, basically." },
          ].map((step) => (
            <div key={step.title} className="rounded-2xl p-4 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="text-3xl mb-2">{step.icon}</div>
              <p className="text-[color:var(--text-primary)] font-black text-sm mb-1">{step.title}</p>
              <p className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* User tiers */}
      <div className="mb-10">
        <h2 className="text-lg font-black text-[color:var(--text-primary)] mb-4">Community tiers</h2>
        <div className="space-y-2">
          {[
            { badge: "👤", label: "Guest", desc: "Browse arenas and read the leaderboard. Sign in to vote." },
            { badge: "✅", label: "Member", desc: "Email-verified account (Google or email link). Vote in battles, comment on forums, create custom arenas." },
            { badge: "🏟️", label: "Arena Participant", desc: "Member who has uploaded at least one photo to their profile. Can post forum threads." },
            { badge: "⭐", label: "Premium", desc: "No ads, weekly ELO boosts, advanced analytics and exclusive perks." },
            { badge: "🛡️", label: "Moderator", desc: "Community-approved. Can approve custom profiles into the ELO economy and publish articles." },
            { badge: "🔧", label: "Admin", desc: "Developer-level access. Full control over content, news, users, and the platform." },
          ].map((tier) => (
            <div key={tier.label} className="flex items-start gap-3 rounded-xl p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <span className="text-xl shrink-0">{tier.badge}</span>
              <div>
                <p className="text-[color:var(--text-primary)] font-black text-sm">{tier.label}</p>
                <p className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{tier.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Team */}
      <div className="mb-10">
        <h2 className="text-lg font-black text-[color:var(--text-primary)] mb-4">The team</h2>
        {editing ? (
          <textarea value={draft.about_team} onChange={(e) => setDraft((d) => ({ ...d, about_team: e.target.value }))}
            className="w-full rounded-xl px-4 py-3 text-sm text-[color:var(--text-primary)] focus:outline-none resize-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            rows={3}
          />
        ) : (
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{c.about_team}</p>
        )}
      </div>

      {/* Footer tagline */}
      <div className="text-center pt-6 border-t" style={{ borderColor: "var(--border)" }}>
        {editing ? (
          <input type="text" value={draft.about_footer} onChange={(e) => setDraft((d) => ({ ...d, about_footer: e.target.value }))}
            className="w-full text-center rounded-xl px-4 py-3 text-sm text-[color:var(--text-primary)] focus:outline-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          />
        ) : (
          <p className="text-sm font-bold italic" style={{ color: "var(--text-faint)" }}>{c.about_footer}</p>
        )}
      </div>
    </div>
  );
}
