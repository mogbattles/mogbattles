"use client";

import { useEffect, useState, useRef, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import { createBrowserClient } from "@supabase/ssr";
import { getFeaturedBattles, upsertFeaturedBattle, searchProfiles, type FeaturedBattle } from "@/lib/arenas";
import { useAuth, usePermissions } from "@/context/AuthContext";
import { getAllCategories, createCategory, updateCategory, deleteCategory } from "@/lib/categories";
import type { CategoryRow } from "@/lib/supabase";

type Category =
  | "actors"
  | "looksmaxxers"
  | "psl_icons"
  | "singers"
  | "athletes"
  | "streamers"
  | "politicians"
  | "political_commentators"
  | "models"
  | null;

interface Profile {
  id: string;
  name: string;
  image_url: string | null;
  image_urls: string[];
  wikipedia_slug: string | null;
  category: Category;
  categories: string[];
  elo_rating: number;
  height_in: number | null;
  weight_lbs: number | null;
  country: string | null;
  user_id: string | null;
  is_test_profile: boolean;
}

interface WikiSummary {
  thumbnail?: { source: string };
  originalimage?: { source: string };
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: null,                     label: "— Uncategorized —" },
  { value: "actors",                 label: "Actors" },
  { value: "looksmaxxers",           label: "Looksmaxxers" },
  { value: "psl_icons",              label: "PSL Icons" },
  { value: "singers",                label: "Singers" },
  { value: "athletes",               label: "Athletes" },
  { value: "streamers",              label: "Streamers & Influencers" },
  { value: "politicians",            label: "Politicians" },
  { value: "political_commentators", label: "Political Commentators" },
  { value: "models",                 label: "Models" },
];

const MAX_IMAGES = 4;

// ─── CategoryMultiSelect ──────────────────────────────────────────────────────
// Uses a fixed-position portal so the dropdown escapes overflow:hidden cards.
function CategoryMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (cats: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, minWidth: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const id = useId();

  // Close when clicking outside either the button or the portal dropdown
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        dropRef.current && !dropRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label =
    value.length === 0
      ? "— None —"
      : value.length === 1
      ? CATEGORIES.find((c) => c.value === value[0])?.label ?? value[0]
      : `${value.length} categories`;

  function toggle(cat: string) {
    if (value.includes(cat)) {
      onChange(value.filter((c) => c !== cat));
    } else {
      onChange([...value, cat]);
    }
  }

  function openDropdown() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: Math.max(rect.width, 190),
      });
    }
    setOpen(true);
  }

  return (
    <div className="relative" id={id}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5 hover:border-orange-500 text-left min-w-[140px] flex items-center justify-between gap-2 focus:outline-none"
      >
        <span className="truncate">{label}</span>
        <span className="text-zinc-500 shrink-0">{open ? "▲" : "▾"}</span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropRef}
            className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-1.5"
            style={{
              position: "fixed",
              top: dropPos.top,
              left: dropPos.left,
              minWidth: dropPos.minWidth,
              zIndex: 9999,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {CATEGORIES.filter((c) => c.value !== null).map((c) => {
              const checked = value.includes(c.value!);
              return (
                <label
                  key={String(c.value)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(c.value!)}
                    className="accent-orange-500 w-3.5 h-3.5 shrink-0"
                  />
                  <span className="text-zinc-300 text-xs">{c.label}</span>
                </label>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

// ─── Height helpers ───────────────────────────────────────────────────────────
function inchesToDisplay(totalIn: number | null): string {
  if (!totalIn) return "";
  const ft = Math.floor(totalIn / 12);
  const ins = totalIn % 12;
  return `${ft}'${ins}"`;
}

function parseHeightInput(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  // "6'2"" or "6'2"
  const m = s.match(/^(\d+)[''`](\d+)["""]?$/);
  if (m) return parseInt(m[1]) * 12 + parseInt(m[2]);
  // plain number → treat as inches if >= 48, else as feet
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return n >= 48 ? Math.round(n) : Math.round(n * 12);
}

// ─── CSV Import helpers ───────────────────────────────────────────────────────
const CATEGORY_LOOKUP: Record<string, string> = {
  actor: "actors", actors: "actors",
  looksmaxxer: "looksmaxxers", looksmaxxers: "looksmaxxers",
  "psl icon": "psl_icons", "psl icons": "psl_icons", psl_icons: "psl_icons", psl: "psl_icons",
  singer: "singers", singers: "singers",
  athlete: "athletes", athletes: "athletes",
  streamer: "streamers", streamers: "streamers",
  influencer: "streamers",
  "streamer & influencer": "streamers",
  "streamers & influencers": "streamers",
  politician: "politicians", politicians: "politicians",
  "political commentator": "political_commentators",
  "political commentators": "political_commentators",
  political_commentators: "political_commentators",
  model: "models", models: "models",
};

function normalizeCategories(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[|,]/)
    .map((s) => CATEGORY_LOOKUP[s.toLowerCase().trim()])
    .filter(Boolean) as string[];
}

/** Legacy single-value helper (kept for any remaining usages) */
function normalizeCategory(raw: string): string | null {
  return CATEGORY_LOOKUP[raw.toLowerCase().trim()] ?? null;
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

interface CSVRow {
  name: string;
  categories: string[];
  height_in: number | null;
  weight_lbs: number | null;
  country: string | null;
  imageUrls: string[];
}

function parseCSV(text: string): CSVRow[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const startIdx =
    lines[0] && parseCSVLine(lines[0])[0]?.toLowerCase().includes("name") ? 1 : 0;
  return lines.slice(startIdx).flatMap((line) => {
    const [name, cat, height, weight, country, ...urls] = parseCSVLine(line);
    if (!name?.trim()) return [];
    return [{
      name: name.trim(),
      categories: normalizeCategories(cat ?? ""),
      height_in: parseHeightInput(height ?? ""),
      weight_lbs: parseFloat(weight ?? "") || null,
      country: country?.trim() || null,
      imageUrls: urls.filter(Boolean),
    }];
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

export default function AdminPage() {
  const { loading: authLoading, refreshPermissions } = useAuth();
  const perms = usePermissions();
  const [refreshing, setRefreshing] = useState(false);

  // Re-fetch permissions once when the admin page mounts, in case the role
  // was granted after the last auth state change (e.g. manually via SQL).
  useEffect(() => {
    refreshPermissions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [imageInputs, setImageInputs] = useState<Record<string, string[]>>({});
  const [slugInputs, setSlugInputs] = useState<Record<string, string>>({});
  // Per-profile stats inputs
  const [statsInputs, setStatsInputs] = useState<Record<string, { height: string; weight: string; country: string }>>({});
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchingSlot, setFetchingSlot] = useState<number | null>(null);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Add profile form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategories, setNewCategories] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [adding, setAdding] = useState(false);

  // ELO manipulation inputs (per profile)
  const [eloInputs, setEloInputs] = useState<Record<string, string>>({});
  const [savingElo, setSavingElo] = useState<string | null>(null);

  // ELO sync fix
  const [fixingEloSync, setFixingEloSync] = useState(false);

  // Seeded users panel
  const [showSeedForm, setShowSeedForm] = useState(false);
  const [seedName, setSeedName] = useState("");
  const [seedImageUrl, setSeedImageUrl] = useState("");
  const [seedElo, setSeedElo] = useState("1200");
  const [seedGender, setSeedGender] = useState<"male" | "female" | "">("");
  const [seeding, setSeeding] = useState(false);
  const seedFormRef = useRef<HTMLDivElement>(null);

  // Arena IDs for seeded user stats (fetched once)
  const [allArenaId, setAllArenaId] = useState<string | null>(null);
  const [membersArenaId, setMembersArenaId] = useState<string | null>(null);

  // CSV Import state
  const [showImport, setShowImport] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CSVRow[]>([]);
  const [importing, setImporting] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);

  // Featured battles state
  const [featuredBattles, setFeaturedBattles] = useState<FeaturedBattle[]>([]);
  const [featuredSaving, setFeaturedSaving] = useState<"battle_of_day" | "upcoming" | null>(null);
  const [featuredMsg, setFeaturedMsg] = useState<string | null>(null);
  // Form state: profile_a_id, profile_b_id, label for each type
  const [bodForm, setBodForm] = useState({ profile_a_id: "", profile_b_id: "", label: "" });
  const [upcomingForm, setUpcomingForm] = useState({ profile_a_id: "", profile_b_id: "", label: "" });
  // Profile search for featured battles picker
  const [bodSearchA, setBodSearchA] = useState("");
  const [bodSearchB, setBodSearchB] = useState("");
  const [upSearchA, setUpSearchA] = useState("");
  const [upSearchB, setUpSearchB] = useState("");
  type ProfileHit = { id: string; name: string; image_url: string | null; category: string | null };
  const [bodResultsA, setBodResultsA] = useState<ProfileHit[]>([]);
  const [bodResultsB, setBodResultsB] = useState<ProfileHit[]>([]);
  const [upResultsA, setUpResultsA] = useState<ProfileHit[]>([]);
  const [upResultsB, setUpResultsB] = useState<ProfileHit[]>([]);

  // Arena thumbnails management
  type OfficialArena = { id: string; name: string; slug: string; thumbnail_url: string | null };
  const [officialArenas, setOfficialArenas] = useState<OfficialArena[]>([]);
  const [arenaThumbnailInputs, setArenaThumbnailInputs] = useState<Record<string, string>>({});
  const [savingArenaThumbnail, setSavingArenaThumbnail] = useState<string | null>(null);
  const [arenaThumbnailMsg, setArenaThumbnailMsg] = useState<string | null>(null);

  // Category management
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null);
  const [catName, setCatName] = useState("");
  const [catSlug, setCatSlug] = useState("");
  const [catIcon, setCatIcon] = useState("");
  const [catDescription, setCatDescription] = useState("");
  const [catParentId, setCatParentId] = useState<string | null>(null);
  const [catSortOrder, setCatSortOrder] = useState("0");
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryMsg, setCategoryMsg] = useState<string | null>(null);

  // Arena management (all arenas)
  type AdminArena = { id: string; name: string; slug: string; description: string | null; is_official: boolean; is_verified: boolean; category: string | null; category_id: string | null; visibility: string; arena_type: string; creator_id: string | null; thumbnail_url: string | null; created_at: string };
  const [allArenas, setAllArenas] = useState<AdminArena[]>([]);
  const [arenaFilter, setArenaFilter] = useState<"all" | "official" | "custom">("all");
  const [arenaSearch, setArenaSearch] = useState("");
  const [editingArena, setEditingArena] = useState<string | null>(null);
  const [arenaEdits, setArenaEdits] = useState<Record<string, Partial<AdminArena>>>({});
  const [savingArena, setSavingArena] = useState<string | null>(null);
  const [arenaMsg, setArenaMsg] = useState<string | null>(null);

  const supabase = useDb();
  const addFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("name");
      const profs = (data ?? []) as Profile[];
      setProfiles(profs);

      const imgs: Record<string, string[]> = {};
      const slugs: Record<string, string> = {};
      const stats: Record<string, { height: string; weight: string; country: string }> = {};
      const elos: Record<string, string> = {};

      profs.forEach((p) => {
        const urls = p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : [];
        imgs[p.id] = [...urls, ...Array(MAX_IMAGES - urls.length).fill("")].slice(0, MAX_IMAGES);
        slugs[p.id] = p.wikipedia_slug ?? "";
        stats[p.id] = {
          height: p.height_in ? inchesToDisplay(p.height_in) : "",
          weight: p.weight_lbs?.toString() ?? "",
          country: p.country ?? "",
        };
        elos[p.id] = p.elo_rating.toString();
        // Backfill categories from single category if needed
        if (!p.categories || p.categories.length === 0) {
          p.categories = p.category ? [p.category] : [];
        }
      });
      setImageInputs(imgs);
      setSlugInputs(slugs);
      setStatsInputs(stats);
      setEloInputs(elos);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch arena IDs for seeded user stats ────────────────────────────────────
  useEffect(() => {
    async function fetchArenaIds() {
      const { data } = await supabase
        .from("arenas")
        .select("id, slug")
        .in("slug", ["all", "members"]);
      if (data) {
        const rows = data as { id: string; slug: string }[];
        setAllArenaId(rows.find((a) => a.slug === "all")?.id ?? null);
        setMembersArenaId(rows.find((a) => a.slug === "members")?.id ?? null);
      }
    }
    fetchArenaIds();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load official arenas for thumbnail management ────────────────────────────
  useEffect(() => {
    async function loadOfficialArenas() {
      const { data } = await supabase
        .from("arenas")
        .select("id, name, slug, thumbnail_url")
        .eq("is_official", true)
        .order("created_at", { ascending: true });
      if (data) {
        const arenas = data as OfficialArena[];
        setOfficialArenas(arenas);
        const inputs: Record<string, string> = {};
        arenas.forEach((a) => { inputs[a.id] = a.thumbnail_url ?? ""; });
        setArenaThumbnailInputs(inputs);
      }
    }
    loadOfficialArenas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load categories ────────────────────────────────────────────────────────
  useEffect(() => {
    getAllCategories().then(setCategories);
  }, []);

  // ── Load all arenas for management ────────────────────────────────────────
  useEffect(() => {
    async function loadAllArenas() {
      const { data } = await supabase
        .from("arenas")
        .select("id, name, slug, description, is_official, is_verified, category, category_id, visibility, arena_type, creator_id, thumbnail_url, created_at")
        .order("is_official", { ascending: false })
        .order("created_at", { ascending: true });
      if (data) setAllArenas(data as AdminArena[]);
    }
    loadAllArenas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load featured battles ─────────────────────────────────────────────────────
  useEffect(() => {
    getFeaturedBattles().then((battles) => {
      setFeaturedBattles(battles);
      const bod = battles.find((b) => b.type === "battle_of_day");
      const up  = battles.find((b) => b.type === "upcoming");
      if (bod) {
        setBodForm({
          profile_a_id: bod.profile_a?.id ?? "",
          profile_b_id: bod.profile_b?.id ?? "",
          label: bod.label ?? "",
        });
        if (bod.profile_a) setBodSearchA(bod.profile_a.name);
        if (bod.profile_b) setBodSearchB(bod.profile_b.name);
      }
      if (up) {
        setUpcomingForm({
          profile_a_id: up.profile_a?.id ?? "",
          profile_b_id: up.profile_b?.id ?? "",
          label: up.label ?? "",
        });
        if (up.profile_a) setUpSearchA(up.profile_a.name);
        if (up.profile_b) setUpSearchB(up.profile_b.name);
      }
    });
  }, []);

  // ── Search profiles for featured battle picker ────────────────────────────────
  async function searchForFeatured(query: string, setter: (r: ProfileHit[]) => void) {
    if (!query.trim()) { setter([]); return; }
    const results = await searchProfiles(query, 6);
    setter(results as ProfileHit[]);
  }

  // ── Save featured battle ──────────────────────────────────────────────────────
  async function saveFeatured(type: "battle_of_day" | "upcoming") {
    const form = type === "battle_of_day" ? bodForm : upcomingForm;
    setFeaturedSaving(type);
    const { error } = await upsertFeaturedBattle({
      type,
      profile_a_id: form.profile_a_id || null,
      profile_b_id: form.profile_b_id || null,
      label: form.label.trim() || null,
      is_active: true,
    });
    setFeaturedSaving(null);
    if (error) {
      setFeaturedMsg(`❌ ${error}`);
    } else {
      setFeaturedMsg(`✅ ${type === "battle_of_day" ? "Battle of the Day" : "Coming Up"} saved.`);
      // Refresh
      getFeaturedBattles().then(setFeaturedBattles);
    }
    setTimeout(() => setFeaturedMsg(null), 3000);
  }

  // ── Save arena thumbnail ────────────────────────────────────────────────────
  async function saveArenaThumbnail(arenaId: string) {
    setSavingArenaThumbnail(arenaId);
    const url = (arenaThumbnailInputs[arenaId] ?? "").trim() || null;
    const { error } = await supabase
      .from("arenas")
      .update({ thumbnail_url: url })
      .eq("id", arenaId);
    setSavingArenaThumbnail(null);
    if (error) {
      setArenaThumbnailMsg(`❌ ${(error as { message: string }).message}`);
    } else {
      setArenaThumbnailMsg("✅ Thumbnail saved");
      // Update local state
      setOfficialArenas((prev) =>
        prev.map((a) => a.id === arenaId ? { ...a, thumbnail_url: url } : a)
      );
    }
    setTimeout(() => setArenaThumbnailMsg(null), 3000);
  }

  async function saveAllArenaThumbnails() {
    setSavingArenaThumbnail("all");
    let errors = 0;
    for (const arena of officialArenas) {
      const url = (arenaThumbnailInputs[arena.id] ?? "").trim() || null;
      if (url !== (arena.thumbnail_url ?? "")) {
        const { error } = await supabase
          .from("arenas")
          .update({ thumbnail_url: url })
          .eq("id", arena.id);
        if (error) errors++;
        else {
          setOfficialArenas((prev) =>
            prev.map((a) => a.id === arena.id ? { ...a, thumbnail_url: url } : a)
          );
        }
      }
    }
    setSavingArenaThumbnail(null);
    setArenaThumbnailMsg(errors ? `❌ ${errors} failed` : "✅ All thumbnails saved");
    setTimeout(() => setArenaThumbnailMsg(null), 3000);
  }

  // ── Category CRUD ──────────────────────────────────────────────────────────
  function resetCategoryForm() {
    setCatName(""); setCatSlug(""); setCatIcon(""); setCatDescription("");
    setCatParentId(null); setCatSortOrder("0");
    setEditingCategory(null); setShowCategoryForm(false);
  }

  function startEditCategory(cat: CategoryRow) {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatSlug(cat.slug);
    setCatIcon(cat.icon ?? "");
    setCatDescription(cat.description ?? "");
    setCatParentId(cat.parent_id);
    setCatSortOrder(String(cat.sort_order));
    setShowCategoryForm(true);
  }

  async function handleSaveCategory() {
    if (!catName.trim() || !catSlug.trim()) {
      setCategoryMsg("Name and slug are required.");
      setTimeout(() => setCategoryMsg(null), 3000);
      return;
    }
    setSavingCategory(true);
    if (editingCategory) {
      const { error } = await updateCategory(editingCategory.id, {
        name: catName.trim(),
        slug: catSlug.trim(),
        icon: catIcon.trim() || null,
        description: catDescription.trim() || null,
        parent_id: catParentId,
        sort_order: parseInt(catSortOrder) || 0,
      });
      setCategoryMsg(error ? `Error: ${error}` : "Category updated");
    } else {
      const { error } = await createCategory({
        name: catName.trim(),
        slug: catSlug.trim(),
        icon: catIcon.trim() || null,
        description: catDescription.trim() || null,
        parent_id: catParentId,
        sort_order: parseInt(catSortOrder) || 0,
      });
      setCategoryMsg(error ? `Error: ${error}` : "Category created");
    }
    setSavingCategory(false);
    resetCategoryForm();
    getAllCategories().then(setCategories); // Refresh
    setTimeout(() => setCategoryMsg(null), 3000);
  }

  async function handleDeleteCategory(id: string) {
    const { error } = await deleteCategory(id);
    setCategoryMsg(error ? `Error: ${error}` : "Category deactivated");
    getAllCategories().then(setCategories);
    setTimeout(() => setCategoryMsg(null), 3000);
  }

  // ── Arena management helpers ──────────────────────────────────────────────
  function getArenaEdit(arenaId: string): Partial<AdminArena> {
    return arenaEdits[arenaId] ?? {};
  }

  function setArenaEdit(arenaId: string, field: string, value: string | boolean | null) {
    setArenaEdits((prev) => ({
      ...prev,
      [arenaId]: { ...prev[arenaId], [field]: value },
    }));
  }

  async function saveArenaEdits(arenaId: string) {
    const edits = arenaEdits[arenaId];
    if (!edits || Object.keys(edits).length === 0) return;
    setSavingArena(arenaId);

    const updatePayload: Record<string, unknown> = {};
    if (edits.name !== undefined) updatePayload.name = edits.name;
    if (edits.description !== undefined) updatePayload.description = edits.description || null;
    if (edits.thumbnail_url !== undefined) updatePayload.thumbnail_url = edits.thumbnail_url || null;
    if (edits.is_official !== undefined) updatePayload.is_official = edits.is_official;
    if (edits.is_verified !== undefined) updatePayload.is_verified = edits.is_verified;
    if (edits.category_id !== undefined) updatePayload.category_id = edits.category_id || null;
    if (edits.visibility !== undefined) updatePayload.visibility = edits.visibility;

    const { error } = await supabase
      .from("arenas")
      .update(updatePayload)
      .eq("id", arenaId);

    setSavingArena(null);
    if (error) {
      setArenaMsg(`Error: ${(error as { message: string }).message}`);
    } else {
      setArenaMsg("Arena saved");
      setAllArenas((prev) =>
        prev.map((a) => a.id === arenaId ? { ...a, ...updatePayload } as AdminArena : a)
      );
      setArenaEdits((prev) => { const n = { ...prev }; delete n[arenaId]; return n; });
      setEditingArena(null);
    }
    setTimeout(() => setArenaMsg(null), 3000);
  }

  const filteredArenas = allArenas.filter((a) => {
    if (arenaFilter === "official" && !a.is_official) return false;
    if (arenaFilter === "custom" && a.is_official) return false;
    if (arenaSearch.trim()) {
      const q = arenaSearch.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q);
    }
    return true;
  });

  // ── Wikipedia fetch ──────────────────────────────────────────────────────────
  async function fetchWikiImage(slug: string): Promise<string | null> {
    if (!slug.trim()) return null;
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug.trim())}`
    );
    if (!res.ok) return null;
    const data: WikiSummary = await res.json();
    return data.originalimage?.source ?? data.thumbnail?.source ?? null;
  }

  // ── Save images ──────────────────────────────────────────────────────────────
  async function saveImages(profileId: string) {
    const urls = (imageInputs[profileId] ?? []).map((u) => u.trim()).filter(Boolean);
    const primary = urls[0] ?? null;
    const { error } = await supabase
      .from("profiles")
      .update({ image_urls: urls, image_url: primary })
      .eq("id", profileId);
    if (!error) {
      setProfiles((prev) =>
        prev.map((p) => p.id === profileId ? { ...p, image_urls: urls, image_url: primary } : p)
      );
      setMessage("✅ Images saved.");
    } else {
      setMessage(`❌ ${(error as { message: string }).message}`);
    }
  }

  // ── Save stats (height / weight / country) ───────────────────────────────────
  async function saveStats(profileId: string) {
    const s = statsInputs[profileId] ?? { height: "", weight: "", country: "" };
    const height_in = parseHeightInput(s.height);
    const weight_lbs = parseFloat(s.weight) || null;
    const country = s.country.trim() || null;
    const { error } = await supabase
      .from("profiles")
      .update({ height_in, weight_lbs, country })
      .eq("id", profileId);
    if (!error) {
      setProfiles((prev) =>
        prev.map((p) => p.id === profileId ? { ...p, height_in, weight_lbs, country } : p)
      );
      setMessage("✅ Stats saved.");
    } else {
      setMessage(`❌ ${(error as { message: string }).message}`);
    }
  }

  // ── Fetch wiki into slot ─────────────────────────────────────────────────────
  async function handleFetchSlot(profileId: string, slot: number) {
    const slug = slugInputs[profileId] ?? "";
    if (!slug.trim()) { setMessage("Enter a Wikipedia slug first."); return; }
    setFetchingId(profileId);
    setFetchingSlot(slot);
    setMessage(null);
    const imageUrl = await fetchWikiImage(slug);
    if (!imageUrl) {
      setMessage(`❌ No image found for "${slug}".`);
    } else {
      const updated = [...(imageInputs[profileId] ?? ["", "", "", ""])];
      updated[slot] = imageUrl;
      setImageInputs((prev) => ({ ...prev, [profileId]: updated }));
      const urls = updated.map((u) => u.trim()).filter(Boolean);
      const primary = urls[0] ?? null;
      await supabase
        .from("profiles")
        .update({ image_urls: urls, image_url: primary, wikipedia_slug: slug.trim() })
        .eq("id", profileId);
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === profileId ? { ...p, image_urls: urls, image_url: primary, wikipedia_slug: slug.trim() } : p
        )
      );
      setMessage("✅ Image fetched and saved.");
    }
    setFetchingId(null);
    setFetchingSlot(null);
  }

  // ── Fetch all missing ────────────────────────────────────────────────────────
  async function handleFetchAll() {
    setFetchingAll(true);
    setMessage("Fetching all missing images…");
    let updated = 0; let failed = 0;
    const toFetch = profiles.filter((p) => p.wikipedia_slug && !p.image_url);
    for (const profile of toFetch) {
      const imageUrl = await fetchWikiImage(profile.wikipedia_slug!);
      if (imageUrl) {
        const urls = [imageUrl];
        await supabase.from("profiles").update({ image_urls: urls, image_url: imageUrl }).eq("id", profile.id);
        setProfiles((prev) => prev.map((p) => p.id === profile.id ? { ...p, image_url: imageUrl, image_urls: urls } : p));
        setImageInputs((prev) => {
          const ex = prev[profile.id] ?? ["", "", "", ""];
          ex[0] = imageUrl;
          return { ...prev, [profile.id]: ex };
        });
        updated++;
      } else { failed++; }
      await new Promise((r) => setTimeout(r, 300));
    }
    setMessage(`✅ Done — ${updated} updated, ${failed} failed.`);
    setFetchingAll(false);
  }

  // ── Categories change (multi-select) ─────────────────────────────────────────
  async function handleCategoriesChange(profileId: string, cats: string[]) {
    const category = (cats[0] ?? null) as Category;
    const { error } = await supabase
      .from("profiles")
      .update({ categories: cats, category })
      .eq("id", profileId);
    if (!error)
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === profileId ? { ...p, categories: cats, category } : p
        )
      );
  }

  // ── Slug save on blur ────────────────────────────────────────────────────────
  async function handleSlugSave(profileId: string) {
    const slug = (slugInputs[profileId] ?? "").trim();
    await supabase.from("profiles").update({ wikipedia_slug: slug || null }).eq("id", profileId);
    setProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, wikipedia_slug: slug || null } : p));
  }

  // ── Delete profile ───────────────────────────────────────────────────────────
  async function handleDelete(profileId: string) {
    setDeletingId(profileId);
    const { error } = await supabase.rpc("delete_profile", { p_id: profileId });
    if (!error) {
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
      setMessage("🗑 Profile deleted.");
    } else {
      setMessage(`❌ ${(error as { message: string }).message}`);
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  }

  // ── Add new profile ──────────────────────────────────────────────────────────
  async function handleAddProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setMessage(null);
    const imageUrls = newImageUrl.trim() ? [newImageUrl.trim()] : [];
    const cat = (newCategories[0] ?? null) as Category;
    const { data, error } = await supabase
      .from("profiles")
      .insert({
        name: newName.trim(),
        category: cat,
        categories: newCategories,
        image_url: imageUrls[0] ?? null,
        image_urls: imageUrls,
        elo_rating: 1200,
        total_wins: 0,
        total_losses: 0,
        total_matches: 0,
      })
      .select()
      .single();
    if (error) {
      setMessage(`❌ ${(error as { message: string }).message}`);
    } else {
      const newProfile = data as Profile;
      if (!newProfile.categories || newProfile.categories.length === 0) {
        newProfile.categories = newProfile.category ? [newProfile.category] : [];
      }
      setProfiles((prev) => [newProfile, ...prev]);
      setImageInputs((prev) => ({ ...prev, [newProfile.id]: [...imageUrls, ...Array(MAX_IMAGES - imageUrls.length).fill("")].slice(0, MAX_IMAGES) }));
      setSlugInputs((prev) => ({ ...prev, [newProfile.id]: "" }));
      setStatsInputs((prev) => ({ ...prev, [newProfile.id]: { height: "", weight: "", country: "" } }));
      setNewName(""); setNewCategories([]); setNewImageUrl("");
      setShowAddForm(false);
      setMessage(`✅ "${newProfile.name}" added.`);
    }
    setAdding(false);
  }

  // ── Add seeded (fake) user ───────────────────────────────────────────────────
  // Seeded users get user_id (non-null → appear in All Players) + is_test_profile=true
  // (the hidden algorithm tag that identifies them as seeded calibration profiles)
  async function handleAddSeededUser(e: React.FormEvent) {
    e.preventDefault();
    if (!seedName.trim()) return;
    setSeeding(true);
    setMessage(null);

    const imageUrls = seedImageUrl.trim() ? [seedImageUrl.trim()] : [];
    const eloRating = Math.max(100, Math.min(9999, parseInt(seedElo) || 1200));

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        name: seedName.trim(),
        categories: [],
        category: null,
        image_url: imageUrls[0] ?? null,
        image_urls: imageUrls,
        elo_rating: eloRating,
        total_wins: 0,
        total_losses: 0,
        total_matches: 0,
        // non-null user_id → qualifies for "All Players" (members) arena
        user_id: crypto.randomUUID(),
        // is_test_profile = true is the hidden algorithm tag:
        // when real new users first open "All" arena, the algorithm knows
        // these are calibration profiles, not organic users
        is_test_profile: true,
        gender: seedGender || null,
      })
      .select()
      .single();

    if (error) {
      setMessage(`❌ ${(error as { message: string }).message}`);
      setSeeding(false);
      return;
    }

    const newProfile = data as Profile;
    newProfile.categories = [];

    // Insert arena_profile_stats so they appear in leaderboards immediately
    const statsRows = [];
    if (allArenaId)    statsRows.push({ arena_id: allArenaId,    profile_id: newProfile.id, elo_rating: eloRating, wins: 0, losses: 0, matches: 0 });
    if (membersArenaId) statsRows.push({ arena_id: membersArenaId, profile_id: newProfile.id, elo_rating: eloRating, wins: 0, losses: 0, matches: 0 });
    let statsWarning: string | null = null;
    if (statsRows.length > 0) {
      const { error: statsErr } = await supabase
        .from("arena_profile_stats")
        .upsert(statsRows, { onConflict: "arena_id,profile_id" });
      if (statsErr) {
        statsWarning = `⚠️ Profile created but arena stats insert failed: ${(statsErr as { message: string }).message}. Add RLS policy for arena_profile_stats inserts.`;
      }
    }

    setProfiles((prev) => [newProfile, ...prev]);
    setImageInputs((prev) => ({
      ...prev,
      [newProfile.id]: [...imageUrls, ...Array(MAX_IMAGES - imageUrls.length).fill("")].slice(0, MAX_IMAGES),
    }));
    setSlugInputs((prev) => ({ ...prev, [newProfile.id]: "" }));
    setStatsInputs((prev) => ({ ...prev, [newProfile.id]: { height: "", weight: "", country: "" } }));
    setEloInputs((prev) => ({ ...prev, [newProfile.id]: eloRating.toString() }));

    setSeedName(""); setSeedImageUrl(""); setSeedElo("1200"); setSeedGender("");
    setShowSeedForm(false);
    setMessage(statsWarning ?? `✅ Seeded user "${newProfile.name}" created (ELO: ${eloRating}, tag: is_test_profile=true).`);
    setSeeding(false);
  }

  // ── ELO override: set ELO across all arenas for a profile ────────────────────
  // After setting all arena stats, run admin_fix_elo_sync to recalculate the
  // "all" arena from scratch.  This prevents trigger-cascade corruption where
  // each category-arena update piles deltas onto "all".
  async function handleSaveElo(profileId: string) {
    const newElo = Math.max(100, Math.min(9999, parseInt(eloInputs[profileId] ?? "1200") || 1200));
    setSavingElo(profileId);
    setMessage(null);

    // 1. Update profiles table directly
    const { error: profErr } = await supabase
      .from("profiles")
      .update({ elo_rating: newElo })
      .eq("id", profileId);

    if (profErr) {
      setMessage(`❌ ${(profErr as { message: string }).message}`);
      setSavingElo(null);
      return;
    }

    // 2. Update all arena_profile_stats rows (triggers will fire and may corrupt "all" arena)
    const { error: statsErr } = await supabase
      .from("arena_profile_stats")
      .update({ elo_rating: newElo })
      .eq("profile_id", profileId);

    if (statsErr) {
      setMessage(`⚠️ Profile ELO updated but arena stats failed: ${(statsErr as { message: string }).message}`);
      setSavingElo(null);
      return;
    }

    // 3. Recalculate "all" arena from scratch to fix trigger cascade damage
    const { error: syncErr } = await supabase.rpc("admin_fix_elo_sync");

    setProfiles((prev) => prev.map((p) => p.id === profileId ? { ...p, elo_rating: newElo } : p));
    setEloInputs((prev) => ({ ...prev, [profileId]: newElo.toString() }));
    setMessage(
      syncErr
        ? `⚠️ ELO set to ${newElo} but sync repair failed: ${(syncErr as { message: string }).message}`
        : `✅ ELO set to ${newElo} (all arenas) + sync repaired.`
    );
    setSavingElo(null);
  }

  // ── Fix ELO Sync (calls admin_fix_elo_sync RPC) ──────────────────────────────
  async function handleFixEloSync() {
    setFixingEloSync(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("admin_fix_elo_sync");
    if (error) {
      setMessage(`❌ ELO Sync failed: ${(error as { message: string }).message}`);
    } else {
      setMessage(`✅ ${data ?? "ELO sync complete."}`);
    }
    setFixingEloSync(false);
  }

  // ── CSV File Handler ─────────────────────────────────────────────────────────
  const handleCSVFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvPreview(parseCSV(text));
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const handleImportCSV = useCallback(async () => {
    if (csvPreview.length === 0) return;
    setImporting(true);
    setMessage(null);
    const rows = csvPreview.map((row) => ({
      name: row.name,
      categories: row.categories,
      category: row.categories[0] ?? null,
      height_in: row.height_in,
      weight_lbs: row.weight_lbs,
      country: row.country,
      image_url: row.imageUrls[0] ?? null,
      image_urls: row.imageUrls,
      elo_rating: 1200,
      total_wins: 0,
      total_losses: 0,
      total_matches: 0,
    }));
    let success = 0;
    let failed = 0;
    let firstError: string | null = null;
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const results = await Promise.allSettled(
        batch.map((row) => supabase.from("profiles").insert(row))
      );
      results.forEach((r) => {
        if (r.status === "fulfilled" && !r.value.error) {
          success++;
        } else {
          failed++;
          if (!firstError) {
            firstError =
              r.status === "rejected"
                ? String(r.reason)
                : (r.value.error as { message: string }).message;
          }
        }
      });
    }

    // Reload profiles list
    const { data: fresh } = await supabase.from("profiles").select("*").order("name");
    if (fresh) {
      const profs = fresh as Profile[];
      setProfiles(profs);
      const imgs: Record<string, string[]> = {};
      const slugs: Record<string, string> = {};
      const stats: Record<string, { height: string; weight: string; country: string }> = {};
      const elos: Record<string, string> = {};
      profs.forEach((p) => {
        const urls = p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : [];
        imgs[p.id] = [...urls, ...Array(MAX_IMAGES - urls.length).fill("")].slice(0, MAX_IMAGES);
        slugs[p.id] = p.wikipedia_slug ?? "";
        stats[p.id] = { height: p.height_in ? inchesToDisplay(p.height_in) : "", weight: p.weight_lbs?.toString() ?? "", country: p.country ?? "" };
        elos[p.id] = p.elo_rating.toString();
        if (!p.categories || p.categories.length === 0) {
          p.categories = p.category ? [p.category] : [];
        }
      });
      setImageInputs(imgs);
      setSlugInputs(slugs);
      setStatsInputs(stats);
      setEloInputs(elos);
    }

    const resultMsg =
      failed === 0
        ? `✅ Imported ${success} profiles successfully.`
        : success === 0
        ? `❌ All ${failed} rows failed to import.${firstError ? ` Error: ${firstError}` : ""}`
        : `⚠️ Imported ${success}, failed ${failed}.${firstError ? ` First error: ${firstError}` : ""}`;

    // Show result in the top-level banner (always visible, even after panel closes)
    setMessage(resultMsg);
    setCsvPreview([]);
    setImporting(false);
    // Only auto-close on full success; keep panel open on failure so user can see error
    if (failed === 0) setShowImport(false);
  }, [csvPreview, supabase]);

  // Wait for auth to resolve before showing gate
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-zinc-400 animate-pulse">Checking permissions…</div>
      </div>
    );
  }

  if (!perms.canAccessAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center px-4">
        <div className="text-5xl">🔒</div>
        <p className="text-white font-black text-xl">Admin Only</p>
        <p className="text-zinc-500 text-sm max-w-xs">
          You need the <span className="text-yellow-400 font-bold">admin</span> role to access this panel.
        </p>
        <button
          onClick={async () => {
            setRefreshing(true);
            await refreshPermissions();
            setRefreshing(false);
          }}
          disabled={refreshing}
          className="mt-2 px-5 py-2 rounded-xl text-sm font-black disabled:opacity-50 transition-colors"
          style={{ background: "rgba(240,192,64,0.1)", color: "#F0C040", border: "1px solid rgba(240,192,64,0.25)" }}
        >
          {refreshing ? "Checking…" : "🔄 Refresh Permissions"}
        </button>
        <p className="text-zinc-700 text-xs">If you just had a role granted, click above or sign out and back in.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-zinc-400 animate-pulse">Loading admin…</div>
      </div>
    );
  }

  const missingImages = profiles.filter((p) => p.wikipedia_slug && !p.image_url).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-white">🔧 Admin Panel</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {profiles.length} profiles · {profiles.filter((p) => p.image_url).length} with images
          </p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          {missingImages > 0 && (
            <button
              onClick={handleFetchAll}
              disabled={fetchingAll}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
            >
              {fetchingAll ? "Fetching…" : `Fetch All Missing (${missingImages})`}
            </button>
          )}
          <button
            onClick={handleFixEloSync}
            disabled={fixingEloSync}
            title="Recalculate All-arena ELO from scratch using category arena deltas"
            className="border font-bold text-sm px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
            style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.30)", color: "#86EFAC" }}
          >
            {fixingEloSync ? "Fixing…" : "🔁 Fix ELO Sync"}
          </button>
          <button
            onClick={() => { setShowImport((v) => !v); setCsvPreview([]); setMessage(null); }}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            📥 Import CSV
          </button>
          <button
            onClick={() => {
              setShowSeedForm((v) => !v);
              setShowAddForm(false);
              setTimeout(() => seedFormRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
            }}
            className="border font-bold text-sm px-4 py-2 rounded-xl transition-colors"
            style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.35)", color: "#A5B4FC" }}
          >
            🤖 Add Seeded User
          </button>
          <button
            onClick={() => {
              setShowAddForm((v) => !v);
              setShowSeedForm(false);
              setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
            }}
            className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            ➕ Add Person
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="mb-4 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-300">
          {message}
        </div>
      )}

      {/* ── Featured Battles Panel ───────────────────────────────────────────── */}
      <div className="mb-6 bg-zinc-900 border border-yellow-500/20 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">⚔️ Featured Battles</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Set the homepage "Battle of the Day" and "Coming Up" cards</p>
          </div>
          {featuredMsg && (
            <span className="text-xs font-bold" style={{ color: featuredMsg.startsWith("✅") ? "#22C55E" : "#EF4444" }}>
              {featuredMsg}
            </span>
          )}
        </div>

        {/* Battle of the Day */}
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
          <p className="text-yellow-400 text-xs font-black uppercase tracking-widest">⚔️ Battle of the Day</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Profile A */}
            <div className="relative">
              <label className="block text-zinc-500 text-xs mb-1">Person A</label>
              <input
                type="text"
                value={bodSearchA}
                placeholder="Search person…"
                onChange={(e) => {
                  setBodSearchA(e.target.value);
                  setBodForm((f) => ({ ...f, profile_a_id: "" }));
                  searchForFeatured(e.target.value, setBodResultsA);
                }}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-yellow-500"
              />
              {bodResultsA.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
                  {bodResultsA.map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => { setBodForm((f) => ({ ...f, profile_a_id: p.id })); setBodSearchA(p.name); setBodResultsA([]); }}
                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-800 text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.image_url && <img src={p.image_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />}
                      <span className="text-zinc-300 text-xs truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {bodForm.profile_a_id && <p className="text-[10px] text-green-500 mt-1">✓ Selected</p>}
            </div>
            {/* Profile B */}
            <div className="relative">
              <label className="block text-zinc-500 text-xs mb-1">Person B</label>
              <input
                type="text"
                value={bodSearchB}
                placeholder="Search person…"
                onChange={(e) => {
                  setBodSearchB(e.target.value);
                  setBodForm((f) => ({ ...f, profile_b_id: "" }));
                  searchForFeatured(e.target.value, setBodResultsB);
                }}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-yellow-500"
              />
              {bodResultsB.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
                  {bodResultsB.map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => { setBodForm((f) => ({ ...f, profile_b_id: p.id })); setBodSearchB(p.name); setBodResultsB([]); }}
                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-800 text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.image_url && <img src={p.image_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />}
                      <span className="text-zinc-300 text-xs truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {bodForm.profile_b_id && <p className="text-[10px] text-green-500 mt-1">✓ Selected</p>}
            </div>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-zinc-500 text-xs mb-1">Label (optional tagline)</label>
              <input type="text" placeholder="e.g. Vote now!" value={bodForm.label}
                onChange={(e) => setBodForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-yellow-500"
              />
            </div>
            <button
              onClick={() => saveFeatured("battle_of_day")}
              disabled={featuredSaving === "battle_of_day"}
              className="shrink-0 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black text-xs font-black px-4 py-2 rounded-lg transition-colors"
            >
              {featuredSaving === "battle_of_day" ? "Saving…" : "Save"}
            </button>
          </div>
          {/* Preview of current */}
          {(featuredBattles.find((b) => b.type === "battle_of_day")?.profile_a ||
            featuredBattles.find((b) => b.type === "battle_of_day")?.profile_b) && (() => {
              const bod = featuredBattles.find((b) => b.type === "battle_of_day")!;
              return (
                <p className="text-zinc-600 text-[10px]">
                  Current: {bod.profile_a?.name ?? "—"} vs {bod.profile_b?.name ?? "—"}
                </p>
              );
            })()}
        </div>

        {/* Coming Up */}
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
          <p className="text-blue-400 text-xs font-black uppercase tracking-widest">📅 Coming Up</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <label className="block text-zinc-500 text-xs mb-1">Person A</label>
              <input type="text" value={upSearchA} placeholder="Search person…"
                onChange={(e) => {
                  setUpSearchA(e.target.value);
                  setUpcomingForm((f) => ({ ...f, profile_a_id: "" }));
                  searchForFeatured(e.target.value, setUpResultsA);
                }}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
              {upResultsA.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
                  {upResultsA.map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => { setUpcomingForm((f) => ({ ...f, profile_a_id: p.id })); setUpSearchA(p.name); setUpResultsA([]); }}
                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-800 text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.image_url && <img src={p.image_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />}
                      <span className="text-zinc-300 text-xs truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {upcomingForm.profile_a_id && <p className="text-[10px] text-green-500 mt-1">✓ Selected</p>}
            </div>
            <div className="relative">
              <label className="block text-zinc-500 text-xs mb-1">Person B</label>
              <input type="text" value={upSearchB} placeholder="Search person…"
                onChange={(e) => {
                  setUpSearchB(e.target.value);
                  setUpcomingForm((f) => ({ ...f, profile_b_id: "" }));
                  searchForFeatured(e.target.value, setUpResultsB);
                }}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
              {upResultsB.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
                  {upResultsB.map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => { setUpcomingForm((f) => ({ ...f, profile_b_id: p.id })); setUpSearchB(p.name); setUpResultsB([]); }}
                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-zinc-800 text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.image_url && <img src={p.image_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />}
                      <span className="text-zinc-300 text-xs truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {upcomingForm.profile_b_id && <p className="text-[10px] text-green-500 mt-1">✓ Selected</p>}
            </div>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-zinc-500 text-xs mb-1">Label (e.g. &quot;live in 2hrs!&quot;)</label>
              <input type="text" placeholder="live in 2hrs!" value={upcomingForm.label}
                onChange={(e) => setUpcomingForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={() => saveFeatured("upcoming")}
              disabled={featuredSaving === "upcoming"}
              className="shrink-0 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black px-4 py-2 rounded-lg transition-colors"
            >
              {featuredSaving === "upcoming" ? "Saving…" : "Save"}
            </button>
          </div>
          {(featuredBattles.find((b) => b.type === "upcoming")?.profile_a ||
            featuredBattles.find((b) => b.type === "upcoming")?.profile_b) && (() => {
              const up = featuredBattles.find((b) => b.type === "upcoming")!;
              return (
                <p className="text-zinc-600 text-[10px]">
                  Current: {up.profile_a?.name ?? "—"} vs {up.profile_b?.name ?? "—"}{up.label ? ` · ${up.label}` : ""}
                </p>
              );
            })()}
        </div>
      </div>

      {/* ── Arena Thumbnails Panel ──────────────────────────────────────────── */}
      <div className="mb-6 bg-zinc-900 border border-purple-500/20 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">🖼️ Arena Thumbnails</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Set cover images for official arenas (paste image URL)</p>
          </div>
          <div className="flex items-center gap-3">
            {arenaThumbnailMsg && (
              <span className="text-xs font-bold" style={{ color: arenaThumbnailMsg.startsWith("✅") ? "#22C55E" : "#EF4444" }}>
                {arenaThumbnailMsg}
              </span>
            )}
            <button
              onClick={saveAllArenaThumbnails}
              disabled={savingArenaThumbnail === "all"}
              className="shrink-0 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-black px-4 py-2 rounded-lg transition-colors"
            >
              {savingArenaThumbnail === "all" ? "Saving all…" : "Save All"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {officialArenas.map((arena) => (
            <div key={arena.id}
              className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{
                    ({
                      all: "\uD83C\uDF0D", members: "\uD83D\uDC65", actors: "\uD83C\uDFAC",
                      looksmaxxers: "\uD83D\uDC8E", "psl-icons": "\uD83D\uDC41",
                      singers: "\uD83C\uDFB5", athletes: "\uD83C\uDFC6",
                      streamers: "\uD83D\uDCFA", politicians: "\uD83C\uDFDB\uFE0F",
                      "political-commentators": "\uD83C\uDF99", models: "\uD83D\uDC57",
                    } as Record<string, string>)[arena.slug] ?? "\u2694\uFE0F"
                  }</span>
                  <span className="text-white text-sm font-bold">{arena.name}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: "#4A4A66", background: "#1A1A28" }}>{arena.slug}</span>
                </div>
                <button
                  onClick={() => saveArenaThumbnail(arena.id)}
                  disabled={savingArenaThumbnail === arena.id}
                  className="text-[10px] font-black px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                  style={{ background: "rgba(139,92,246,0.15)", color: "#A78BFA", border: "1px solid rgba(139,92,246,0.3)" }}
                >
                  {savingArenaThumbnail === arena.id ? "…" : "Save"}
                </button>
              </div>
              <input
                type="url"
                value={arenaThumbnailInputs[arena.id] ?? ""}
                onChange={(e) => setArenaThumbnailInputs((prev) => ({ ...prev, [arena.id]: e.target.value }))}
                placeholder="https://example.com/cover.jpg"
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
              />
              {/* Thumbnail preview */}
              {(arenaThumbnailInputs[arena.id] ?? "").trim() && (
                <div className="rounded-lg overflow-hidden" style={{ maxHeight: "80px", border: "1px solid #222" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={arenaThumbnailInputs[arena.id]}
                    alt={`${arena.name} thumbnail`}
                    className="w-full object-cover"
                    style={{ maxHeight: "80px" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Category Management Panel ─────────────────────────────────────────── */}
      <div className="mb-6 bg-zinc-900 border border-emerald-500/20 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">🗂️ Category Hierarchy</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Manage the category tree (Human → Actors, Athletes, etc.)</p>
          </div>
          <div className="flex items-center gap-3">
            {categoryMsg && (
              <span className="text-xs font-bold" style={{ color: categoryMsg.startsWith("Error") ? "#EF4444" : "#22C55E" }}>
                {categoryMsg}
              </span>
            )}
            <button onClick={() => { resetCategoryForm(); setShowCategoryForm(!showCategoryForm); }}
              className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-4 py-2 rounded-lg transition-colors">
              {showCategoryForm ? "Cancel" : "+ Add Category"}
            </button>
          </div>
        </div>

        {/* Add/Edit category form */}
        {showCategoryForm && (
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-white text-sm font-bold">{editingCategory ? `Edit: ${editingCategory.name}` : "New Category"}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Name *</label>
                <input type="text" value={catName}
                  onChange={(e) => { setCatName(e.target.value); if (!editingCategory) setCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")); }}
                  placeholder="e.g. Basketball Players"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Slug *</label>
                <input type="text" value={catSlug}
                  onChange={(e) => setCatSlug(e.target.value)}
                  placeholder="basketball-players"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Icon (emoji)</label>
                <input type="text" value={catIcon}
                  onChange={(e) => setCatIcon(e.target.value)}
                  placeholder="🏀"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Parent Category</label>
                <select value={catParentId ?? ""}
                  onChange={(e) => setCatParentId(e.target.value || null)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500">
                  <option value="">— Root (no parent) —</option>
                  {categories.filter((c) => c.is_active).map((c) => (
                    <option key={c.id} value={c.id}>
                      {"  ".repeat(c.depth)}{c.icon ? `${c.icon} ` : ""}{c.name} ({c.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Sort Order</label>
                <input type="number" value={catSortOrder}
                  onChange={(e) => setCatSortOrder(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Description</label>
              <input type="text" value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500" />
            </div>
            <div className="flex justify-end">
              <button onClick={handleSaveCategory} disabled={savingCategory}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black px-5 py-2 rounded-lg transition-colors">
                {savingCategory ? "Saving…" : editingCategory ? "Update" : "Create"}
              </button>
            </div>
          </div>
        )}

        {/* Category tree list */}
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {categories.filter((c) => c.is_active).map((cat) => (
            <div key={cat.id}
              className="flex items-center gap-2 py-1.5 px-3 rounded-lg hover:bg-zinc-800/50 transition-colors group"
              style={{ paddingLeft: `${12 + cat.depth * 20}px` }}>
              {cat.depth > 0 && (
                <span className="text-zinc-700 text-xs">{"└"}</span>
              )}
              <span className="text-sm">{cat.icon || "📁"}</span>
              <span className="text-white text-xs font-bold flex-1">{cat.name}</span>
              <span className="text-[9px] font-mono text-zinc-600 hidden sm:inline">{cat.slug}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "#1A1A28", color: "#4A4A66" }}>
                d={cat.depth}
              </span>
              <button onClick={() => startEditCategory(cat)}
                className="text-zinc-600 hover:text-emerald-400 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                Edit
              </button>
              <button onClick={() => handleDeleteCategory(cat.id)}
                className="text-zinc-600 hover:text-red-400 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                Delete
              </button>
            </div>
          ))}
          {categories.filter((c) => c.is_active).length === 0 && (
            <p className="text-zinc-600 text-xs text-center py-4">No categories yet. Run the SQL migration first, then refresh.</p>
          )}
        </div>
      </div>

      {/* ── Arena Management Panel ─────────────────────────────────────────────── */}
      <div className="mb-6 bg-zinc-900 border border-blue-500/20 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-base">🏟️ Arena Management</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Manage all arenas — official, custom, visibility, categories</p>
          </div>
          {arenaMsg && (
            <span className="text-xs font-bold" style={{ color: arenaMsg.startsWith("Error") ? "#EF4444" : "#22C55E" }}>
              {arenaMsg}
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {(["all", "official", "custom"] as const).map((f) => (
              <button key={f} onClick={() => setArenaFilter(f)}
                className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors"
                style={arenaFilter === f
                  ? { background: "rgba(59,130,246,0.15)", color: "#60A5FA", border: "1px solid rgba(59,130,246,0.3)" }
                  : { background: "#1A1A28", color: "#4A4A66", border: "1px solid #2A2A3D" }
                }>
                {f}
              </button>
            ))}
          </div>
          <input type="text" value={arenaSearch} onChange={(e) => setArenaSearch(e.target.value)}
            placeholder="Search arenas…"
            className="flex-1 bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
            style={{ maxWidth: "240px" }} />
          <span className="text-[10px] text-zinc-600">{filteredArenas.length} arenas</span>
        </div>

        {/* Arena list */}
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filteredArenas.map((arena) => {
            const isEditing = editingArena === arena.id;
            const edits = getArenaEdit(arena.id);
            const catForArena = categories.find((c) => c.id === (edits.category_id !== undefined ? edits.category_id : arena.category_id));

            return (
              <div key={arena.id}
                className="bg-zinc-950/60 border rounded-xl p-3 transition-colors"
                style={{ borderColor: isEditing ? "rgba(59,130,246,0.4)" : "#222" }}>
                <div className="flex items-center gap-3">
                  {/* Arena info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-white text-sm font-bold truncate">{arena.name}</span>
                      {arena.is_official && (
                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                          style={{ color: "#F0C040", background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.2)" }}>
                          OFFICIAL
                        </span>
                      )}
                      {arena.is_verified && (
                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                          style={{ color: "#22C55E", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                          VERIFIED
                        </span>
                      )}
                      {!arena.is_official && (
                        <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                          style={{ color: "#4A4A66", background: "#1A1A28", border: "1px solid #2A2A3D" }}>
                          CUSTOM
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                      <span className="font-mono">{arena.slug}</span>
                      <span>•</span>
                      <span>{arena.visibility}</span>
                      <span>•</span>
                      <span>{arena.arena_type}</span>
                      {catForArena && (
                        <>
                          <span>•</span>
                          <span style={{ color: "#60A5FA" }}>{catForArena.icon} {catForArena.name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isEditing ? (
                      <>
                        <button onClick={() => saveArenaEdits(arena.id)} disabled={savingArena === arena.id}
                          className="text-[10px] font-black px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                          style={{ background: "rgba(59,130,246,0.15)", color: "#60A5FA", border: "1px solid rgba(59,130,246,0.3)" }}>
                          {savingArena === arena.id ? "…" : "Save"}
                        </button>
                        <button onClick={() => { setEditingArena(null); setArenaEdits((prev) => { const n = { ...prev }; delete n[arena.id]; return n; }); }}
                          className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setEditingArena(arena.id)}
                        className="text-[10px] font-bold text-zinc-500 hover:text-blue-400 transition-colors">
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {/* Edit form (expanded) */}
                {isEditing && (
                  <div className="mt-3 pt-3 space-y-3" style={{ borderTop: "1px solid #222" }}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Name</label>
                        <input type="text"
                          value={edits.name ?? arena.name}
                          onChange={(e) => setArenaEdit(arena.id, "name", e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Category</label>
                        <select
                          value={edits.category_id !== undefined ? (edits.category_id ?? "") : (arena.category_id ?? "")}
                          onChange={(e) => setArenaEdit(arena.id, "category_id", e.target.value || null)}
                          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                          <option value="">— No category —</option>
                          {categories.filter((c) => c.is_active).map((c) => (
                            <option key={c.id} value={c.id}>
                              {"  ".repeat(c.depth)}{c.icon ? `${c.icon} ` : ""}{c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Visibility</label>
                        <select
                          value={edits.visibility ?? arena.visibility}
                          onChange={(e) => setArenaEdit(arena.id, "visibility", e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500">
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Description</label>
                        <input type="text"
                          value={edits.description !== undefined ? (edits.description ?? "") : (arena.description ?? "")}
                          onChange={(e) => setArenaEdit(arena.id, "description", e.target.value)}
                          placeholder="Arena description…"
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Thumbnail URL</label>
                        <input type="url"
                          value={edits.thumbnail_url !== undefined ? (edits.thumbnail_url ?? "") : (arena.thumbnail_url ?? "")}
                          onChange={(e) => setArenaEdit(arena.id, "thumbnail_url", e.target.value)}
                          placeholder="https://example.com/image.jpg"
                          className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox"
                          checked={edits.is_official !== undefined ? !!edits.is_official : arena.is_official}
                          onChange={(e) => setArenaEdit(arena.id, "is_official", e.target.checked)}
                          className="accent-blue-500 w-3.5 h-3.5" />
                        <span className="text-zinc-300 text-xs">Official</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox"
                          checked={edits.is_verified !== undefined ? !!edits.is_verified : arena.is_verified}
                          onChange={(e) => setArenaEdit(arena.id, "is_verified", e.target.checked)}
                          className="accent-blue-500 w-3.5 h-3.5" />
                        <span className="text-zinc-300 text-xs">Verified</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filteredArenas.length === 0 && (
            <p className="text-zinc-600 text-xs text-center py-4">No arenas match your filter.</p>
          )}
        </div>
      </div>

      {/* ── Seeded Users Panel ───────────────────────────────────────────────── */}
      {showSeedForm && (
        <div ref={seedFormRef} className="mb-6 rounded-2xl p-5" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.25)" }}>
          <div className="mb-4">
            <h2 className="text-white font-bold text-base mb-0.5">🤖 Add Seeded User</h2>
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Creates a profile with a synthetic <code className="text-indigo-400">user_id</code> (so they appear in &ldquo;All Players&rdquo;) and{" "}
              <code className="text-indigo-400">is_test_profile = true</code> — the hidden algorithm tag used to identify calibration profiles
              when real users first swipe in the &ldquo;All&rdquo; arena.
            </p>
          </div>
          <form onSubmit={handleAddSeededUser} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs mb-1" style={{ color: "#6B7280" }}>Name (required)</label>
              <input
                type="text"
                placeholder="e.g. SeedUser_Alpha"
                value={seedName}
                onChange={(e) => setSeedName(e.target.value)}
                required
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 text-sm rounded-lg px-3 py-2 focus:outline-none"
                style={{ outlineColor: "#6366F1" }}
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs mb-1" style={{ color: "#6B7280" }}>Image URL (optional)</label>
              <input
                type="url"
                placeholder="https://example.com/photo.jpg"
                value={seedImageUrl}
                onChange={(e) => setSeedImageUrl(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 text-sm rounded-lg px-3 py-2 focus:outline-none"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs mb-1" style={{ color: "#6B7280" }}>Starting ELO</label>
              <input
                type="number"
                min={100}
                max={9999}
                placeholder="1200"
                value={seedElo}
                onChange={(e) => setSeedElo(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 text-sm rounded-lg px-3 py-2 focus:outline-none"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs mb-1" style={{ color: "#6B7280" }}>Gender</label>
              <select
                value={seedGender}
                onChange={(e) => setSeedGender(e.target.value as "male" | "female" | "")}
                className="w-full bg-zinc-800 border border-zinc-700 text-sm rounded-lg px-2 py-2 focus:outline-none"
                style={{ color: seedGender ? "#D1D5DB" : "#52525B" }}
              >
                <option value="">— any —</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={seeding || !seedName.trim()}
                className="font-bold text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ background: "#4F46E5", color: "#fff" }}
              >
                {seeding ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowSeedForm(false)}
                className="text-zinc-500 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── CSV Import Panel ─────────────────────────────────────────────────── */}
      {showImport && (
        <div className="mb-6 bg-zinc-900 border border-blue-500/30 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-white font-bold text-base mb-1">📥 Bulk Import from CSV</h2>
            <p className="text-zinc-500 text-xs">
              Upload a <code className="text-zinc-300">.csv</code> file to add multiple profiles at once.
            </p>
          </div>

          {/* ── Format Instructions ── */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-zinc-300 text-xs font-bold uppercase tracking-wider">📋 Required CSV Format</p>
            <p className="text-zinc-500 text-xs">
              Your CSV must have these columns in this exact order (header row optional):
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-2 py-1.5 text-zinc-400 font-bold whitespace-nowrap">#</th>
                    <th className="text-left px-2 py-1.5 text-zinc-400 font-bold whitespace-nowrap">Column</th>
                    <th className="text-left px-2 py-1.5 text-zinc-400 font-bold whitespace-nowrap">Required?</th>
                    <th className="text-left px-2 py-1.5 text-zinc-400 font-bold">Format / Example</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["1", "Name",        "✅ Yes",  "Henry Cavill"],
                    ["2", "Category",    "Optional","One or more pipe-separated values: Actors | Looksmaxxers | Singers | Athletes | Streamers | Politicians | Political Commentators | Models (e.g. \"Actors|Looksmaxxers\" for multiple)"],
                    ["3", "Height",      "Optional","6'1\"  or  73  (inches)"],
                    ["4", "Weight (lbs)","Optional","185  (number only, in lbs)"],
                    ["5", "Country",     "Optional","United Kingdom"],
                    ["6", "Image URL 1", "Optional","https://example.com/photo1.jpg"],
                    ["7", "Image URL 2", "Optional","https://example.com/photo2.jpg"],
                    ["8", "Image URL 3", "Optional",""],
                    ["9", "Image URL 4", "Optional",""],
                  ].map(([n, col, req, ex]) => (
                    <tr key={n} className="border-b border-zinc-900">
                      <td className="px-2 py-1.5 text-zinc-600">{n}</td>
                      <td className="px-2 py-1.5 text-white font-semibold whitespace-nowrap">{col}</td>
                      <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap">{req}</td>
                      <td className="px-2 py-1.5 text-zinc-400 font-mono text-[10px]">{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Example row */}
            <div>
              <p className="text-zinc-500 text-xs mb-1 font-bold">Example row:</p>
              <pre className="text-[10px] text-green-400 bg-black rounded-lg px-3 py-2 overflow-x-auto font-mono whitespace-pre">
{`Name,Category,Height,Weight (lbs),Country,Image URL 1,Image URL 2
Henry Cavill,Actors|Looksmaxxers,6'1",185,United Kingdom,https://example.com/cavill1.jpg,https://example.com/cavill2.jpg
Ryan Gosling,Actors,6'0",175,Canada,https://example.com/gosling.jpg,
Clavicular,Looksmaxxers,5'11",165,United States,https://example.com/clav.jpg,`}
              </pre>
            </div>

            {/* Download template link */}
            <button
              onClick={() => {
                const csv = `Name,Category,Height,Weight (lbs),Country,Image URL 1,Image URL 2,Image URL 3,Image URL 4\nHenry Cavill,Actors,6'1",185,United Kingdom,https://example.com/photo.jpg,,,\n`;
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "mogbattles_import_template.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-blue-400 hover:text-blue-300 text-xs underline transition-colors"
            >
              ⬇ Download blank template CSV
            </button>
          </div>

          {/* File picker / preview */}
          <input
            ref={csvFileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCSVFile}
          />

          {csvPreview.length === 0 ? (
            <button
              onClick={() => csvFileRef.current?.click()}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
            >
              📂 Choose CSV file
            </button>
          ) : (
            <div>
              {/* Preview table */}
              <div className="mb-3 max-h-48 overflow-y-auto bg-zinc-950 rounded-xl border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-950 border-b border-zinc-800">
                    <tr>
                      <th className="text-left px-3 py-2 text-zinc-500 font-bold">Name</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-bold">Category</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-bold">Height</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-bold">Weight</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-bold">Country</th>
                      <th className="text-left px-3 py-2 text-zinc-500 font-bold">Imgs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-zinc-900">
                        <td className="px-3 py-1.5 text-white font-semibold">{row.name}</td>
                        <td className="px-3 py-1.5 text-zinc-400 capitalize">
                          {row.categories.length > 0
                            ? row.categories.map((c) => c.replace(/_/g, " ")).join(", ")
                            : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-400">
                          {row.height_in ? inchesToDisplay(row.height_in) : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-400">
                          {row.weight_lbs ? `${row.weight_lbs} lbs` : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-400">
                          {row.country ?? <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-500">{row.imageUrls.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvPreview.length > 10 && (
                  <p className="text-zinc-600 text-xs px-3 py-2">… and {csvPreview.length - 10} more rows</p>
                )}
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <button
                  onClick={handleImportCSV}
                  disabled={importing}
                  className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
                >
                  {importing ? "Importing…" : `Import ${csvPreview.length} profiles`}
                </button>
                <button
                  onClick={() => { setCsvPreview([]); if (csvFileRef.current) csvFileRef.current.value = ""; }}
                  className="text-zinc-500 hover:text-white text-sm px-3 py-2.5 rounded-xl transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
          {importing && <p className="text-sm text-zinc-400 animate-pulse">Importing rows, please wait…</p>}
        </div>
      )}

      {/* ── Add Person Form ───────────────────────────────────────────────────── */}
      {showAddForm && (
        <div ref={addFormRef} className="mb-6 bg-zinc-900 border border-orange-500/30 rounded-2xl p-5">
          <h2 className="text-white font-bold mb-4">➕ Add New Person</h2>
          <form onSubmit={handleAddProfile} className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Name (required)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              className="flex-1 min-w-[160px] bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
            />
            <CategoryMultiSelect
              value={newCategories}
              onChange={setNewCategories}
            />
            <input
              type="url"
              placeholder="Image URL (optional)"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              className="flex-1 min-w-[200px] bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-600 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={adding || !newName.trim()}
                className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-sm px-4 py-2 rounded-lg transition-colors"
              >
                {adding ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-zinc-500 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Profile List ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {profiles.map((profile) => {
          const isExpanded = expandedId === profile.id;
          const slots = imageInputs[profile.id] ?? ["", "", "", ""];
          const stats = statsInputs[profile.id] ?? { height: "", weight: "", country: "" };

          return (
            <div key={profile.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              {/* Row */}
              <div className="flex flex-wrap items-center gap-3 p-3">
                {/* Thumbnail */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={profile.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=27272a&color=555&size=80`}
                  alt={profile.name}
                  className="w-12 h-12 rounded-lg object-cover border border-zinc-700 shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=27272a&color=555&size=80`; }}
                />

                {/* Name + stats */}
                <div className="flex-1 min-w-[120px]">
                  <div className="flex items-center gap-1.5">
                    <p className="text-white font-bold text-sm">{profile.name}</p>
                    {profile.is_test_profile && profile.user_id && (
                      <span
                        className="text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0"
                        style={{ background: "rgba(99,102,241,0.15)", color: "#818CF8", border: "1px solid rgba(99,102,241,0.3)" }}
                        title="Seeded calibration user — is_test_profile=true"
                      >
                        🤖 seeded
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    <p className="text-zinc-500 text-xs">{profile.elo_rating} ELO</p>
                    {profile.height_in && (
                      <p className="text-zinc-600 text-xs">{inchesToDisplay(profile.height_in)}</p>
                    )}
                    {profile.weight_lbs && (
                      <p className="text-zinc-600 text-xs">{profile.weight_lbs} lbs</p>
                    )}
                    {profile.country && (
                      <p className="text-zinc-600 text-xs">{profile.country}</p>
                    )}
                  </div>
                </div>

                {/* Categories */}
                <CategoryMultiSelect
                  value={profile.categories ?? (profile.category ? [profile.category] : [])}
                  onChange={(cats) => handleCategoriesChange(profile.id, cats)}
                />

                {/* Image count */}
                <span className={`text-xs shrink-0 ${profile.image_urls?.filter(Boolean).length ? "text-green-500" : "text-zinc-600"}`}>
                  {profile.image_urls?.filter(Boolean).length || 0}/4 imgs
                </span>

                {/* Edit button */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : profile.id)}
                  className="text-xs text-zinc-400 hover:text-orange-400 border border-zinc-700 hover:border-orange-500 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
                >
                  {isExpanded ? "▲ Close" : "✏️ Edit"}
                </button>

                {/* Delete */}
                {confirmDeleteId === profile.id ? (
                  <div className="flex gap-1.5 items-center shrink-0">
                    <span className="text-red-400 text-xs">Delete?</span>
                    <button onClick={() => handleDelete(profile.id)} disabled={deletingId === profile.id} className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                      {deletingId === profile.id ? "…" : "Yes"}
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="text-zinc-500 hover:text-white text-xs px-2 py-1.5 rounded-lg transition-colors">
                      No
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(profile.id)} className="text-zinc-600 hover:text-red-400 text-sm transition-colors shrink-0" title="Delete">
                    🗑
                  </button>
                )}
              </div>

              {/* Expanded Editor */}
              {isExpanded && (
                <div className="border-t border-zinc-800 p-4 bg-zinc-950/50 space-y-5">

                  {/* ── ELO Override ── */}
                  <div>
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-3">
                      ELO Override
                    </p>
                    <div className="flex items-end gap-3">
                      <div className="w-36">
                        <label className="block text-zinc-600 text-xs mb-1">ELO rating (all arenas)</label>
                        <input
                          type="number"
                          min={100}
                          max={9999}
                          value={eloInputs[profile.id] ?? profile.elo_rating}
                          onChange={(e) => setEloInputs((prev) => ({ ...prev, [profile.id]: e.target.value }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-yellow-500"
                        />
                      </div>
                      <button
                        onClick={() => handleSaveElo(profile.id)}
                        disabled={savingElo === profile.id}
                        className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors"
                      >
                        {savingElo === profile.id ? "Saving…" : "Set ELO"}
                      </button>
                      <p className="text-zinc-600 text-[10px]">
                        Overwrites ELO in profiles + all arena_profile_stats rows
                      </p>
                    </div>
                  </div>

                  {/* ── Stats: height / weight / country ── */}
                  <div>
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-3">
                      Physical Stats
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-zinc-600 text-xs mb-1">Height (e.g. 6&apos;1&quot;)</label>
                        <input
                          type="text"
                          placeholder="6'1&quot;"
                          value={stats.height}
                          onChange={(e) => setStatsInputs((prev) => ({ ...prev, [profile.id]: { ...prev[profile.id], height: e.target.value } }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-zinc-600 text-xs mb-1">Weight (lbs)</label>
                        <input
                          type="number"
                          placeholder="185"
                          value={stats.weight}
                          onChange={(e) => setStatsInputs((prev) => ({ ...prev, [profile.id]: { ...prev[profile.id], weight: e.target.value } }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-zinc-600 text-xs mb-1">Country</label>
                        <input
                          type="text"
                          placeholder="United Kingdom"
                          value={stats.country}
                          onChange={(e) => setStatsInputs((prev) => ({ ...prev, [profile.id]: { ...prev[profile.id], country: e.target.value } }))}
                          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => saveStats(profile.id)}
                        className="bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Save Stats
                      </button>
                    </div>
                  </div>

                  {/* ── Wikipedia slug ── */}
                  <div>
                    <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-3">
                      Images
                    </p>
                    <div className="flex gap-2 items-center mb-4">
                      <span className="text-zinc-500 text-xs w-24 shrink-0">Wikipedia slug</span>
                      <input
                        type="text"
                        placeholder="e.g. Leonardo_DiCaprio"
                        value={slugInputs[profile.id] ?? ""}
                        onChange={(e) => setSlugInputs((prev) => ({ ...prev, [profile.id]: e.target.value }))}
                        onBlur={() => handleSlugSave(profile.id)}
                        className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500"
                      />
                    </div>

                    {/* 4 image slots */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {slots.map((url, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url || `https://ui-avatars.com/api/?name=${idx + 1}&background=18181b&color=444&size=48`}
                            alt={`slot ${idx}`}
                            className="w-10 h-10 rounded-lg object-cover border border-zinc-700 shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${idx + 1}&background=18181b&color=444&size=48`; }}
                          />
                          <div className="flex-1 flex gap-1">
                            <input
                              type="text"
                              placeholder={idx === 0 ? "Primary image URL" : `Image ${idx + 1} URL`}
                              value={url}
                              onChange={(e) => {
                                const updated = [...slots];
                                updated[idx] = e.target.value;
                                setImageInputs((prev) => ({ ...prev, [profile.id]: updated }));
                              }}
                              className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-500 min-w-0"
                            />
                            <button
                              onClick={() => handleFetchSlot(profile.id, idx)}
                              disabled={fetchingId === profile.id && fetchingSlot === idx}
                              title="Fetch from Wikipedia"
                              className="bg-zinc-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs px-2 py-1.5 rounded-lg transition-colors shrink-0"
                            >
                              {fetchingId === profile.id && fetchingSlot === idx ? "…" : "W"}
                            </button>
                            {url && (
                              <button
                                onClick={() => {
                                  const updated = [...slots];
                                  updated[idx] = "";
                                  setImageInputs((prev) => ({ ...prev, [profile.id]: updated }));
                                }}
                                className="text-zinc-600 hover:text-red-400 text-xs px-1.5 transition-colors shrink-0"
                                title="Clear"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => saveImages(profile.id)}
                        className="bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                      >
                        Save Images
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
