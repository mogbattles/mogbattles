-- =============================================================================
-- FIX v3: ELO Sync — complete consistency: arena stats → "all" arena → profiles
--
-- CHANGES vs v2:
--   1. INSERT handler now applies initial ELO delta (previously lost on first vote)
--   2. New trigger: sync_profiles_from_all_arena — automatically propagates
--      "all" arena stats → profiles.elo_rating / total_wins / total_losses /
--      total_matches.  Previously profiles table was NEVER updated by votes.
--   3. admin_fix_elo_sync now also syncs the profiles table after fixing arenas.
--   4. Backfill includes profiles table sync.
--
-- HOW TO RUN: paste the entire file into Supabase → SQL Editor → Run.
--             Safe to run multiple times (idempotent).
-- =============================================================================


-- ── PART 1: Drop old triggers/functions ─────────────────────────────────────

DROP TRIGGER  IF EXISTS sync_all_arena_elo           ON arena_profile_stats;
DROP TRIGGER  IF EXISTS sync_profiles_from_all_arena ON arena_profile_stats;
DROP FUNCTION IF EXISTS sync_all_arena_elo();
DROP FUNCTION IF EXISTS sync_profiles_from_all_arena();


-- ── PART 2: Trigger function — category arenas → "all" arena ────────────────
-- Fires AFTER INSERT OR UPDATE on arena_profile_stats.
--
-- INSERT → applies initial delta from NEW.elo_rating (fixes first-vote bug).
-- UPDATE → applies the exact ELO / wins / losses / matches delta to "All".
--
-- Skips rows that belong to "All" or "Members" (recursion guard).
-- Propagates from ALL other arenas — official AND custom/moderator arenas.

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

  -- ── Propagate from ANY arena (official or custom) → "All" ────────────────
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
    -- FIX (v3): Apply initial delta on INSERT too.
    -- Previously this just created a baseline row at 1200 with DO NOTHING,
    -- which meant the first vote's ELO change was silently dropped.
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


-- ── PART 3: Trigger function — "all" arena → profiles table ─────────────────
-- Fires AFTER INSERT OR UPDATE on arena_profile_stats.
-- Only acts when the changed row belongs to the "all" arena.
-- Syncs elo_rating, total_wins, total_losses, total_matches to the
-- profiles table so that profile pages, global rank, etc. stay current.

CREATE OR REPLACE FUNCTION sync_profiles_from_all_arena()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire for the "all" arena
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


-- ── PART 4: Attach triggers ─────────────────────────────────────────────────

CREATE TRIGGER sync_all_arena_elo
AFTER INSERT OR UPDATE ON arena_profile_stats
FOR EACH ROW
EXECUTE FUNCTION sync_all_arena_elo();

CREATE TRIGGER sync_profiles_from_all_arena
AFTER INSERT OR UPDATE ON arena_profile_stats
FOR EACH ROW
EXECUTE FUNCTION sync_profiles_from_all_arena();


-- ── PART 5: Backfill — recalculate "All" arena from scratch ─────────────────
-- Aggregates ELO deltas AND win/loss/match counts from EVERY arena except
-- "all" and "members" (i.e. official + custom/moderator arenas).
--
-- Formula:  all_elo     = GREATEST(100,  1200 + SUM(arena_elo - 1200))
--           all_wins    = SUM(arena_wins)
--           all_losses  = SUM(arena_losses)
--           all_matches = SUM(arena_matches)

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


-- ── PART 6: Backfill — sync profiles table from "all" arena ─────────────────
-- The new trigger handles this going forward, but we need to backfill existing
-- profiles whose profiles.elo_rating / totals are stale.

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


-- ── PART 7: Updated admin RPC ───────────────────────────────────────────────
-- Replaces the v2 version.  Now also syncs profiles table after fixing arenas.

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

  -- Step 1: Recalculate "all" arena from all category + custom arenas
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
  -- (The trigger also does this, but this is a safety net for the bulk update)
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

  RETURN 'Fixed ' || arena_rows || ' arena rows + ' || profile_rows || ' profile rows (ELO + wins/losses/matches).';
END;
$$;
