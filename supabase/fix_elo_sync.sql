-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: ELO Synchronisation — "All" arena must always reflect votes cast in
--      every official category arena.
--
-- DESIGN:
--   • Each category arena (actors, streamers, …) tracks its own ELO.
--   • The "All" arena accumulates the delta from ALL category arenas:
--       all_elo = 1200 + SUM(category_elo - 1200)  for every category arena
--               where this profile has a stats row.
--   • When a vote fires in any official category arena, the same ELO delta
--     is applied to the "All" arena via the trigger below.
--
-- HOW TO RUN: paste the entire file into Supabase → SQL Editor → Run.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PART 1: Drop old trigger/function (may or may not exist) ─────────────────

DROP TRIGGER IF EXISTS sync_all_arena_elo ON arena_profile_stats;
DROP FUNCTION IF EXISTS sync_all_arena_elo();


-- ── PART 2: Create the correct trigger function ───────────────────────────────
-- Fires AFTER INSERT OR UPDATE on arena_profile_stats.
-- • INSERT → guarantees a matching row in the "All" arena (at 1200, no delta yet).
-- • UPDATE → applies the exact ELO delta to the "All" arena row.
-- Both paths skip when the row being changed IS the "All" or "Members" arena
-- (prevents infinite recursion and keeps Members arena independent).

CREATE OR REPLACE FUNCTION sync_all_arena_elo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all_arena_id UUID;
  v_elo_delta    INT;
BEGIN
  -- Resolve the "all" arena ID once
  SELECT id INTO v_all_arena_id
  FROM arenas
  WHERE slug = 'all'
  LIMIT 1;

  -- If "all" arena doesn't exist yet, nothing to do
  IF v_all_arena_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Recursion guard ──────────────────────────────────────────────────────
  -- Skip rows that already belong to "all" or "members" arenas
  IF NEW.arena_id = v_all_arena_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM arenas WHERE id = NEW.arena_id AND slug = 'members') THEN
    RETURN NEW;
  END IF;

  -- ── Official-only guard ──────────────────────────────────────────────────
  -- Only propagate for official category arenas; ignore custom community arenas
  IF NOT EXISTS (
    SELECT 1 FROM arenas
    WHERE id = NEW.arena_id
      AND is_official = TRUE
  ) THEN
    RETURN NEW;
  END IF;

  -- ── Propagate ────────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN
    v_elo_delta := NEW.elo_rating - OLD.elo_rating;

    -- Apply delta to "all" arena (upsert handles the case where no row exists yet)
    INSERT INTO arena_profile_stats
      (arena_id, profile_id, elo_rating, wins, losses, matches)
    VALUES
      (v_all_arena_id, NEW.profile_id, 1200 + v_elo_delta, 0, 0, 0)
    ON CONFLICT (arena_id, profile_id) DO UPDATE
      SET elo_rating = arena_profile_stats.elo_rating + v_elo_delta;

  ELSIF TG_OP = 'INSERT' THEN
    -- On INSERT: ensure an "all" arena row exists for this profile at 1200.
    -- Do NOT add a delta here — no votes have been cast yet.
    INSERT INTO arena_profile_stats
      (arena_id, profile_id, elo_rating, wins, losses, matches)
    VALUES
      (v_all_arena_id, NEW.profile_id, 1200, 0, 0, 0)
    ON CONFLICT (arena_id, profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


-- ── PART 3: Attach trigger ────────────────────────────────────────────────────

CREATE TRIGGER sync_all_arena_elo
AFTER INSERT OR UPDATE ON arena_profile_stats
FOR EACH ROW
EXECUTE FUNCTION sync_all_arena_elo();


-- ── PART 4: Backfill — recalculate "all" ELO from scratch ────────────────────
-- Formula: all_elo = GREATEST(100,  1200 + SUM(category_elo - 1200))
--
-- This fixes the 27 profiles whose "all" ELO drifted because:
--   • The old trigger missed some category arena votes (or didn't exist yet).
--   • Some profiles in multiple categories accumulated inconsistent deltas.

WITH correct_elos AS (
  SELECT
    aps.profile_id,
    GREATEST(100, 1200 + SUM(aps.elo_rating - 1200)) AS correct_elo
  FROM arena_profile_stats aps
  JOIN arenas a ON a.id = aps.arena_id
  WHERE a.is_official = TRUE
    AND a.slug NOT IN ('all', 'members')
  GROUP BY aps.profile_id
)
UPDATE arena_profile_stats target
SET    elo_rating = ce.correct_elo
FROM   correct_elos ce
WHERE  target.profile_id = ce.profile_id
  AND  target.arena_id   = (SELECT id FROM arenas WHERE slug = 'all');


-- ── PART 5: RPC wrapper — called by the admin panel "Fix ELO Sync" button ────
-- Allows an authenticated admin to rerun the backfill from the UI without
-- needing direct SQL access.

CREATE OR REPLACE FUNCTION admin_fix_elo_sync()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_updated INT;
BEGIN
  -- Only admins may call this
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH correct_elos AS (
    SELECT
      aps.profile_id,
      GREATEST(100, 1200 + SUM(aps.elo_rating - 1200)) AS correct_elo
    FROM arena_profile_stats aps
    JOIN arenas a ON a.id = aps.arena_id
    WHERE a.is_official = TRUE
      AND a.slug NOT IN ('all', 'members')
    GROUP BY aps.profile_id
  )
  UPDATE arena_profile_stats target
  SET    elo_rating = ce.correct_elo
  FROM   correct_elos ce
  WHERE  target.profile_id = ce.profile_id
    AND  target.arena_id   = (SELECT id FROM arenas WHERE slug = 'all');

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN 'Updated ' || rows_updated || ' rows in All arena.';
END;
$$;
