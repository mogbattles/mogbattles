-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: "All" arena ELO double-counting
--
-- PROBLEM:
--   When a vote happens in e.g. the "actors" arena, record_match writes:
--     1) Root arena ("men") ELO update  → sync trigger → delta to "all"
--     2) Sub-arena ("actors") ELO update → sync trigger → delta to "all" AGAIN
--   This doubles every ELO change in the "all" arena.
--
-- FIX:
--   1) Update sync trigger to ONLY propagate from ROOT arenas + "members"
--      (skip sub-arenas since their root already propagated)
--   2) Recalculate all "all" ELO from root arenas only
--
-- A ROOT arena = an arena where get_root_arena_id(id) returns itself.
--
-- HOW TO RUN: paste into Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PART 1: Fix the sync trigger ────────────────────────────────────────────

DROP TRIGGER IF EXISTS sync_all_arena_elo ON arena_profile_stats;
DROP FUNCTION IF EXISTS sync_all_arena_elo();

CREATE OR REPLACE FUNCTION sync_all_arena_elo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all_arena_id UUID;
  v_elo_delta    INT;
  v_root_id      UUID;
BEGIN
  -- Resolve the "all" arena ID
  SELECT id INTO v_all_arena_id
  FROM arenas WHERE slug = 'all' LIMIT 1;

  IF v_all_arena_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip writes to the "all" arena itself (prevent recursion)
  IF NEW.arena_id = v_all_arena_id THEN
    RETURN NEW;
  END IF;

  -- ── Only propagate from ROOT arenas + members ─────────────────────────
  -- A root arena is one where get_root_arena_id returns itself.
  -- Sub-arenas (actors, models, etc.) are SKIPPED because the root arena
  -- (men, women) already propagates the same vote's delta.

  -- Check if this is the "members" arena (always propagate)
  IF EXISTS (SELECT 1 FROM arenas WHERE id = NEW.arena_id AND slug = 'members') THEN
    -- Members is a root-level arena, propagate
    NULL;  -- fall through to propagation below
  ELSE
    -- For all other arenas: only propagate if it's official AND a root arena
    IF NOT EXISTS (
      SELECT 1 FROM arenas WHERE id = NEW.arena_id AND is_official = TRUE
    ) THEN
      RETURN NEW;  -- not official, skip
    END IF;

    -- Check if this arena IS a root arena (root = self)
    v_root_id := get_root_arena_id(NEW.arena_id);
    IF v_root_id IS DISTINCT FROM NEW.arena_id THEN
      RETURN NEW;  -- it's a sub-arena, skip (root already propagated)
    END IF;
  END IF;

  -- ── Propagate delta to "all" ──────────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN
    v_elo_delta := NEW.elo_rating - OLD.elo_rating;

    INSERT INTO arena_profile_stats
      (arena_id, profile_id, elo_rating, wins, losses, matches)
    VALUES
      (v_all_arena_id, NEW.profile_id, 1200 + v_elo_delta, 0, 0, 0)
    ON CONFLICT (arena_id, profile_id) DO UPDATE
      SET elo_rating = arena_profile_stats.elo_rating + v_elo_delta;

  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO arena_profile_stats
      (arena_id, profile_id, elo_rating, wins, losses, matches)
    VALUES
      (v_all_arena_id, NEW.profile_id, 1200, 0, 0, 0)
    ON CONFLICT (arena_id, profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_all_arena_elo
AFTER INSERT OR UPDATE ON arena_profile_stats
FOR EACH ROW
EXECUTE FUNCTION sync_all_arena_elo();


-- ── PART 2: Recalculate "all" ELO from ROOT arenas only ─────────────────────
-- Only count arenas where get_root_arena_id(id) = id (true root arenas)
-- Plus the "members" arena.

WITH root_arena_ids AS (
  -- Find all root arenas (arenas that ARE their own root)
  SELECT a.id
  FROM arenas a
  WHERE a.is_official = TRUE
    AND a.slug NOT IN ('all', 'members')
    AND get_root_arena_id(a.id) = a.id
  UNION ALL
  -- Include members arena
  SELECT id FROM arenas WHERE slug = 'members'
),
correct_elos AS (
  SELECT
    aps.profile_id,
    GREATEST(100, 1200 + SUM(aps.elo_rating - 1200)) AS correct_elo
  FROM arena_profile_stats aps
  WHERE aps.arena_id IN (SELECT id FROM root_arena_ids)
  GROUP BY aps.profile_id
)
UPDATE arena_profile_stats target
SET    elo_rating = ce.correct_elo
FROM   correct_elos ce
WHERE  target.profile_id = ce.profile_id
  AND  target.arena_id   = (SELECT id FROM arenas WHERE slug = 'all');

-- Also reset anyone who somehow ended up below 100
UPDATE arena_profile_stats
SET elo_rating = 100
WHERE arena_id = (SELECT id FROM arenas WHERE slug = 'all')
  AND elo_rating < 100;
