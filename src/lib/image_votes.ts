import { createBrowserClient } from "@supabase/ssr";

function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Batch-fetch image vote counts for multiple profiles ──────────────────────

export async function getImageVotesForProfiles(
  profileIds: string[]
): Promise<Map<string, Map<string, number>>> {
  if (profileIds.length === 0) return new Map();
  const client = db();
  const { data } = await client
    .from("profile_image_votes")
    .select("profile_id, image_url")
    .in("profile_id", profileIds);

  const result = new Map<string, Map<string, number>>();
  for (const row of (data ?? []) as { profile_id: string; image_url: string }[]) {
    if (!result.has(row.profile_id)) result.set(row.profile_id, new Map());
    const m = result.get(row.profile_id)!;
    m.set(row.image_url, (m.get(row.image_url) ?? 0) + 1);
  }
  return result;
}

// ─── Get which images the current user voted for on a profile ─────────────────

export async function getMyVotedImages(
  profileId: string,
  userId: string
): Promise<Set<string>> {
  const client = db();
  const { data } = await client
    .from("profile_image_votes")
    .select("image_url")
    .eq("profile_id", profileId)
    .eq("voter_id", userId);
  return new Set(((data ?? []) as { image_url: string }[]).map((r) => r.image_url));
}

// ─── Merge + sort image URLs by vote count (client-side, no DB write needed) ──
// Returns: all known URLs (existing + any that have been voted on) sorted by
// vote count descending. URLs with equal votes preserve their original order.
//
// This is the canonical display order — call this before rendering ProfileCard.

export function sortImageUrlsByVotes(
  baseUrls: string[],
  voteCounts: Map<string, number>
): string[] {
  // Merge: base URLs + any voted URLs not already included
  const allUrls = [
    ...new Set([...baseUrls, ...Array.from(voteCounts.keys())]),
  ].filter(Boolean);

  if (allUrls.length <= 1) return allUrls;

  // Stable sort: highest vote count first; equal counts keep original relative order
  return [...allUrls].sort(
    (a, b) => (voteCounts.get(b) ?? 0) - (voteCounts.get(a) ?? 0)
  );
}

// ─── Attempt to persist sorted image order back to the profiles table ─────────
// NOTE: This will only succeed if the browser client has UPDATE permission on
// the profiles row (e.g., own profile, or permissive RLS policy). For celebrity
// profiles this silently does nothing — the client-side sort via
// sortImageUrlsByVotes() handles display ordering in the meantime.

export async function updateProfileImageOrder(profileId: string): Promise<void> {
  const client = db();

  // Count votes per image URL for this profile
  const { data: votes } = await client
    .from("profile_image_votes")
    .select("image_url")
    .eq("profile_id", profileId);

  const voteCounts = new Map<string, number>();
  for (const row of (votes ?? []) as { image_url: string }[]) {
    voteCounts.set(row.image_url, (voteCounts.get(row.image_url) ?? 0) + 1);
  }

  if (voteCounts.size === 0) return;

  // Get current image_urls from profile
  const { data: profileRow } = await client
    .from("profiles")
    .select("image_urls, image_url")
    .eq("id", profileId)
    .maybeSingle();

  if (!profileRow) return;

  const pr = profileRow as { image_urls: string[] | null; image_url: string | null };
  const currentUrls: string[] =
    pr.image_urls ?? (pr.image_url ? [pr.image_url] : []);

  // Merge existing URLs with any voted URLs not yet in the array
  const sorted = sortImageUrlsByVotes(currentUrls, voteCounts);

  // Only write if something changed
  const changed =
    sorted.length !== currentUrls.length ||
    sorted.some((url, i) => url !== currentUrls[i]);
  if (!changed) return;

  // Best-effort update — will succeed for profile owners / admins, silently fail for others
  await client
    .from("profiles")
    .update({ image_urls: sorted, image_url: sorted[0] ?? null })
    .eq("id", profileId);
}

// ─── Toggle vote for an image ─────────────────────────────────────────────────

export async function toggleImageVote(
  profileId: string,
  imageUrl: string,
  userId: string,
  currentlyVoted: boolean
): Promise<{ error: string | null }> {
  const client = db();

  if (currentlyVoted) {
    const { error } = await client
      .from("profile_image_votes")
      .delete()
      .eq("profile_id", profileId)
      .eq("image_url", imageUrl)
      .eq("voter_id", userId);
    if (error) return { error: (error as { message: string }).message };
  } else {
    const { error } = await client
      .from("profile_image_votes")
      .insert({ profile_id: profileId, image_url: imageUrl, voter_id: userId });
    // 23505 = unique_violation: already voted — treat as success
    if (error && (error as { code?: string }).code !== "23505") {
      return { error: (error as { message: string }).message };
    }
  }

  // Best-effort: try to persist sorted order to the profiles table.
  // Works for profile owners / admins; silently no-ops for others.
  // The authoritative display ordering is done client-side via sortImageUrlsByVotes().
  updateProfileImageOrder(profileId).catch(() => {/* ignore permission errors */});

  return { error: null };
}
