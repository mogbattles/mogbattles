"use client";

import { createBrowserClient } from "@supabase/ssr";

function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Follow / Unfollow ────────────────────────────────────────────────────────

export async function followUser(
  followerId: string,
  followingId: string
): Promise<{ error: string | null }> {
  const { error } = await db()
    .from("follows")
    .insert({ follower_id: followerId, following_id: followingId });
  return { error: (error as { message: string } | null)?.message ?? null };
}

export async function unfollowUser(
  followerId: string,
  followingId: string
): Promise<{ error: string | null }> {
  const { error } = await db()
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);
  return { error: (error as { message: string } | null)?.message ?? null };
}

// ─── Check relationships ──────────────────────────────────────────────────────

export async function isFollowing(
  followerId: string,
  followingId: string
): Promise<boolean> {
  const { data } = await db()
    .from("follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle();
  return data !== null;
}

export async function isMutualFollow(
  userId: string,
  otherId: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db() as any).rpc("is_mutual_follow", { a: userId, b: otherId });
  return data === true;
}

// ─── Follower / Following lists ───────────────────────────────────────────────

export interface FollowProfile {
  user_id: string;
  name: string;
  image_url: string | null;
  elo_rating: number;
  gender: string | null;
}

// Returns profiles that follow userId
export async function getFollowers(userId: string): Promise<FollowProfile[]> {
  const client = db();
  const { data: followRows } = await client
    .from("follows")
    .select("follower_id")
    .eq("following_id", userId);

  if (!followRows || followRows.length === 0) return [];
  const ids = followRows.map((r) => r.follower_id);

  const { data: profiles } = await client
    .from("profiles")
    .select("user_id, name, image_url, elo_rating, gender")
    .in("user_id", ids);

  return ((profiles ?? []) as FollowProfile[]);
}

// Returns profiles that userId follows
export async function getFollowing(userId: string): Promise<FollowProfile[]> {
  const client = db();
  const { data: followRows } = await client
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (!followRows || followRows.length === 0) return [];
  const ids = followRows.map((r) => r.following_id);

  const { data: profiles } = await client
    .from("profiles")
    .select("user_id, name, image_url, elo_rating, gender")
    .in("user_id", ids);

  return ((profiles ?? []) as FollowProfile[]);
}

// Returns mutual follows = "friends" (both follow each other)
export async function getMutualFollows(userId: string): Promise<FollowProfile[]> {
  const client = db();

  // Get everyone userId follows
  const { data: followingRows } = await client
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  if (!followingRows || followingRows.length === 0) return [];
  const followingIds = followingRows.map((r) => r.following_id);

  // Of those, find who also follows userId back
  const { data: mutualRows } = await client
    .from("follows")
    .select("follower_id")
    .eq("following_id", userId)
    .in("follower_id", followingIds);

  if (!mutualRows || mutualRows.length === 0) return [];
  const mutualIds = mutualRows.map((r) => r.follower_id);

  const { data: profiles } = await client
    .from("profiles")
    .select("user_id, name, image_url, elo_rating, gender")
    .in("user_id", mutualIds);

  return ((profiles ?? []) as FollowProfile[]);
}

// ─── Counts ───────────────────────────────────────────────────────────────────

export async function getFollowCounts(
  userId: string
): Promise<{ followers: number; following: number }> {
  const client = db();
  const [{ count: followers }, { count: following }] = await Promise.all([
    client.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
    client.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return { followers: followers ?? 0, following: following ?? 0 };
}
