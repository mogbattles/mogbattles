-- ═══════════════════════════════════════════════════════════════════════════
-- FIX v2: ELO Sync — full consistency across ALL arenas
--
-- CHANGES vs v1:
--   1. Trigger now propagates from EVERY arena (official + custom/moderator),
--      not just is_official arenas.  Custom arenas created by admins/mods will
--      now automatically flow their ELO deltas into "All".
--   2. Trigger now propagates wins / losses / matches to "All" as well as
--      elo_rating.  Previously "All" showed "0W – 0L – 0 battles" even for
--      profiles with hundreds of category-arena votes.
--   3. Backfill recalculates wins / losses / matches (SUM across all arenas)
--      in addition to ELO.
--   4. Backfill includes custom arenas (was: is_official = TRUE only).
--
-- HOW TO RUN: paste the entire file into Supabase → SQL Editor → Run.
--             Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PART 1: Drop old trigger/function ────────────────────────────────────────

DROP TRIGGER  IF EXISTS sync_all_arena_elo ON arena_profile_stats;
DROP FUNCTION IF EXISTS sync_all_arena_elo();


-- ── PART 2: Recreated trigger function ───────────────────────────────────────
-- Fires AFTER INSERT OR UPDATE on arena_profile_stats.
--
-- INSERT → guarantees an "All" row exists at 1200 (no delta yet).
-- UPDATE → applies the exact ELO / wins / losses / matches delta to "All".
--
-- Skips rows that already belong to "All" or "Members" (recursion guard).
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
    -- On INSERT: ensure an "All" row exists at baseline. No delta yet.
    INSERT INTO arena_profile_stats
      (arena_id, profile_id, elo_rating, wins, losses, matches)
    VALUES
      (v_all_arena_id, NEW.profile_id, 1200, 0, 0, 0)
    ON CONFLICT (arena_id, profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


-- ── PART 3: Re-attach trigger ─────────────────────────────────────────────────

CREATE TRIGGER sync_all_arena_elo
AFTER INSERT OR UPDATE ON arena_profile_stats
FOR EACH ROW
EXECUTE FUNCTION sync_all_arena_elo();


-- ── PART 4: Backfill — recalculate "All" from scratch ────────────────────────
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
  WHERE a.slug NOT IN ('all', 'members')   -- includes official + custom arenas
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


-- ── PART 5: Updated admin RPC ─────────────────────────────────────────────────
-- Replaces the v1 version. Now aggregates ALL arenas and syncs
-- wins / losses / matches as well as ELO.

CREATE OR REPLACE FUNCTION admin_fix_elo_sync()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_updated INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

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

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN 'Updated ' || rows_updated || ' rows in All arena (ELO + wins/losses/matches).';
END;
$$;
