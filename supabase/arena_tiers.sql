-- =============================================================================
-- Arena Tier System — three-tier arenas with ELO propagation control
--
-- TIERS:
--   official   — Admin-created, always affects global ELO
--   moderator  — Moderator-created, affects category-level ELO (trusted)
--   custom     — User-created, affects ELO for beta (all profiles pre-exist)
--
-- KEY CHANGES:
--   1. New columns: arena_tier (text enum), affects_elo (boolean)
--   2. Sync trigger keeps is_official in sync with arena_tier = 'official'
--   3. ELO sync trigger now checks affects_elo before propagating
--   4. RLS guard: only admins can change arena_tier / affects_elo
--   5. Updated admin_fix_elo_sync to respect affects_elo
--
-- HOW TO RUN: paste into Supabase → SQL Editor → Run.
--             Safe to run multiple times (idempotent).
-- =============================================================================


-- ── PART 1: Add arena_tier and affects_elo columns ──────────────────────────

-- Drop the constraint if re-running
ALTER TABLE arenas DROP CONSTRAINT IF EXISTS arenas_arena_tier_check;

-- Add columns (IF NOT EXISTS for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'arenas' AND column_name = 'arena_tier'
  ) THEN
    ALTER TABLE arenas ADD COLUMN arena_tier text NOT NULL DEFAULT 'custom';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'arenas' AND column_name = 'affects_elo'
  ) THEN
    ALTER TABLE arenas ADD COLUMN affects_elo boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Add CHECK constraint
ALTER TABLE arenas ADD CONSTRAINT arenas_arena_tier_check
  CHECK (arena_tier IN ('official', 'moderator', 'custom'));

-- Index for filtering by tier
CREATE INDEX IF NOT EXISTS idx_arenas_tier ON arenas(arena_tier);


-- ── PART 2: Migrate existing data ───────────────────────────────────────────

UPDATE arenas SET arena_tier = 'official' WHERE is_official = true;
UPDATE arenas SET arena_tier = 'custom'   WHERE is_official = false;

-- Beta: all arenas affect ELO (users can only use existing profiles)
UPDATE arenas SET affects_elo = true;


-- ── PART 3: Keep is_official in sync with arena_tier ────────────────────────
-- This avoids changing the 12+ files that reference is_official.

DROP TRIGGER IF EXISTS sync_is_official_from_tier ON arenas;
DROP FUNCTION IF EXISTS sync_is_official_from_tier();

CREATE OR REPLACE FUNCTION sync_is_official_from_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_official := (NEW.arena_tier = 'official');
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_is_official_from_tier
BEFORE INSERT OR UPDATE OF arena_tier ON arenas
FOR EACH ROW
EXECUTE FUNCTION sync_is_official_from_tier();


-- ── PART 4: RLS guard — only admins can change tier/affects_elo ─────────────
-- Non-admin users can still update other arena fields (name, description, etc.)
-- but arena_tier and affects_elo silently revert to their original values.

DROP TRIGGER IF EXISTS guard_arena_tier_changes ON arenas;
DROP FUNCTION IF EXISTS guard_arena_tier_changes();

CREATE OR REPLACE FUNCTION guard_arena_tier_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.arena_tier IS DISTINCT FROM NEW.arena_tier
      OR OLD.affects_elo IS DISTINCT FROM NEW.affects_elo)
     AND NOT public.is_admin()
  THEN
    -- Silently revert: non-admins cannot change these fields
    NEW.arena_tier := OLD.arena_tier;
    NEW.affects_elo := OLD.affects_elo;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_arena_tier_changes
BEFORE UPDATE ON arenas
FOR EACH ROW
EXECUTE FUNCTION guard_arena_tier_changes();


-- ── PART 5: Updated ELO sync trigger with affects_elo guard ─────────────────
-- Replaces the v3 sync_all_arena_elo function.
-- Only change: added affects_elo check after the recursion guard.

DROP TRIGGER  IF EXISTS sync_all_arena_elo           ON arena_profile_stats;
DROP TRIGGER  IF EXISTS sync_profiles_from_all_arena ON arena_profile_stats;
DROP FUNCTION IF EXISTS sync_all_arena_elo();
DROP FUNCTION IF EXISTS sync_profiles_from_all_arena();

CREATE OR REPLACE FUNCTION sync_all_arena_elo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all_arena_id UUID;
  v_elo_delta    INT;
  v_win_delta    INT;
  v_loss_delta   INT;
  v_match_delta  INT;
BEGIN
  -- Resolve the "all" arena ID once
  SELECT id INTO v_all_arena_id
  FROM arenas
  WHERE slug = 'all'
  LIMIT 1;

  IF v_all_arena_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Recursion guard ──────────────────────────────────────────────────────
  -- Skip rows belonging to "all" or "members" — those are aggregate arenas,
  -- not source arenas, and must never trigger further propagation.
  IF EXISTS (
    SELECT 1 FROM arenas
    WHERE id = NEW.arena_id
      AND slug IN ('all', 'members')
  ) THEN
    RETURN NEW;
  END IF;

  -- ── NEW: affects_elo guard ─────────────────────────────────────────────
  -- Skip arenas that don't affect the global ELO economy.
  -- This is the key arena tier control: custom arenas with user-created
  -- profiles (future) will have affects_elo = FALSE.
  IF NOT EXISTS (
    SELECT 1 FROM arenas
    WHERE id = NEW.arena_id
      AND affects_elo = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  -- ── Propagate from affects_elo arenas → "All" ─────────────────────────
  IF TG_OP = 'UPDATE' THEN
    v_elo_delta   := NEW.elo_rating - OLD.elo_rating;
    v_win_delta   := NEW.wins       - OLD.wins;
    v_loss_delta  := NEW.losses     - OLD.losses;
    v_match_delta := NEW.matches    - OLD.matches;

    INSERT INTO arena_profile_stats
      (arena_id, profile_id, elo_rating, wins, losses, matches)
    VALUES
      (v_all_arena_id, NEW.profile_id,
       1200 + v_elo_delta, v_win_delta, v_loss_delta, v_match_delta)
    ON CONFLICT (arena_id, profile_id) DO UPDATE
      SET elo_rating = arena_profile_stats.elo_rating + v_elo_delta,
          wins       = arena_profile_stats.wins       + v_win_delta,
          losses     = arena_profile_stats.losses     + v_loss_delta,
          matches    = arena_profile_stats.matches    + v_match_delta;

  ELSIF TG_OP = 'INSERT' THEN
    v_elo_delta   := NEW.elo_rating - 1200;
    v_win_delta   := NEW.wins;
    v_loss_delta  := NEW.losses;
    v_match_delta := NEW.matches;

    INSERT INTO arena_profile_stats
      (arena_id, profile_id, elo_rating, wins, losses, matches)
    VALUES
      (v_all_arena_id, NEW.profile_id,
       1200 + v_elo_delta, v_win_delta, v_loss_delta, v_match_delta)
    ON CONFLICT (arena_id, profile_id) DO UPDATE
      SET elo_rating = arena_profile_stats.elo_rating + v_elo_delta,
          wins       = arena_profile_stats.wins       + v_win_delta,
          losses     = arena_profile_stats.losses     + v_loss_delta,
          matches    = arena_profile_stats.matches    + v_match_delta;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the profiles sync trigger (unchanged from v3)
CREATE OR REPLACE FUNCTION sync_profiles_from_all_arena()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM arenas WHERE id = NEW.arena_id AND slug = 'all'
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE profiles
  SET elo_rating    = NEW.elo_rating,
      total_wins    = NEW.wins,
      total_losses  = NEW.losses,
      total_matches = NEW.matches
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

-- Attach triggers
CREATE TRIGGER sync_all_arena_elo
AFTER INSERT OR UPDATE ON arena_profile_stats
FOR EACH ROW
EXECUTE FUNCTION sync_all_arena_elo();

CREATE TRIGGER sync_profiles_from_all_arena
AFTER INSERT OR UPDATE ON arena_profile_stats
FOR EACH ROW
EXECUTE FUNCTION sync_profiles_from_all_arena();


-- ── PART 6: Updated admin_fix_elo_sync — respects affects_elo ───────────────

CREATE OR REPLACE FUNCTION admin_fix_elo_sync()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  arena_rows   INT;
  profile_rows INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Step 1: Recalculate "all" arena — only from arenas that affect ELO
  WITH correct_stats AS (
    SELECT
      aps.profile_id,
      GREATEST(100, 1200 + SUM(aps.elo_rating - 1200)) AS correct_elo,
      SUM(aps.wins)    AS total_wins,
      SUM(aps.losses)  AS total_losses,
      SUM(aps.matches) AS total_matches
    FROM arena_profile_stats aps
    JOIN arenas a ON a.id = aps.arena_id
    WHERE a.slug NOT IN ('all', 'members')
      AND a.affects_elo = TRUE
    GROUP BY aps.profile_id
  )
  UPDATE arena_profile_stats target
  SET
    elo_rating = cs.correct_elo,
    wins       = cs.total_wins,
    losses     = cs.total_losses,
    matches    = cs.total_matches
  FROM correct_stats cs
  WHERE target.profile_id = cs.profile_id
    AND target.arena_id   = (SELECT id FROM arenas WHERE slug = 'all');

  GET DIAGNOSTICS arena_rows = ROW_COUNT;

  -- Step 2: Sync profiles table from "all" arena
  UPDATE profiles p
  SET
    elo_rating    = aps.elo_rating,
    total_wins    = aps.wins,
    total_losses  = aps.losses,
    total_matches = aps.matches
  FROM arena_profile_stats aps
  JOIN arenas a ON a.id = aps.arena_id
  WHERE a.slug = 'all'
    AND aps.profile_id = p.id;

  GET DIAGNOSTICS profile_rows = ROW_COUNT;

  RETURN 'Fixed ' || arena_rows || ' arena rows + ' || profile_rows || ' profile rows (ELO + wins/losses/matches). Only affects_elo=true arenas included.';
END;
$$;
