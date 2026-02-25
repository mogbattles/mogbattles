/**
 * ─── MogBattles User Role System ─────────────────────────────────────────────
 *
 * ROLES (stored in `user_roles` table, checkbox-style — a user can hold multiple):
 *
 *  member      — Phone-verified account. Gate for social features.
 *  premium     — Subscribed to MogBattles Premium. No ads, boosts, analytics.
 *  moderator   — Approved by an admin. Can approve custom arena profiles into
 *                the global ELO economy and publish articles.
 *  admin       — Developer-level. Full control over all content and users.
 *
 * DERIVED STATUS (computed, not stored):
 *
 *  arenaParticipant — A member who has a linked profile with ≥1 photo uploaded.
 *                     Uploading your photo is sufficient — no separate arena
 *                     approval required. Can post forum threads.
 *
 * CAPABILITY MATRIX:
 *
 *  Action                          | Guest | Member | ArenaPart. | Mod | Admin
 *  ─────────────────────────────────────────────────────────────────────────────
 *  Browse site / vote in battles   |  ✓    |   ✓    |     ✓      |  ✓  |  ✓
 *  Create custom arenas            |  ✗    |   ✓    |     ✓      |  ✓  |  ✓
 *  Comment / like forum posts      |  ✗    |   ✓    |     ✓      |  ✓  |  ✓
 *  Post forum threads              |  ✗    |   ✗    |     ✓      |  ✓  |  ✓
 *  Approve custom profiles → ELO   |  ✗    |   ✗    |     ✗      |  ✓  |  ✓
 *  Write / publish articles        |  ✗    |   ✗    |     ✗      |  ✓  |  ✓
 *  Manage news & About page        |  ✗    |   ✗    |     ✗      |  ✗  |  ✓
 *  Grant / revoke roles            |  ✗    |   ✗    |     ✗      |  ✗  |  ✓
 *  Access admin panel              |  ✗    |   ✗    |     ✗      |  ✗  |  ✓
 *  Premium perks (no ads, boosts)  |  ✗    |   ✗    |     ✗      |  ✗  |  ✓ (auto)
 *
 * MODERATOR REQUEST FLOW:
 *  1. User fills out a moderation request form (name, reason, link to profile).
 *  2. Request lands in `moderator_requests` table with status "pending".
 *  3. Admin reviews in the admin panel and approves/rejects.
 *  4. On approval, an admin-only RPC inserts a row into `user_roles`.
 *
 * PHONE VERIFICATION:
 *  Supabase Phone OTP is used. On successful verification, a trigger or
 *  server action inserts `role = 'member'` into `user_roles` for that user
 *  and sets `profiles.phone_verified = true`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createBrowserClient } from "@supabase/ssr";

export type UserRole = "member" | "premium" | "moderator" | "admin";

export interface UserPermissions {
  roles: Set<UserRole>;
  // Shorthand booleans
  isMember: boolean;
  isPremium: boolean;
  isModerator: boolean;
  isAdmin: boolean;
  isArenaParticipant: boolean; // derived: member + approved arena profile with photo
  // Capability gates
  canVote: boolean;                  // everyone
  canCreateArena: boolean;           // authenticated
  canCommentForum: boolean;          // member+
  canPostThread: boolean;            // arenaParticipant+
  canApproveProfiles: boolean;       // moderator+
  canWriteArticles: boolean;         // moderator+
  canManageNews: boolean;            // admin only
  canEditAbout: boolean;             // admin only
  canAccessAdmin: boolean;           // admin only
  canGrantRoles: boolean;            // admin only
}

function client() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Fetch roles for a user ───────────────────────────────────────────────────
// Uses a SECURITY DEFINER RPC to bypass RLS on user_roles.
// The `get_my_roles()` function always returns only the calling user's rows.

export async function getUserRoles(_userId: string): Promise<UserRole[]> {
  const { data } = await client().rpc("get_my_roles");
  return ((data ?? []) as { role: string }[]).map((r) => r.role as UserRole);
}

// ─── Check whether a user has a profile with ≥1 photo uploaded ───────────────
// Members with a linked profile + at least one photo are Arena Participants.
// No separate arena approval step is required — uploading your photo is enough.

export async function checkArenaParticipant(userId: string): Promise<boolean> {
  const { data: profile } = await client()
    .from("profiles")
    .select("image_url, image_urls")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return false;

  return (
    profile.image_url != null ||
    ((profile.image_urls ?? []).filter(Boolean).length > 0)
  );
}

// ─── Build full permissions object ───────────────────────────────────────────

export function buildPermissions(
  roles: UserRole[],
  isArenaParticipant: boolean,
  isAuthenticated: boolean
): UserPermissions {
  const roleSet = new Set(roles);
  const isMember        = roleSet.has("member");
  const isPremium       = roleSet.has("premium");
  const isModerator     = roleSet.has("moderator");
  const isAdmin         = roleSet.has("admin");

  return {
    roles: roleSet,
    isMember,
    isPremium,
    isModerator,
    isAdmin,
    isArenaParticipant,
    canVote:             true,
    canCreateArena:      isAuthenticated,
    canCommentForum:     isMember || isModerator || isAdmin,
    canPostThread:       isArenaParticipant || isModerator || isAdmin,
    canApproveProfiles:  isModerator || isAdmin,
    canWriteArticles:    isModerator || isAdmin,
    canManageNews:       isAdmin,
    canEditAbout:        isAdmin,
    canAccessAdmin:      isAdmin,
    canGrantRoles:       isAdmin,
  };
}

// ─── Shortcut: load everything for one user ───────────────────────────────────

export async function loadUserPermissions(
  userId: string | null
): Promise<UserPermissions> {
  if (!userId) {
    return buildPermissions([], false, false);
  }
  const [roles, isParticipant] = await Promise.all([
    getUserRoles(userId),
    checkArenaParticipant(userId),
  ]);
  return buildPermissions(roles, isParticipant, true);
}

// ─── Admin: grant / revoke a role ────────────────────────────────────────────

export async function grantRole(
  userId: string,
  role: UserRole,
  grantedBy: string
): Promise<{ error: string | null }> {
  const { error } = await client()
    .from("user_roles")
    .insert({ user_id: userId, role, granted_by: grantedBy });
  if (error && (error as { code?: string }).code === "23505") return { error: null }; // already has it
  return { error: (error as { message: string } | null)?.message ?? null };
}

export async function revokeRole(
  userId: string,
  role: UserRole
): Promise<{ error: string | null }> {
  const { error } = await client()
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", role);
  return { error: (error as { message: string } | null)?.message ?? null };
}

// ─── Submit a moderator request ───────────────────────────────────────────────

export async function submitModeratorRequest(input: {
  userId: string;
  reason: string;
  profileLink?: string;
}): Promise<{ error: string | null }> {
  const { error } = await client()
    .from("moderator_requests")
    .insert({
      user_id: input.userId,
      reason: input.reason,
      profile_link: input.profileLink ?? null,
    });
  return { error: (error as { message: string } | null)?.message ?? null };
}
