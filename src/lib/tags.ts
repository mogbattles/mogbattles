import { createBrowserClient } from "@supabase/ssr";

function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TagEntry {
  tag: string;
  votes: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lowercase, strip special chars, max 30 chars */
export function sanitizeTag(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 30)
    .trim();
}

function groupTagCounts(rows: { tag: string }[]): TagEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.tag, (counts.get(row.tag) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, votes]) => ({ tag, votes }));
}

// ─── Fetch top tags for a single profile ─────────────────────────────────────

export async function getTopTagsForProfile(
  profileId: string,
  limit = 5
): Promise<TagEntry[]> {
  const client = db();
  const { data } = await client
    .from("profile_tag_votes")
    .select("tag")
    .eq("profile_id", profileId);
  return groupTagCounts((data ?? []) as { tag: string }[]).slice(0, limit);
}

// ─── Batch-fetch top 3 tags for multiple profiles (single query) ──────────────

export async function getTopTagsForProfiles(
  profileIds: string[]
): Promise<Map<string, TagEntry[]>> {
  if (profileIds.length === 0) return new Map();
  const client = db();
  const { data } = await client
    .from("profile_tag_votes")
    .select("profile_id, tag")
    .in("profile_id", profileIds);

  const perProfile = new Map<string, { tag: string }[]>();
  for (const row of (data ?? []) as { profile_id: string; tag: string }[]) {
    if (!perProfile.has(row.profile_id)) perProfile.set(row.profile_id, []);
    perProfile.get(row.profile_id)!.push({ tag: row.tag });
  }

  const result = new Map<string, TagEntry[]>();
  for (const [profileId, rows] of perProfile) {
    result.set(profileId, groupTagCounts(rows).slice(0, 3));
  }
  return result;
}

// ─── Vote for (or add) a tag ─────────────────────────────────────────────────

export async function voteForTag(
  profileId: string,
  tag: string,
  userId: string
): Promise<{ error: string | null }> {
  const clean = sanitizeTag(tag);
  if (clean.length < 2) return { error: "Tag must be at least 2 characters" };

  const client = db();
  const { error } = await client
    .from("profile_tag_votes")
    .insert({ profile_id: profileId, tag: clean, voter_id: userId });

  // 23505 = unique_violation: user already voted for this tag — treat as success
  if (error && (error as { code?: string }).code !== "23505") {
    return { error: (error as { message: string }).message };
  }
  return { error: null };
}

// ─── Get which tags the current user already voted for on a profile ───────────

export async function getMyVotedTags(
  profileId: string,
  userId: string
): Promise<Set<string>> {
  const client = db();
  const { data } = await client
    .from("profile_tag_votes")
    .select("tag")
    .eq("profile_id", profileId)
    .eq("voter_id", userId);
  return new Set(((data ?? []) as { tag: string }[]).map((r) => r.tag));
}
