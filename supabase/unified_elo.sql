-- =============================================================================
-- Unified ELO System — One ELO Per Root Thing
--
-- Moves from per-sub-category ELO to a single ELO per root category (Men/Women).
-- All swiping within any sub-category feeds the same root ELO.
-- Sub-category leaderboards become filtered views of the root ELO.
--
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================


-- ── PART 1: Create root category arenas ──────────────────────────────────────

INSERT INTO arenas (name, slug, description, is_official, category_id, arena_tier, affects_elo, visibility, arena_type)
SELECT 'All Men', 'men', 'All male profiles — unified ELO', true, c.id, 'official', true, 'public', 'fixed'
FROM categories c WHERE c.slug = 'men'
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  is_official = true,
  arena_tier = 'official',
  affects_elo = true;

INSERT INTO arenas (name, slug, description, is_official, category_id, arena_tier, affects_elo, visibility, arena_type)
SELECT 'All Women', 'women', 'All female profiles — unified ELO', true, c.id, 'official', true, 'public', 'fixed'
FROM categories c WHERE c.slug = 'women'
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  is_official = true,
  arena_tier = 'official',
  affects_elo = true;


-- ── PART 2: Helper — get_root_arena_id(arena_id) ────────────────────────────
-- Given any arena, resolves to its root category's arena.
-- "all"/"members" → self. Has category_id → walk up to root → find root arena.

CREATE OR REPLACE FUNCTION get_root_arena_id(p_arena_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_root_category_id uuid;
  v_root_arena_id uuid;
  v_arena_slug text;
BEGIN
  -- Special aggregate arenas return themselves
  SELECT slug, category_id INTO v_arena_slug, v_category_id
  FROM arenas WHERE id = p_arena_id;

  IF v_arena_slug IN ('all', 'members') THEN
    RETURN p_arena_id;
  END IF;

  -- No category → can't determine root
  IF v_category_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Walk up the category tree to find root (parent_id IS NULL)
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id FROM categories WHERE id = v_category_id
    UNION ALL
    SELECT c.id, c.parent_id
    FROM categories c
    JOIN ancestors a ON c.id = a.parent_id
  )
  SELECT id INTO v_root_category_id
  FROM ancestors
  WHERE parent_id IS NULL;

  -- If already at root
  IF v_root_category_id IS NULL THEN
    v_root_category_id := v_category_id;
  END IF;

  -- Find the official arena for this root category
  SELECT id INTO v_root_arena_id
  FROM arenas
  WHERE category_id = v_root_category_id
    AND is_official = true
  LIMIT 1;

  RETURN v_root_arena_id;
END;
$$;


-- ── PART 3: Helper — get_root_arena_id_for_profile(profile_id) ──────────────
-- For arenas with no category_id: determine root from the profile's categories.

CREATE OR REPLACE FUNCTION get_root_arena_id_for_profile(p_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root_arena_id uuid;
BEGIN
  -- Find root category for this profile, then its arena
  WITH profile_cat AS (
    SELECT category_id FROM profile_categories
    WHERE profile_id = p_profile_id
    LIMIT 1
  ),
  root_cat AS (
    SELECT a.id AS root_id
    FROM profile_cat pc
    CROSS JOIN LATERAL (
      WITH RECURSIVE chain AS (
        SELECT id, parent_id FROM categories WHERE id = pc.category_id
        UNION ALL
        SELECT c.id, c.parent_id FROM categories c JOIN chain ch ON c.id = ch.parent_id
      )
      SELECT id FROM chain WHERE parent_id IS NULL
    ) a
    LIMIT 1
  )
  SELECT ar.id INTO v_root_arena_id
  FROM root_cat rc
  JOIN arenas ar ON ar.category_id = rc.root_id AND ar.is_official = true
  LIMIT 1;

  RETURN v_root_arena_id;
END;
$$;


-- ── PART 4: Modified record_match ────────────────────────────────────────────
-- Core change: resolves root arena before ELO calculation.
-- ELO is stored on the root arena's arena_profile_stats row.
-- Match history still records the original arena_id.

-- Drop existing function first (return type changed)
DROP FUNCTION IF EXISTS record_match(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION record_match(
  p_arena_id uuid,
  p_winner_id uuid,
  p_loser_id uuid,
  p_voter_id uuid DEFAULT NULL
)
RETURNS TABLE(
  winner_elo_before int,
  winner_elo_after int,
  loser_elo_before int,
  loser_elo_after int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root_arena_id uuid;
  v_arena_slug text;
  v_w_elo int;
  v_l_elo int;
  v_w_new int;
  v_l_new int;
  v_expected_w float;
  v_k int := 32;
  -- Arena-specific ELO (independent calculation per sub-arena)
  v_aw_elo int;
  v_al_elo int;
  v_aw_new int;
  v_al_new int;
  v_a_expected_w float;
BEGIN
  -- ── Resolve root arena for ELO ──────────────────────────────────────────
  SELECT slug INTO v_arena_slug FROM arenas WHERE id = p_arena_id;

  IF v_arena_slug = 'all' THEN
    -- "all" arena: determine root from winner's profile
    v_root_arena_id := get_root_arena_id_for_profile(p_winner_id);
  ELSE
    v_root_arena_id := get_root_arena_id(p_arena_id);
  END IF;

  -- Fallback for custom arenas with no category
  IF v_root_arena_id IS NULL THEN
    v_root_arena_id := get_root_arena_id_for_profile(p_winner_id);
  END IF;

  -- Final fallback: use original arena (isolated ELO)
  IF v_root_arena_id IS NULL THEN
    v_root_arena_id := p_arena_id;
  END IF;

  -- ── Get current ELOs from ROOT arena ────────────────────────────────────
  SELECT COALESCE(
    (SELECT elo_rating FROM arena_profile_stats
     WHERE arena_id = v_root_arena_id AND profile_id = p_winner_id),
    1200
  ) INTO v_w_elo;

  SELECT COALESCE(
    (SELECT elo_rating FROM arena_profile_stats
     WHERE arena_id = v_root_arena_id AND profile_id = p_loser_id),
    1200
  ) INTO v_l_elo;

  -- ── ELO calculation ─────────────────────────────────────────────────────
  v_expected_w := 1.0 / (1.0 + power(10.0, (v_l_elo - v_w_elo)::float / 400.0));
  v_w_new := v_w_elo + round(v_k * (1.0 - v_expected_w))::int;
  v_l_new := v_l_elo + round(v_k * (0.0 - (1.0 - v_expected_w)))::int;

  -- Floor at 100
  v_w_new := GREATEST(100, v_w_new);
  v_l_new := GREATEST(100, v_l_new);

  -- ── Upsert ROOT arena stats for winner ──────────────────────────────────
  INSERT INTO arena_profile_stats (arena_id, profile_id, elo_rating, wins, losses, matches)
  VALUES (v_root_arena_id, p_winner_id, v_w_new, 1, 0, 1)
  ON CONFLICT (arena_id, profile_id) DO UPDATE
    SET elo_rating = v_w_new,
        wins       = arena_profile_stats.wins + 1,
        matches    = arena_profile_stats.matches + 1;

  -- ── Upsert ROOT arena stats for loser ───────────────────────────────────
  INSERT INTO arena_profile_stats (arena_id, profile_id, elo_rating, wins, losses, matches)
  VALUES (v_root_arena_id, p_loser_id, v_l_new, 0, 1, 1)
  ON CONFLICT (arena_id, profile_id) DO UPDATE
    SET elo_rating = v_l_new,
        losses     = arena_profile_stats.losses + 1,
        matches    = arena_profile_stats.matches + 1;

  -- ── Arena-specific ELO (independent per sub-arena) ──────────────────────
  -- When swiping in a sub-arena, also maintain that arena's own ELO ladder.
  -- This lets users toggle between "Global ELO" and "Arena ELO" on leaderboards.
  IF v_root_arena_id IS DISTINCT FROM p_arena_id THEN
    SELECT COALESCE(
      (SELECT elo_rating FROM arena_profile_stats
       WHERE arena_id = p_arena_id AND profile_id = p_winner_id),
      1200
    ) INTO v_aw_elo;

    SELECT COALESCE(
      (SELECT elo_rating FROM arena_profile_stats
       WHERE arena_id = p_arena_id AND profile_id = p_loser_id),
      1200
    ) INTO v_al_elo;

    v_a_expected_w := 1.0 / (1.0 + power(10.0, (v_al_elo - v_aw_elo)::float / 400.0));
    v_aw_new := GREATEST(100, v_aw_elo + round(v_k * (1.0 - v_a_expected_w))::int);
    v_al_new := GREATEST(100, v_al_elo + round(v_k * (0.0 - (1.0 - v_a_expected_w)))::int);

    INSERT INTO arena_profile_stats (arena_id, profile_id, elo_rating, wins, losses, matches)
    VALUES (p_arena_id, p_winner_id, v_aw_new, 1, 0, 1)
    ON CONFLICT (arena_id, profile_id) DO UPDATE
      SET elo_rating = v_aw_new,
          wins       = arena_profile_stats.wins + 1,
          matches    = arena_profile_stats.matches + 1;

    INSERT INTO arena_profile_stats (arena_id, profile_id, elo_rating, wins, losses, matches)
    VALUES (p_arena_id, p_loser_id, v_al_new, 0, 1, 1)
    ON CONFLICT (arena_id, profile_id) DO UPDATE
      SET elo_rating = v_al_new,
          losses     = arena_profile_stats.losses + 1,
          matches    = arena_profile_stats.matches + 1;
  END IF;

  -- ── Record match history (original arena for audit) ─────────────────────
  INSERT INTO matches (winner_id, loser_id, winner_elo_before, loser_elo_before,
                       winner_elo_after, loser_elo_after, arena_id)
  VALUES (p_winner_id, p_loser_id, v_w_elo, v_l_elo, v_w_new, v_l_new, p_arena_id);

  -- ── Record user vote (original arena for history) ───────────────────────
  IF p_voter_id IS NOT NULL THEN
    INSERT INTO user_votes (voter_id, arena_id, profile_a, profile_b, winner_id)
    VALUES (
      p_voter_id,
      p_arena_id,
      LEAST(p_winner_id, p_loser_id),
      GREATEST(p_winner_id, p_loser_id),
      p_winner_id
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── Return elo deltas ──────────────────────────────────────────────────
  RETURN QUERY SELECT v_w_elo, v_w_new, v_l_elo, v_l_new;
END;
$$;


-- ── PART 5: Update sync trigger — root arenas → "all" ───────────────────────
-- The existing sync_all_arena_elo trigger still works: it propagates any
-- non-"all"/non-"members" arena stats to "all". Since record_match now writes
-- to root arenas ("men", "women"), the trigger naturally propagates root → "all".
-- We just need to update the recursion guard to also skip root arena slugs
-- from triggering further propagation to themselves.
-- (No change needed — the trigger already skips "all"/"members" and propagates
-- everything else to "all". Root arenas propagate to "all" correctly.)


-- ── PART 6: Backfill — merge sub-arena stats into root arenas ───────────────

-- 6a. Merge all "men" sub-arena stats into the "men" root arena
WITH men_root AS (
  SELECT id FROM arenas WHERE slug = 'men'
),
men_descendant_cats AS (
  SELECT id FROM categories WHERE thing_type = 'men' AND depth > 0
),
men_sub_arenas AS (
  SELECT a.id AS arena_id
  FROM arenas a
  WHERE a.category_id IN (SELECT id FROM men_descendant_cats)
    AND a.slug NOT IN ('all', 'members', 'men')
),
merged AS (
  SELECT
    aps.profile_id,
    GREATEST(100, 1200 + SUM(aps.elo_rating - 1200)) AS merged_elo,
    SUM(aps.wins)    AS merged_wins,
    SUM(aps.losses)  AS merged_losses,
    SUM(aps.matches) AS merged_matches
  FROM arena_profile_stats aps
  WHERE aps.arena_id IN (SELECT arena_id FROM men_sub_arenas)
  GROUP BY aps.profile_id
)
INSERT INTO arena_profile_stats (arena_id, profile_id, elo_rating, wins, losses, matches)
SELECT
  (SELECT id FROM men_root),
  m.profile_id,
  m.merged_elo,
  m.merged_wins,
  m.merged_losses,
  m.merged_matches
FROM merged m
ON CONFLICT (arena_id, profile_id) DO UPDATE
SET elo_rating = EXCLUDED.elo_rating,
    wins       = EXCLUDED.wins,
    losses     = EXCLUDED.losses,
    matches    = EXCLUDED.matches;

-- 6b. Merge all "women" sub-arena stats into the "women" root arena
WITH women_root AS (
  SELECT id FROM arenas WHERE slug = 'women'
),
women_descendant_cats AS (
  SELECT id FROM categories WHERE thing_type = 'women' AND depth > 0
),
women_sub_arenas AS (
  SELECT a.id AS arena_id
  FROM arenas a
  WHERE a.category_id IN (SELECT id FROM women_descendant_cats)
    AND a.slug NOT IN ('all', 'members', 'women')
),
merged AS (
  SELECT
    aps.profile_id,
    GREATEST(100, 1200 + SUM(aps.elo_rating - 1200)) AS merged_elo,
    SUM(aps.wins)    AS merged_wins,
    SUM(aps.losses)  AS merged_losses,
    SUM(aps.matches) AS merged_matches
  FROM arena_profile_stats aps
  WHERE aps.arena_id IN (SELECT arena_id FROM women_sub_arenas)
  GROUP BY aps.profile_id
)
INSERT INTO arena_profile_stats (arena_id, profile_id, elo_rating, wins, losses, matches)
SELECT
  (SELECT id FROM women_root),
  m.profile_id,
  m.merged_elo,
  m.merged_wins,
  m.merged_losses,
  m.merged_matches
FROM merged m
ON CONFLICT (arena_id, profile_id) DO UPDATE
SET elo_rating = EXCLUDED.elo_rating,
    wins       = EXCLUDED.wins,
    losses     = EXCLUDED.losses,
    matches    = EXCLUDED.matches;


-- ── PART 7: Recalculate "all" arena from root arenas only ───────────────────

WITH correct_stats AS (
  SELECT
    aps.profile_id,
    GREATEST(100, 1200 + SUM(aps.elo_rating - 1200)) AS correct_elo,
    SUM(aps.wins)    AS total_wins,
    SUM(aps.losses)  AS total_losses,
    SUM(aps.matches) AS total_matches
  FROM arena_profile_stats aps
  JOIN arenas a ON a.id = aps.arena_id
  WHERE a.slug IN ('men', 'women')
  GROUP BY aps.profile_id
)
INSERT INTO arena_profile_stats (arena_id, profile_id, elo_rating, wins, losses, matches)
SELECT
  (SELECT id FROM arenas WHERE slug = 'all'),
  cs.profile_id,
  cs.correct_elo,
  cs.total_wins,
  cs.total_losses,
  cs.total_matches
FROM correct_stats cs
ON CONFLICT (arena_id, profile_id) DO UPDATE
SET elo_rating = EXCLUDED.elo_rating,
    wins       = EXCLUDED.wins,
    losses     = EXCLUDED.losses,
    matches    = EXCLUDED.matches;

-- Sync profiles table from "all" arena
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


-- ── PART 8: Updated admin_fix_elo_sync — aggregates from root arenas only ───

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

  -- Step 1: Recalculate "all" arena from root arenas only
  WITH correct_stats AS (
    SELECT
      aps.profile_id,
      GREATEST(100, 1200 + SUM(aps.elo_rating - 1200)) AS correct_elo,
      SUM(aps.wins)    AS total_wins,
      SUM(aps.losses)  AS total_losses,
      SUM(aps.matches) AS total_matches
    FROM arena_profile_stats aps
    JOIN arenas a ON a.id = aps.arena_id
    WHERE a.slug IN ('men', 'women')
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

  RETURN 'Fixed ' || arena_rows || ' arena rows + ' || profile_rows || ' profile rows. Aggregated from root arenas (men/women) only.';
END;
$$;
