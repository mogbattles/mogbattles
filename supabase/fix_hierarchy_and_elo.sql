-- =============================================================================
-- Fix: Restructure category hierarchy + Fix unified ELO
--
-- PROBLEM: Categories are flat (Humans → [Actors, PSL Icons, ...]) with no
--          Men/Women intermediate categories. The unified ELO system assumed
--          Men/Women exist. Also, get_root_arena_id had a sorting bug.
--
-- THIS FIX:
-- 1. Creates Men/Women categories under Humans
-- 2. Moves all sub-categories under Men (depth 1→2)
-- 3. Creates root arenas for Men and Women
-- 4. Fixes get_root_arena_id — ORDER BY lvl DESC (find HIGHEST ancestor)
-- 5. Fixes get_root_arena_id_for_profile — same
-- 6. Updates sync trigger to only propagate root arenas → "all"
-- 7. Backfills root arena stats
-- 8. Updates admin_fix_elo_sync
--
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================


-- ── 1. Create Men and Women categories under Humans ─────────────────────────

DO $$
DECLARE
  human_id uuid;
  men_id uuid;
  women_id uuid;
BEGIN
  SELECT id INTO human_id FROM categories WHERE slug = 'human';

  IF human_id IS NULL THEN
    RAISE EXCEPTION 'No "human" root category found!';
  END IF;

  -- Create Men category (depth=1 under Humans)
  INSERT INTO categories (name, slug, description, icon, parent_id, thing_type, depth, path, sort_order)
  VALUES ('Men', 'men', 'Male profiles', '👨', human_id, 'men', 1, 'human/men', 1)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO men_id FROM categories WHERE slug = 'men';

  -- Create Women category (depth=1 under Humans)
  INSERT INTO categories (name, slug, description, icon, parent_id, thing_type, depth, path, sort_order)
  VALUES ('Women', 'women', 'Female profiles', '👩', human_id, 'women', 1, 'human/women', 2)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO women_id FROM categories WHERE slug = 'women';

  -- Move all existing depth=1 categories under Men
  -- (They're currently direct children of Humans: Actors, PSL Icons, etc.)
  UPDATE categories
  SET parent_id = men_id,
      depth = 2,
      thing_type = 'men',
      path = 'human/men/' || slug
  WHERE parent_id = human_id
    AND id NOT IN (men_id, women_id)
    AND depth = 1;

  RAISE NOTICE 'Created Men (%) and Women (%) categories. Moved sub-categories under Men.', men_id, women_id;
END $$;


-- ── 2. Create root arenas for Men and Women ─────────────────────────────────

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


-- ── 3. Fix get_root_arena_id — ORDER BY lvl DESC ────────────────────────────
-- The old version used ORDER BY lvl ASC which found the CLOSEST ancestor
-- (the arena itself). Fixed to DESC to find the HIGHEST ancestor with arena.

CREATE OR REPLACE FUNCTION get_root_arena_id(p_arena_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_root_arena_id uuid;
  v_arena_slug text;
BEGIN
  SELECT slug, category_id INTO v_arena_slug, v_category_id
  FROM arenas WHERE id = p_arena_id;

  IF v_arena_slug IN ('all', 'members') THEN
    RETURN p_arena_id;
  END IF;

  IF v_category_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Walk up ancestors, find the HIGHEST one that has an official arena.
  -- lvl=0 is self, lvl=1 is parent, etc.  ORDER BY DESC finds root first.
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, 0 AS lvl FROM categories WHERE id = v_category_id
    UNION ALL
    SELECT c.id, c.parent_id, a.lvl + 1
    FROM categories c
    JOIN ancestors a ON c.id = a.parent_id
  )
  SELECT ar.id INTO v_root_arena_id
  FROM ancestors anc
  JOIN arenas ar ON ar.category_id = anc.id AND ar.is_official = true
  ORDER BY anc.lvl DESC   -- ← FIXED: was ASC, now DESC
  LIMIT 1;

  RETURN v_root_arena_id;
END;
$$;


-- ── 4. Fix get_root_arena_id_for_profile — ORDER BY lvl DESC ────────────────

CREATE OR REPLACE FUNCTION get_root_arena_id_for_profile(p_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root_arena_id uuid;
BEGIN
  WITH profile_cat AS (
    SELECT category_id FROM profile_categories
    WHERE profile_id = p_profile_id
    LIMIT 1
  ),
  ancestors AS (
    SELECT cat.id, cat.parent_id, 0 AS lvl
    FROM profile_cat pc
    JOIN categories cat ON cat.id = pc.category_id
    UNION ALL
    SELECT c.id, c.parent_id, a.lvl + 1
    FROM categories c
    JOIN ancestors a ON c.id = a.parent_id
  )
  SELECT ar.id INTO v_root_arena_id
  FROM ancestors anc
  JOIN arenas ar ON ar.category_id = anc.id AND ar.is_official = true
  ORDER BY anc.lvl DESC   -- ← FIXED: was ASC, now DESC
  LIMIT 1;

  RETURN v_root_arena_id;
END;
$$;


-- ── 5. Update sync trigger — only root arenas → "all" ──────────────────────
-- The trigger must ONLY propagate from ROOT arenas (where the arena IS its
-- own root). Sub-arena writes are arena-specific and must not double-count.

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
  v_resolved_root UUID;
  v_elo_delta    INT;
  v_win_delta    INT;
  v_loss_delta   INT;
  v_match_delta  INT;
BEGIN
  SELECT id INTO v_all_arena_id FROM arenas WHERE slug = 'all' LIMIT 1;
  IF v_all_arena_id IS NULL THEN RETURN NEW; END IF;

  -- Recursion guard: skip "all" and "members"
  IF EXISTS (
    SELECT 1 FROM arenas WHERE id = NEW.arena_id AND slug IN ('all', 'members')
  ) THEN
    RETURN NEW;
  END IF;

  -- Only propagate from ROOT arenas (those that are their own root).
  -- Sub-arenas (like PSL Icons) resolve to a different root (like Men),
  -- so they should NOT propagate to "all" (would double-count).
  v_resolved_root := get_root_arena_id(NEW.arena_id);
  IF v_resolved_root IS NULL OR v_resolved_root IS DISTINCT FROM NEW.arena_id THEN
    RETURN NEW;  -- Not a root arena → skip
  END IF;

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

CREATE TRIGGER sync_all_arena_elo
AFTER INSERT OR UPDATE ON arena_profile_stats
FOR EACH ROW
EXECUTE FUNCTION sync_all_arena_elo();


-- ── 6. Backfill: Copy "all" arena stats → "All Men" root arena ─────────────
-- Since all current profiles are male, the root "All Men" ELO should match "all".

INSERT INTO arena_profile_stats (arena_id, profile_id, elo_rating, wins, losses, matches)
SELECT
  (SELECT id FROM arenas WHERE slug = 'men'),
  aps.profile_id,
  aps.elo_rating,
  aps.wins,
  aps.losses,
  aps.matches
FROM arena_profile_stats aps
JOIN arenas a ON a.id = aps.arena_id
WHERE a.slug = 'all'
ON CONFLICT (arena_id, profile_id) DO UPDATE
SET elo_rating = EXCLUDED.elo_rating,
    wins       = EXCLUDED.wins,
    losses     = EXCLUDED.losses,
    matches    = EXCLUDED.matches;


-- ── 7. Recalculate "all" from root arenas + sync profiles ──────────────────

WITH root_arena_stats AS (
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
  elo_rating = rs.correct_elo,
  wins       = rs.total_wins,
  losses     = rs.total_losses,
  matches    = rs.total_matches
FROM root_arena_stats rs
WHERE target.profile_id = rs.profile_id
  AND target.arena_id = (SELECT id FROM arenas WHERE slug = 'all');

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


-- ── 8. Updated admin_fix_elo_sync ──────────────────────────────────────────

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

  -- Dynamically find root arenas (those that resolve to themselves)
  WITH root_arenas AS (
    SELECT a.id
    FROM arenas a
    WHERE a.is_official = true
      AND a.slug NOT IN ('all', 'members')
      AND get_root_arena_id(a.id) = a.id
  ),
  correct_stats AS (
    SELECT
      aps.profile_id,
      GREATEST(100, 1200 + SUM(aps.elo_rating - 1200)) AS correct_elo,
      SUM(aps.wins)    AS total_wins,
      SUM(aps.losses)  AS total_losses,
      SUM(aps.matches) AS total_matches
    FROM arena_profile_stats aps
    WHERE aps.arena_id IN (SELECT id FROM root_arenas)
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

  RETURN 'Fixed ' || arena_rows || ' arena rows + ' || profile_rows || ' profile rows.';
END;
$$;
