-- ═══════════════════════════════════════════════════════════════════════════════
-- ELO Snapshots — Daily ELO tracking for tickers + historical graphs
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Create the snapshots table
CREATE TABLE IF NOT EXISTS elo_snapshots (
  profile_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  snapshot_date date      NOT NULL DEFAULT CURRENT_DATE,
  elo_rating  integer     NOT NULL DEFAULT 1000,
  PRIMARY KEY (profile_id, snapshot_date)
);

-- Index for fast lookups by profile (for history graphs)
CREATE INDEX IF NOT EXISTS idx_elo_snapshots_profile_date
  ON elo_snapshots (profile_id, snapshot_date DESC);

-- 2. RLS: public read, no direct writes (trigger handles inserts)
ALTER TABLE elo_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read elo_snapshots"
  ON elo_snapshots FOR SELECT
  USING (true);

-- 3. Trigger function: on every arena_profile_stats change, upsert today's snapshot
--    We only snapshot the "all" arena ELO (global rating) to keep it simple.
CREATE OR REPLACE FUNCTION snapshot_elo_on_stats_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_all_arena_id uuid;
BEGIN
  -- Find the "all" arena
  SELECT id INTO v_all_arena_id FROM arenas WHERE slug = 'all' LIMIT 1;

  -- Only snapshot when the "all" arena stats change
  IF NEW.arena_id = v_all_arena_id THEN
    INSERT INTO elo_snapshots (profile_id, snapshot_date, elo_rating)
    VALUES (NEW.profile_id, CURRENT_DATE, NEW.elo_rating)
    ON CONFLICT (profile_id, snapshot_date)
    DO UPDATE SET elo_rating = EXCLUDED.elo_rating;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Attach trigger to arena_profile_stats
DROP TRIGGER IF EXISTS trg_snapshot_elo ON arena_profile_stats;
CREATE TRIGGER trg_snapshot_elo
  AFTER INSERT OR UPDATE ON arena_profile_stats
  FOR EACH ROW
  EXECUTE FUNCTION snapshot_elo_on_stats_change();

-- 5. Backfill: reconstruct historical snapshots from matches table
--    For each profile, for each day they had matches, record their final ELO of that day.
--    This uses the last match of each day to get the end-of-day ELO.
INSERT INTO elo_snapshots (profile_id, snapshot_date, elo_rating)
SELECT DISTINCT ON (profile_id, match_date)
  profile_id,
  match_date,
  elo_after
FROM (
  -- Winner perspective
  SELECT
    winner_id AS profile_id,
    created_at::date AS match_date,
    winner_elo_after AS elo_after,
    created_at
  FROM matches
  WHERE created_at IS NOT NULL

  UNION ALL

  -- Loser perspective
  SELECT
    loser_id AS profile_id,
    created_at::date AS match_date,
    loser_elo_after AS elo_after,
    created_at
  FROM matches
  WHERE created_at IS NOT NULL
) combined
ORDER BY profile_id, match_date, created_at DESC
ON CONFLICT (profile_id, snapshot_date)
DO UPDATE SET elo_rating = EXCLUDED.elo_rating;

-- 6. Also snapshot today's current ELO for everyone (baseline)
INSERT INTO elo_snapshots (profile_id, snapshot_date, elo_rating)
SELECT
  aps.profile_id,
  CURRENT_DATE,
  aps.elo_rating
FROM arena_profile_stats aps
JOIN arenas a ON a.id = aps.arena_id
WHERE a.slug = 'all'
ON CONFLICT (profile_id, snapshot_date)
DO UPDATE SET elo_rating = EXCLUDED.elo_rating;
