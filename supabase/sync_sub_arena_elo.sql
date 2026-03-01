-- =============================================================================
-- Sync sub-arena stats to match root arena ELO
--
-- After the unified ELO migration, sub-arena arena_profile_stats rows still
-- have old per-arena ELO values. This syncs them all to the root arena ELO
-- so every view shows the same number.
--
-- Safe to re-run (idempotent).
-- =============================================================================

-- 1. Sync "men" sub-arena stats to match "men" root arena ELO
UPDATE arena_profile_stats sub
SET elo_rating = root.elo_rating
FROM arena_profile_stats root
WHERE root.arena_id = (SELECT id FROM arenas WHERE slug = 'men')
  AND root.profile_id = sub.profile_id
  AND sub.arena_id IN (
    SELECT a.id FROM arenas a
    JOIN categories c ON a.category_id = c.id
    WHERE c.thing_type = 'men' AND c.depth > 0
      AND a.slug NOT IN ('all', 'members', 'men')
  );

-- 2. Sync "women" sub-arena stats to match "women" root arena ELO
UPDATE arena_profile_stats sub
SET elo_rating = root.elo_rating
FROM arena_profile_stats root
WHERE root.arena_id = (SELECT id FROM arenas WHERE slug = 'women')
  AND root.profile_id = sub.profile_id
  AND sub.arena_id IN (
    SELECT a.id FROM arenas a
    JOIN categories c ON a.category_id = c.id
    WHERE c.thing_type = 'women' AND c.depth > 0
      AND a.slug NOT IN ('all', 'members', 'women')
  );

-- 3. Also ensure "all" arena matches root arenas
WITH correct_stats AS (
  SELECT
    aps.profile_id,
    GREATEST(100, 1200 + SUM(aps.elo_rating - 1200)) AS correct_elo
  FROM arena_profile_stats aps
  JOIN arenas a ON a.id = aps.arena_id
  WHERE a.slug IN ('men', 'women')
  GROUP BY aps.profile_id
)
UPDATE arena_profile_stats target
SET elo_rating = cs.correct_elo
FROM correct_stats cs
WHERE target.profile_id = cs.profile_id
  AND target.arena_id = (SELECT id FROM arenas WHERE slug = 'all');

-- 4. Sync profiles table from "all" arena
UPDATE profiles p
SET elo_rating = aps.elo_rating
FROM arena_profile_stats aps
JOIN arenas a ON a.id = aps.arena_id
WHERE a.slug = 'all'
  AND aps.profile_id = p.id;
