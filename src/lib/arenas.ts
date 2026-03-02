import { createBrowserClient } from "@supabase/ssr";
import type { ArenaRow } from "./supabase";

// Internal untyped client — explicit return types on all exported functions
// handle type safety instead of Supabase's generic inference.
function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Shared profile type with per-arena ELO ──────────────────────────────────

export interface ArenaProfile {
  id: string;
  user_id?: string | null;
  name: string;
  image_url: string | null;
  image_urls: string[];
  wikipedia_slug: string | null;
  category: string | null;
  categories: string[];
  elo_rating: number;
  wins: number;
  losses: number;
  matches: number;
  height_in: number | null;
  weight_lbs: number | null;
  country: string | null;
  gender: string | null;
}

export interface ArenaWithCount extends ArenaRow {
  player_count: number;
}

export interface VoteHistoryRow {
  id: string;
  voted_at: string;
  winner_id: string;
  profile_a: { id: string; name: string; image_url: string | null };
  profile_b: { id: string; name: string; image_url: string | null };
  arena: { id: string; name: string; slug: string };
}

// Official arena display order
const OFFICIAL_ORDER = [
  "all",
  "members",
  "actors",
  "looksmaxxers",
  "psl-icons",
  "singers",
  "athletes",
  "streamers",
  "politicians",
  "political-commentators",
  "models",
];

// ─── Resolve root arena ID (client-side mirror of SQL get_root_arena_id) ─────

export async function getRootArenaId(arenaId: string): Promise<string | null> {
  const client = db();

  // Fetch the arena
  const { data: arena } = await client
    .from("arenas")
    .select("id, slug, category_id")
    .eq("id", arenaId)
    .maybeSingle();

  if (!arena) return null;

  // Aggregate arenas return themselves
  if (arena.slug === "all" || arena.slug === "members") return arena.id;

  // No category → can't determine root
  if (!arena.category_id) return null;

  // Walk up ancestors and find the FIRST one that has an official arena.
  // This handles hierarchies like Humans(depth=0) → Men(depth=1) → PSL Icons(depth=2)
  // where the root arena lives on "Men", not the top-level "Humans".
  const { getCategoryAncestors } = await import("@/lib/categories");
  const ancestors = await getCategoryAncestors(arena.category_id);

  // ancestors sorted by depth ascending: root first (depth=0), then children (depth=1), etc.
  // First match = highest ancestor with an arena (e.g. Men, not PSL Icons)
  for (const ancestor of ancestors) {
    const { data: rootArena } = await client
      .from("arenas")
      .select("id")
      .eq("category_id", ancestor.id)
      .eq("is_official", true)
      .limit(1)
      .maybeSingle();
    if (rootArena) return rootArena.id;
  }

  return null;
}

// ─── Fetch all public arenas (with player counts) ────────────────────────────

export async function getPublicArenas(): Promise<ArenaWithCount[]> {
  const client = db();

  const { data: arenas, error } = await client
    .from("arenas")
    .select("*")
    .eq("visibility", "public")
    .order("is_official", { ascending: false })
    .order("created_at", { ascending: true });

  if (error || !arenas) return [];

  // Batch-fetch player counts from arena_profile_stats (for root/aggregate arenas)
  const { data: counts } = await client
    .from("arena_profile_stats")
    .select("arena_id")
    .in(
      "arena_id",
      arenas.map((a: ArenaRow) => a.id)
    );

  const countMap: Record<string, number> = {};
  (counts ?? []).forEach((row) => {
    countMap[row.arena_id] = (countMap[row.arena_id] ?? 0) + 1;
  });

  // For sub-category arenas with no stats, derive count from profile_categories
  const needsCategoryCount = arenas.filter(
    (a) => a.is_official && a.category_id && !countMap[a.id]
  );
  if (needsCategoryCount.length > 0) {
    const catIds = needsCategoryCount.map((a) => a.category_id).filter(Boolean) as string[];
    const { data: pcRows } = await client
      .from("profile_categories")
      .select("category_id")
      .in("category_id", catIds);
    const catCountMap: Record<string, number> = {};
    (pcRows ?? []).forEach((row) => {
      catCountMap[row.category_id] = (catCountMap[row.category_id] ?? 0) + 1;
    });
    needsCategoryCount.forEach((a) => {
      if (a.category_id && catCountMap[a.category_id]) {
        countMap[a.id] = catCountMap[a.category_id];
      }
    });
  }

  // Sort: official arenas in fixed order, then custom by creation date
  const official = arenas
    .filter((a) => a.is_official)
    .sort(
      (a, b) => OFFICIAL_ORDER.indexOf(a.slug) - OFFICIAL_ORDER.indexOf(b.slug)
    );
  const custom = arenas.filter((a) => !a.is_official);

  return [...official, ...custom].map((a) => ({
    ...a,
    player_count: countMap[a.id] ?? 0,
  }));
}

// ─── Fetch arenas for explore page (with search/sort/filter) ─────────────────

export async function getExploreArenas(opts?: {
  search?: string;
  sort?: "popular" | "newest" | "active";
  filter?: "all" | "open" | "request";
  categoryId?: string;
  categoryDescendantIds?: string[];
  categorySlugs?: string[];
}): Promise<ArenaWithCount[]> {
  const client = db();

  let query = client
    .from("arenas")
    .select("*")
    .eq("visibility", "public");

  if (opts?.filter === "open") {
    query = query.eq("arena_type", "open");
  } else if (opts?.filter === "request") {
    query = query.eq("arena_type", "request");
  }

  if (opts?.search?.trim()) {
    query = query.ilike("name", `%${opts.search.trim()}%`);
  }

  // Don't filter by category in the DB query — fetch all, then filter client-side
  // to reliably match both category_id (UUID) and legacy category (slug)

  const { data: allArenas, error } = await query;
  if (error || !allArenas || allArenas.length === 0) return [];

  // Client-side category filtering: match category_id, legacy category slug, OR arena slug
  // Official arenas like "actors" may not have category/category_id set, but their
  // slug matches the category slug, so we also check a.slug against the set.
  let arenas = allArenas;
  if (opts?.categoryDescendantIds && opts.categoryDescendantIds.length > 0) {
    const idSet = new Set(opts.categoryDescendantIds);
    const slugSet = new Set(opts.categorySlugs ?? []);
    arenas = allArenas.filter((a) =>
      (a.category_id && idSet.has(a.category_id)) ||
      (a.category && slugSet.has(a.category)) ||
      (a.slug && slugSet.has(a.slug))
    );
  } else if (opts?.categoryId) {
    arenas = allArenas.filter((a) => a.category_id === opts.categoryId);
  }

  if (arenas.length === 0) return [];

  // Fetch player counts + match counts for sorting
  const ids = arenas.map((a: ArenaRow) => a.id);

  const { data: statRows } = await client
    .from("arena_profile_stats")
    .select("arena_id, matches")
    .in("arena_id", ids);

  const playerCount: Record<string, number> = {};
  const matchCount: Record<string, number> = {};
  (statRows ?? []).forEach((row) => {
    playerCount[row.arena_id] = (playerCount[row.arena_id] ?? 0) + 1;
    matchCount[row.arena_id] = (matchCount[row.arena_id] ?? 0) + (row.matches ?? 0);
  });

  // For sub-category arenas with no stats, derive count from profile_categories
  const needsCategoryCount = arenas.filter(
    (a) => a.is_official && a.category_id && !playerCount[a.id]
  );
  if (needsCategoryCount.length > 0) {
    const catIds = needsCategoryCount.map((a) => a.category_id).filter(Boolean) as string[];
    const { data: pcRows } = await client
      .from("profile_categories")
      .select("category_id")
      .in("category_id", catIds);
    const catCountMap: Record<string, number> = {};
    (pcRows ?? []).forEach((row) => {
      catCountMap[row.category_id] = (catCountMap[row.category_id] ?? 0) + 1;
    });
    needsCategoryCount.forEach((a) => {
      if (a.category_id && catCountMap[a.category_id]) {
        playerCount[a.id] = catCountMap[a.category_id];
      }
    });
  }

  const withCounts = arenas.map((a) => ({
    ...a,
    player_count: playerCount[a.id] ?? 0,
    _match_count: matchCount[a.id] ?? 0,
  }));

  // Sort
  if (opts?.sort === "newest") {
    withCounts.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else if (opts?.sort === "active") {
    withCounts.sort((a, b) => b._match_count - a._match_count);
  } else {
    // popular (default) — by player count
    withCounts.sort((a, b) => b.player_count - a.player_count);
  }

  return withCounts.map(({ _match_count: _mc, ...rest }) => rest);
}

// ─── Fetch single arena by slug ───────────────────────────────────────────────

export async function getArenaBySlug(slug: string): Promise<ArenaRow | null> {
  const client = db();
  const { data, error } = await client
    .from("arenas")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error) return null;
  return data as ArenaRow;
}

// ─── Fetch profiles + per-arena ELO for a given arena ────────────────────────

export async function getProfilesForArena(
  arena: ArenaRow
): Promise<ArenaProfile[]> {
  const client = db();

  let profileIds: string[];

  if (arena.is_official) {
    if (arena.slug === "members") {
      // "All Players" arena — only registered user accounts
      const { data } = await client.from("profiles").select("id").not("user_id", "is", null);
      profileIds = ((data ?? []) as { id: string }[]).map((p) => p.id);
    } else if (arena.category_id) {
      // Use hierarchical category system: get all descendant category IDs,
      // then find profiles linked via profile_categories junction table
      const { getCategoryDescendantIds } = await import("@/lib/categories");
      const descendantIds = await getCategoryDescendantIds(arena.category_id);
      const { data } = await client
        .from("profile_categories")
        .select("profile_id")
        .in("category_id", descendantIds);
      // Deduplicate (a profile can be in multiple descendant categories)
      profileIds = [...new Set(((data ?? []) as { profile_id: string }[]).map((r) => r.profile_id))];
    } else if (arena.category && arena.category !== "all") {
      // Legacy fallback: use profiles.categories array
      const { data } = await client.from("profiles").select("id").contains("categories", [arena.category]);
      profileIds = ((data ?? []) as { id: string }[]).map((p) => p.id);
    } else {
      // "All" arena or no category — show all profiles
      const { data } = await client.from("profiles").select("id");
      profileIds = ((data ?? []) as { id: string }[]).map((p) => p.id);
    }
  } else {
    const { data } = await client
      .from("arena_members")
      .select("profile_id")
      .eq("arena_id", arena.id)
      .eq("status", "approved");
    profileIds = ((data ?? []) as { profile_id: string }[]).map((m) => m.profile_id);
  }

  if (profileIds.length === 0) return [];

  const { data: profiles } = await client
    .from("profiles")
    .select("id, name, image_url, image_urls, wikipedia_slug, category, categories, height_in, weight_lbs, country, gender")
    .in("id", profileIds);

  // Resolve root arena for ELO lookup (sub-category arenas share root ELO)
  let statsArenaId = arena.id;
  const isNonCustomArena = arena.is_official ||
    (arena.arena_tier && arena.arena_tier !== "custom");
  if (arena.category_id && isNonCustomArena) {
    const rootId = await getRootArenaId(arena.id);
    if (rootId) statsArenaId = rootId;
  }

  const { data: stats } = await client
    .from("arena_profile_stats")
    .select("profile_id, elo_rating, wins, losses, matches")
    .eq("arena_id", statsArenaId)
    .in("profile_id", profileIds);

  type PRow = {
    id: string;
    name: string;
    image_url: string | null;
    image_urls: string[] | null;
    wikipedia_slug: string | null;
    category: string | null;
    categories: string[] | null;
    height_in: number | null;
    weight_lbs: number | null;
    country: string | null;
    gender: string | null;
  };
  type SRow = {
    profile_id: string;
    elo_rating: number;
    wins: number;
    losses: number;
    matches: number;
  };

  const statsMap = new Map(
    ((stats ?? []) as SRow[]).map((s) => [s.profile_id, s])
  );

  return ((profiles ?? []) as PRow[]).map((p) => ({
    ...p,
    image_urls: p.image_urls ?? (p.image_url ? [p.image_url] : []),
    categories: p.categories ?? (p.category ? [p.category] : []),
    elo_rating: statsMap.get(p.id)?.elo_rating ?? 1200,
    wins: statsMap.get(p.id)?.wins ?? 0,
    losses: statsMap.get(p.id)?.losses ?? 0,
    matches: statsMap.get(p.id)?.matches ?? 0,
    height_in: p.height_in ?? null,
    weight_lbs: p.weight_lbs ?? null,
    country: p.country ?? null,
    gender: p.gender ?? null,
  }));
}

// ─── Fetch leaderboard for an arena (sorted by ELO) ─────────────────────────

export async function getLeaderboardForArena(
  arenaId: string,
  options?: { membersOnly?: boolean; arenaSpecific?: boolean }
): Promise<(ArenaProfile & { rank: number })[]> {
  const client = db();
  const membersOnly = options?.membersOnly ?? false;
  const arenaSpecific = options?.arenaSpecific ?? false;

  // Resolve root arena for ELO stats
  const { data: thisArena } = await client
    .from("arenas")
    .select("id, slug, category_id, is_official, arena_tier")
    .eq("id", arenaId)
    .maybeSingle();

  let statsArenaId = arenaId;
  let filterProfileIds: Set<string> | null = null;

  // Non-custom arenas resolve to root arena for global ELO
  const isNonCustom = thisArena?.is_official ||
    (thisArena?.arena_tier && thisArena.arena_tier !== "custom");

  if (thisArena?.category_id && isNonCustom && !arenaSpecific) {
    // Global ELO mode: resolve to root arena, filter by sub-category membership
    const rootId = await getRootArenaId(arenaId);
    if (rootId && rootId !== arenaId) {
      statsArenaId = rootId;
      // Sub-category: filter to only profiles in this sub-category
      const { getCategoryDescendantIds } = await import("@/lib/categories");
      const descendantIds = await getCategoryDescendantIds(thisArena.category_id);
      const { data: pcRows } = await client
        .from("profile_categories")
        .select("profile_id")
        .in("category_id", descendantIds);
      filterProfileIds = new Set(((pcRows ?? []) as { profile_id: string }[]).map((r) => r.profile_id));
    }
  } else if (arenaSpecific) {
    // Arena-specific ELO mode: use this arena's own stats directly
    statsArenaId = arenaId;
    // Still filter to only profiles in this category so non-members don't appear
    if (thisArena?.category_id) {
      const { getCategoryDescendantIds } = await import("@/lib/categories");
      const descendantIds = await getCategoryDescendantIds(thisArena.category_id);
      const { data: pcRows } = await client
        .from("profile_categories")
        .select("profile_id")
        .in("category_id", descendantIds);
      filterProfileIds = new Set(((pcRows ?? []) as { profile_id: string }[]).map((r) => r.profile_id));
    }
  }

  type LRow = {
    elo_rating: number;
    wins: number;
    losses: number;
    matches: number;
    profile_id: string;
    profiles: {
      id: string;
      name: string;
      image_url: string | null;
      image_urls: string[] | null;
      wikipedia_slug: string | null;
      category: string | null;
      categories: string[] | null;
      height_in: number | null;
      weight_lbs: number | null;
      country: string | null;
      gender: string | null;
      user_id: string | null;
      is_test_profile: boolean | null;
    } | null;
  };

  const { data, error } = await client
    .from("arena_profile_stats")
    .select(
      "elo_rating, wins, losses, matches, profile_id, profiles(id, name, image_url, image_urls, wikipedia_slug, category, categories, height_in, weight_lbs, country, gender, user_id, is_test_profile)"
    )
    .eq("arena_id", statsArenaId)
    .order("elo_rating", { ascending: false });

  if (error || !data) return [];

  return ((data as unknown as LRow[]))
    .filter((row) => {
      if (!row.profiles) return false;
      if (membersOnly && row.profiles.is_test_profile === true) return false;
      // Filter to sub-category members if viewing a sub-category leaderboard
      if (filterProfileIds && !filterProfileIds.has(row.profile_id)) return false;
      return true;
    })
    .map((row, i) => {
      const profile = row.profiles!;
      return {
        rank: i + 1,
        id: profile.id,
        name: profile.name,
        image_url: profile.image_url,
        image_urls: profile.image_urls ?? (profile.image_url ? [profile.image_url] : []),
        wikipedia_slug: profile.wikipedia_slug,
        category: profile.category,
        categories: profile.categories ?? (profile.category ? [profile.category] : []),
        elo_rating: row.elo_rating,
        wins: row.wins,
        losses: row.losses,
        matches: row.matches,
        height_in: profile.height_in ?? null,
        weight_lbs: profile.weight_lbs ?? null,
        country: profile.country ?? null,
        gender: profile.gender ?? null,
      };
    });
}

// ─── Fetch top N profiles for an arena (lightweight leaderboard preview) ──────

export async function getTopProfilesForArena(
  arenaId: string,
  limit = 3,
  opts?: { excludeTestProfiles?: boolean; fallbackToProfiles?: boolean }
): Promise<{ id: string; name: string; image_url: string | null; elo_rating: number }[]> {
  const client = db();

  // Check if this arena should resolve to root (non-custom only)
  const { data: arenaInfo } = await client
    .from("arenas")
    .select("is_official, arena_tier, category_id")
    .eq("id", arenaId)
    .maybeSingle();

  const isNonCustom = arenaInfo?.is_official ||
    (arenaInfo?.arena_tier && arenaInfo.arena_tier !== "custom");

  const rootId = isNonCustom ? await getRootArenaId(arenaId) : null;
  const statsArenaId = rootId ?? arenaId;

  // If this is a sub-category, get profile IDs to filter by
  let filterProfileIds: Set<string> | null = null;
  if (rootId && rootId !== arenaId) {
    const thisArena = arenaInfo;
    if (thisArena?.category_id) {
      const { getCategoryDescendantIds } = await import("@/lib/categories");
      const descendantIds = await getCategoryDescendantIds(thisArena.category_id);
      const { data: pcRows } = await client
        .from("profile_categories")
        .select("profile_id")
        .in("category_id", descendantIds);
      filterProfileIds = new Set(((pcRows ?? []) as { profile_id: string }[]).map((r) => r.profile_id));
    }
  }

  let query = client
    .from("arena_profile_stats")
    .select("elo_rating, profile_id, profiles(id, name, image_url, is_test_profile)")
    .eq("arena_id", statsArenaId)
    .order("elo_rating", { ascending: false });

  // When excluding test profiles, fetch more to compensate for filtering
  const fetchLimit = opts?.excludeTestProfiles ? limit * 5 : limit;
  query = query.limit(fetchLimit);

  const { data, error } = await query;

  type Row = {
    elo_rating: number;
    profile_id: string;
    profiles: { id: string; name: string; image_url: string | null; is_test_profile?: boolean } | null;
  };

  let rows = ((data ?? []) as unknown as Row[]).filter((r) => r.profiles);

  if (opts?.excludeTestProfiles) {
    rows = rows.filter((r) => !r.profiles!.is_test_profile);
  }

  // Filter to sub-category members if viewing a sub-category preview
  if (filterProfileIds) {
    rows = rows.filter((r) => filterProfileIds!.has(r.profile_id));
  }

  const results = rows.slice(0, limit).map((r) => ({
    id: r.profiles!.id,
    name: r.profiles!.name,
    image_url: r.profiles!.image_url,
    elo_rating: r.elo_rating,
  }));

  // Fallback: if arena_profile_stats has no matching rows but we know profiles
  // exist (e.g. "All Players" / "All"), query profiles table directly.
  if (results.length === 0 && opts?.fallbackToProfiles) {
    let pQuery = client
      .from("profiles")
      .select("id, name, image_url, elo_rating, is_test_profile")
      .order("elo_rating", { ascending: false })
      .limit(opts.excludeTestProfiles ? limit * 5 : limit);

    if (opts.excludeTestProfiles) {
      pQuery = pQuery.eq("is_test_profile", false);
    }

    const { data: profiles } = await pQuery;
    if (!profiles) return [];

    return (profiles as { id: string; name: string; image_url: string | null; elo_rating: number; is_test_profile?: boolean }[])
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        name: p.name,
        image_url: p.image_url,
        elo_rating: p.elo_rating,
      }));
  }

  return results;
}

// ─── Featured battles (Battle of the Day / Coming Up) ────────────────────────

export interface FeaturedBattle {
  id: string;
  type: "battle_of_day" | "upcoming";
  label: string | null;
  profile_a: { id: string; name: string; image_url: string | null } | null;
  profile_b: { id: string; name: string; image_url: string | null } | null;
  is_active: boolean;
}

export async function getFeaturedBattles(): Promise<FeaturedBattle[]> {
  const client = db();
  const { data, error } = await client
    .from("featured_battles")
    .select("id, type, label, is_active, profile_a_id, profile_b_id")
    .eq("is_active", true)
    .order("type", { ascending: true }); // battle_of_day < upcoming alphabetically

  if (error || !data) return [];

  type RawRow = {
    id: string;
    type: "battle_of_day" | "upcoming";
    label: string | null;
    is_active: boolean;
    profile_a_id: string | null;
    profile_b_id: string | null;
  };

  const rows = data as RawRow[];
  const profileIdSet = new Set<string>();
  rows.forEach((r) => {
    if (r.profile_a_id) profileIdSet.add(r.profile_a_id);
    if (r.profile_b_id) profileIdSet.add(r.profile_b_id);
  });

  if (profileIdSet.size === 0) {
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      label: r.label,
      is_active: r.is_active,
      profile_a: null,
      profile_b: null,
    }));
  }

  const { data: profileRows } = await client
    .from("profiles")
    .select("id, name, image_url")
    .in("id", Array.from(profileIdSet));

  type PRow = { id: string; name: string; image_url: string | null };
  const profileMap = new Map(((profileRows ?? []) as PRow[]).map((p) => [p.id, p]));

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    label: r.label,
    is_active: r.is_active,
    profile_a: r.profile_a_id ? (profileMap.get(r.profile_a_id) ?? null) : null,
    profile_b: r.profile_b_id ? (profileMap.get(r.profile_b_id) ?? null) : null,
  }));
}

export async function upsertFeaturedBattle(input: {
  type: "battle_of_day" | "upcoming";
  profile_a_id: string | null;
  profile_b_id: string | null;
  label: string | null;
  is_active: boolean;
}): Promise<{ error: string | null }> {
  const client = db();
  // Use upsert on type (one row per type)
  const { error } = await client
    .from("featured_battles")
    .upsert(input, { onConflict: "type" });
  return { error: (error as { message: string } | null)?.message ?? null };
}

// ─── Head-to-head analytics between two profiles ─────────────────────────────

export interface HeadToHeadStats {
  profile_a: { id: string; name: string; image_url: string | null };
  profile_b: { id: string; name: string; image_url: string | null };
  a_wins: number;
  b_wins: number;
  total: number;
  a_elo: number;
  b_elo: number;
}

export async function getHeadToHead(
  profileAId: string,
  profileBId: string
): Promise<HeadToHeadStats | null> {
  const client = db();

  // Fetch both profiles
  const { data: profileRows } = await client
    .from("profiles")
    .select("id, name, image_url, elo_rating")
    .in("id", [profileAId, profileBId]);

  type PRow = { id: string; name: string; image_url: string | null; elo_rating: number };
  const profiles = (profileRows ?? []) as PRow[];
  const pa = profiles.find((p) => p.id === profileAId);
  const pb = profiles.find((p) => p.id === profileBId);
  if (!pa || !pb) return null;

  // Fetch all matches where both profiles participated
  const { data: matchRows } = await client
    .from("matches")
    .select("winner_id, loser_id")
    .in("winner_id", [profileAId, profileBId])
    .in("loser_id", [profileAId, profileBId]);

  type MRow = { winner_id: string; loser_id: string };
  // Filter to only head-to-head (both must be in the same match)
  const h2h = ((matchRows ?? []) as MRow[]).filter(
    (m) =>
      (m.winner_id === profileAId && m.loser_id === profileBId) ||
      (m.winner_id === profileBId && m.loser_id === profileAId)
  );

  const aWins = h2h.filter((m) => m.winner_id === profileAId).length;
  const bWins = h2h.filter((m) => m.winner_id === profileBId).length;

  return {
    profile_a: { id: pa.id, name: pa.name, image_url: pa.image_url },
    profile_b: { id: pb.id, name: pb.name, image_url: pb.image_url },
    a_wins: aWins,
    b_wins: bWins,
    total: h2h.length,
    a_elo: pa.elo_rating,
    b_elo: pb.elo_rating,
  };
}

// ─── Fetch voted pairs for the current user in an arena ──────────────────────

export async function getVotedPairs(
  userId: string,
  arenaId: string | null  // null = fetch across ALL arenas (used for "all" swipe mode)
): Promise<Set<string>> {
  const client = db();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = client
    .from("user_votes")
    .select("profile_a, profile_b")
    .eq("voter_id", userId);
  if (arenaId !== null) {
    query = query.eq("arena_id", arenaId);
  }
  const { data } = await query;

  const set = new Set<string>();
  ((data ?? []) as { profile_a: string; profile_b: string }[]).forEach((row) => {
    set.add(`${row.profile_a}:${row.profile_b}`);
  });
  return set;
}

// ─── Fetch vote history for the current user ─────────────────────────────────

export async function getMyVoteHistory(
  userId: string,
  search?: string
): Promise<VoteHistoryRow[]> {
  const client = db();

  // Fetch raw user_votes rows
  const { data: votes, error } = await client
    .from("user_votes")
    .select("id, voted_at, winner_id, profile_a, profile_b, arena_id")
    .eq("voter_id", userId)
    .order("voted_at", { ascending: false })
    .limit(200);

  if (error || !votes || votes.length === 0) return [];

  type RawVote = {
    id: string;
    voted_at: string;
    winner_id: string;
    profile_a: string;
    profile_b: string;
    arena_id: string;
  };

  const rawVotes = votes as RawVote[];

  // Batch-fetch all unique profile IDs
  const profileIdSet = new Set<string>();
  rawVotes.forEach((v) => {
    profileIdSet.add(v.profile_a);
    profileIdSet.add(v.profile_b);
  });
  const profileIds = Array.from(profileIdSet);

  // Batch-fetch all unique arena IDs
  const arenaIdSet = new Set<string>(rawVotes.map((v) => v.arena_id));
  const arenaIds = Array.from(arenaIdSet);

  const [{ data: profileRows }, { data: arenaRows }] = await Promise.all([
    client
      .from("profiles")
      .select("id, name, image_url")
      .in("id", profileIds),
    client
      .from("arenas")
      .select("id, name, slug")
      .in("id", arenaIds),
  ]);

  type PRow = { id: string; name: string; image_url: string | null };
  type ARow = { id: string; name: string; slug: string };

  const profileMap = new Map(
    ((profileRows ?? []) as PRow[]).map((p) => [p.id, p])
  );
  const arenaMap = new Map(
    ((arenaRows ?? []) as ARow[]).map((a) => [a.id, a])
  );

  const rows: VoteHistoryRow[] = rawVotes
    .map((v) => {
      const pa = profileMap.get(v.profile_a);
      const pb = profileMap.get(v.profile_b);
      const arena = arenaMap.get(v.arena_id);
      if (!pa || !pb || !arena) return null;
      return {
        id: v.id,
        voted_at: v.voted_at,
        winner_id: v.winner_id,
        profile_a: pa,
        profile_b: pb,
        arena,
      };
    })
    .filter((r): r is VoteHistoryRow => r !== null);

  // Client-side search filter
  if (search?.trim()) {
    const parts = search
      .toLowerCase()
      .split(/\s+vs\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    return rows.filter((r) => {
      const nameA = r.profile_a.name.toLowerCase();
      const nameB = r.profile_b.name.toLowerCase();
      if (parts.length === 2) {
        return (
          (nameA.includes(parts[0]) && nameB.includes(parts[1])) ||
          (nameA.includes(parts[1]) && nameB.includes(parts[0]))
        );
      }
      return nameA.includes(parts[0]) || nameB.includes(parts[0]);
    });
  }

  return rows;
}

// ─── Create a new custom arena ───────────────────────────────────────────────

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export async function createArena(input: {
  name: string;
  description: string;
  visibility: "public" | "private";
  arena_type: "fixed" | "open" | "request";
  creator_id: string;
  thumbnail_url?: string | null;
  category_id?: string | null;
  arena_tier?: "official" | "moderator" | "custom";
}): Promise<{ data: ArenaRow | null; error: string | null }> {
  const client = db();

  let slug = generateSlug(input.name);
  if (!slug) slug = "arena";

  for (let attempt = 0; attempt < 5; attempt++) {
    const finalSlug =
      attempt === 0
        ? slug
        : `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    const { data, error } = await client
      .from("arenas")
      .insert({ ...input, slug: finalSlug })
      .select()
      .single();

    if (!error) return { data: data as ArenaRow, error: null };

    if ((error as { code?: string }).code !== "23505") {
      return { data: null, error: (error as { message: string }).message };
    }
  }

  return {
    data: null,
    error: "Could not generate a unique slug. Try a different name.",
  };
}

// ─── Add a profile to a custom arena ────────────────────────────────────────

export async function addMemberToArena(
  arenaId: string,
  profileId: string,
  addedBy: string,
  status: "approved" | "pending" = "approved"
): Promise<{ error: string | null }> {
  const client = db();

  const { error: memberError } = await client
    .from("arena_members")
    .insert({ arena_id: arenaId, profile_id: profileId, added_by: addedBy, status });

  if (memberError && (memberError as { code?: string }).code !== "23505") {
    return { error: (memberError as { message: string }).message };
  }

  const { error: statsError } = await client
    .from("arena_profile_stats")
    .insert({ arena_id: arenaId, profile_id: profileId, elo_rating: 1200 });

  if (statsError && (statsError as { code?: string }).code !== "23505") {
    return { error: (statsError as { message: string }).message };
  }

  return { error: null };
}

// ─── Remove a profile from a custom arena ───────────────────────────────────

export async function removeMemberFromArena(
  arenaId: string,
  profileId: string
): Promise<{ error: string | null }> {
  const client = db();

  const { error } = await client
    .from("arena_members")
    .delete()
    .eq("arena_id", arenaId)
    .eq("profile_id", profileId);

  return { error: (error as { message: string } | null)?.message ?? null };
}

// ─── Search profiles by name ─────────────────────────────────────────────────

export async function searchProfiles(
  query: string,
  limit = 10
): Promise<{
  id: string;
  name: string;
  image_url: string | null;
  category: string | null;
}[]> {
  const client = db();
  const { data } = await client
    .from("profiles")
    .select("id, name, image_url, category")
    .ilike("name", `%${query}%`)
    .limit(limit);
  return (data ?? []) as {
    id: string;
    name: string;
    image_url: string | null;
    category: string | null;
  }[];
}

// ─── Fetch any profile by ID (for player profile pages) ──────────────────────

export async function getProfileById(id: string): Promise<ArenaProfile | null> {
  const client = db();
  const { data } = await client
    .from("profiles")
    .select(
      "id, user_id, name, image_url, image_urls, wikipedia_slug, category, categories, elo_rating, total_wins, total_losses, total_matches, height_in, weight_lbs, country, gender"
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  type R = {
    id: string; user_id: string | null; name: string; image_url: string | null; image_urls: string[] | null;
    wikipedia_slug: string | null; category: string | null; categories: string[] | null;
    elo_rating: number; total_wins: number; total_losses: number; total_matches: number;
    height_in: number | null; weight_lbs: number | null; country: string | null; gender: string | null;
  };
  const p = data as R;
  return {
    id: p.id,
    user_id: p.user_id ?? null,
    name: p.name,
    image_url: p.image_url,
    image_urls: p.image_urls ?? (p.image_url ? [p.image_url] : []),
    wikipedia_slug: p.wikipedia_slug,
    category: p.category,
    categories: p.categories ?? (p.category ? [p.category] : []),
    elo_rating: p.elo_rating,
    wins: p.total_wins,
    losses: p.total_losses,
    matches: p.total_matches,
    height_in: p.height_in ?? null,
    weight_lbs: p.weight_lbs ?? null,
    country: p.country ?? null,
    gender: p.gender ?? null,
  };
}

// ─── Global rank: how many profiles have a higher global ELO ─────────────────

export async function getMyGlobalRank(profileId: string): Promise<number | null> {
  const client = db();
  // Get user's own global ELO
  const { data: me } = await client
    .from("profiles")
    .select("elo_rating")
    .eq("id", profileId)
    .maybeSingle();
  if (!me) return null;
  // Count how many profiles have strictly higher ELO
  const { count } = await client
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gt("elo_rating", (me as { elo_rating: number }).elo_rating);
  return (count ?? 0) + 1;
}

// ─── Get user's vote for a specific pair (across all arenas) ─────────────────
// Returns the winner_id (the profile the user voted for), or null if not voted.

export async function getUserVoteForFeaturedPair(
  userId: string,
  profileAId: string,
  profileBId: string
): Promise<string | null> {
  const client = db();
  // profile_a is always LEAST, profile_b always GREATEST (as stored by record_match)
  const minId = profileAId < profileBId ? profileAId : profileBId;
  const maxId = profileAId < profileBId ? profileBId : profileAId;

  const { data } = await client
    .from("user_votes")
    .select("winner_id")
    .eq("voter_id", userId)
    .eq("profile_a", minId)
    .eq("profile_b", maxId)
    .limit(1)
    .maybeSingle();

  return (data as { winner_id: string } | null)?.winner_id ?? null;
}

// ─── Find a shared arena between two profiles ─────────────────────────────────
// Returns the arena_id of the first arena that contains both profiles, or null.

export async function getSharedArenaId(
  profileAId: string,
  profileBId: string
): Promise<string | null> {
  const client = db();

  const [{ data: aArenas }, { data: bArenas }] = await Promise.all([
    client
      .from("arena_profile_stats")
      .select("arena_id")
      .eq("profile_id", profileAId),
    client
      .from("arena_profile_stats")
      .select("arena_id")
      .eq("profile_id", profileBId),
  ]);

  const aSet = new Set(
    ((aArenas ?? []) as { arena_id: string }[]).map((r) => r.arena_id)
  );

  const shared = ((bArenas ?? []) as { arena_id: string }[]).find((r) =>
    aSet.has(r.arena_id)
  );

  return shared?.arena_id ?? null;
}

// ─── Fetch the auth user's own public profile ─────────────────────────────────

export async function getMyProfile(userId: string): Promise<ArenaProfile | null> {
  const client = db();
  const { data } = await client
    .from("profiles")
    .select("id, name, image_url, image_urls, wikipedia_slug, category, categories, elo_rating, total_wins, total_losses, total_matches, height_in, weight_lbs, country, gender")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  type R = {
    id: string; name: string; image_url: string | null; image_urls: string[] | null;
    wikipedia_slug: string | null; category: string | null; categories: string[] | null;
    elo_rating: number; total_wins: number; total_losses: number; total_matches: number;
    height_in: number | null; weight_lbs: number | null; country: string | null; gender: string | null;
  };
  const p = data as R;
  return {
    id: p.id,
    name: p.name,
    image_url: p.image_url,
    image_urls: p.image_urls ?? (p.image_url ? [p.image_url] : []),
    wikipedia_slug: p.wikipedia_slug,
    category: p.category,
    categories: p.categories ?? (p.category ? [p.category] : []),
    elo_rating: p.elo_rating,
    wins: p.total_wins,
    losses: p.total_losses,
    matches: p.total_matches,
    height_in: p.height_in ?? null,
    weight_lbs: p.weight_lbs ?? null,
    country: p.country ?? null,
    gender: p.gender ?? null,
  };
}

// ─── Daily ELO change for leaderboard tickers ─────────────────────────────────

export async function getDailyEloChanges(
  profileIds: string[]
): Promise<Map<string, number>> {
  if (profileIds.length === 0) return new Map();

  const client = db();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  // Fetch all matches from today involving any of the profiles
  const { data: winnerMatches, error: wErr } = await client
    .from("matches")
    .select("winner_id, winner_elo_after, winner_elo_before")
    .in("winner_id", profileIds)
    .gte("created_at", todayIso);

  const { data: loserMatches, error: lErr } = await client
    .from("matches")
    .select("loser_id, loser_elo_after, loser_elo_before")
    .in("loser_id", profileIds)
    .gte("created_at", todayIso);

  // If queries fail (e.g. created_at column missing), return empty silently
  if (wErr || lErr) return changes;

  const changes = new Map<string, number>();

  if (winnerMatches) {
    for (const m of winnerMatches) {
      const delta = (m.winner_elo_after ?? 0) - (m.winner_elo_before ?? 0);
      changes.set(m.winner_id, (changes.get(m.winner_id) ?? 0) + delta);
    }
  }
  if (loserMatches) {
    for (const m of loserMatches) {
      const delta = (m.loser_elo_after ?? 0) - (m.loser_elo_before ?? 0);
      changes.set(m.loser_id, (changes.get(m.loser_id) ?? 0) + delta);
    }
  }

  return changes;
}
