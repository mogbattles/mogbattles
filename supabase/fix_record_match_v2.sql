-- =============================================================================
-- Fix record_match v2 — More robust DROP + diagnostic test
--
-- Run in Supabase SQL Editor. Safe to re-run.
-- =============================================================================

-- ── 1. Aggressively drop ALL overloads of record_match ──────────────────────
-- Drop every possible signature that might exist
DO $$
BEGIN
  -- Try dropping the 4-param version
  BEGIN
    DROP FUNCTION IF EXISTS record_match(uuid, uuid, uuid, uuid);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Try dropping the 3-param version (legacy)
  BEGIN
    DROP FUNCTION IF EXISTS record_match(uuid, uuid, uuid);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

-- ── 2. Recreate helper functions (idempotent) ──────────────────────────────

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
  ORDER BY anc.lvl DESC
  LIMIT 1;

  RETURN v_root_arena_id;
END;
$$;

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
  ORDER BY anc.lvl DESC
  LIMIT 1;

  RETURN v_root_arena_id;
END;
$$;


-- ── 3. Create record_match ──────────────────────────────────────────────────

CREATE FUNCTION record_match(
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
  v_loser_root_id uuid;
  v_arena_slug text;
  v_is_official boolean;
  v_arena_tier text;
  v_w_elo int;
  v_l_elo int;
  v_w_new int;
  v_l_new int;
  v_expected_w float;
  v_k int := 32;
  v_aw_elo int;
  v_al_elo int;
  v_aw_new int;
  v_al_new int;
  v_a_expected_w float;
BEGIN
  -- ── Resolve root arena for ELO ──────────────────────────────────────────
  SELECT slug, is_official, arena_tier INTO v_arena_slug, v_is_official, v_arena_tier
  FROM arenas WHERE id = p_arena_id;

  IF COALESCE(v_arena_tier, 'custom') = 'custom' AND NOT COALESCE(v_is_official, false) THEN
    v_root_arena_id := p_arena_id;
    v_loser_root_id := p_arena_id;
  ELSIF v_arena_slug = 'all' THEN
    -- "all" arena: resolve root from each player's profile independently
    v_root_arena_id := get_root_arena_id_for_profile(p_winner_id);
    v_loser_root_id := get_root_arena_id_for_profile(p_loser_id);
  ELSE
    v_root_arena_id := get_root_arena_id(p_arena_id);
    v_loser_root_id := v_root_arena_id;
  END IF;

  -- Fallbacks for winner root
  IF v_root_arena_id IS NULL AND COALESCE(v_is_official, false) THEN
    v_root_arena_id := get_root_arena_id_for_profile(p_winner_id);
  END IF;
  IF v_root_arena_id IS NULL THEN
    v_root_arena_id := p_arena_id;
  END IF;

  -- Fallbacks for loser root
  IF v_loser_root_id IS NULL AND COALESCE(v_is_official, false) THEN
    v_loser_root_id := get_root_arena_id_for_profile(p_loser_id);
  END IF;
  IF v_loser_root_id IS NULL THEN
    v_loser_root_id := p_arena_id;
  END IF;

  -- ── Get current ELOs from each player's ROOT arena ────────────────────
  SELECT COALESCE(
    (SELECT elo_rating FROM arena_profile_stats
     WHERE arena_id = v_root_arena_id AND profile_id = p_winner_id),
    1200
  ) INTO v_w_elo;

  SELECT COALESCE(
    (SELECT elo_rating FROM arena_profile_stats
     WHERE arena_id = v_loser_root_id AND profile_id = p_loser_id),
    1200
  ) INTO v_l_elo;

  -- ── ELO calculation ─────────────────────────────────────────────────────
  v_expected_w := 1.0 / (1.0 + power(10.0, (v_l_elo - v_w_elo)::float / 400.0));
  v_w_new := v_w_elo + round(v_k * (1.0 - v_expected_w))::int;
  v_l_new := v_l_elo + round(v_k * (0.0 - (1.0 - v_expected_w)))::int;

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
  VALUES (v_loser_root_id, p_loser_id, v_l_new, 0, 1, 1)
  ON CONFLICT (arena_id, profile_id) DO UPDATE
    SET elo_rating = v_l_new,
        losses     = arena_profile_stats.losses + 1,
        matches    = arena_profile_stats.matches + 1;

  -- ── Arena-specific ELO (independent per sub-arena) ──────────────────────
  -- Skip for aggregate arenas ("all", "members") — they're populated by sync trigger.
  IF v_root_arena_id IS DISTINCT FROM p_arena_id
     AND v_arena_slug NOT IN ('all', 'members') THEN
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

  -- ── Record match history ────────────────────────────────────────────────
  INSERT INTO matches (winner_id, loser_id, winner_elo_before, loser_elo_before,
                       winner_elo_after, loser_elo_after, arena_id)
  VALUES (p_winner_id, p_loser_id, v_w_elo, v_l_elo, v_w_new, v_l_new, p_arena_id);

  -- ── Record user vote ────────────────────────────────────────────────────
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


-- ── 4. Ensure sync triggers exist ───────────────────────────────────────────

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

  -- Only propagate from ROOT arenas (those that resolve to themselves)
  v_resolved_root := get_root_arena_id(NEW.arena_id);
  IF v_resolved_root IS NULL OR v_resolved_root IS DISTINCT FROM NEW.arena_id THEN
    RETURN NEW;
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

-- Profiles sync trigger
DROP TRIGGER IF EXISTS sync_profiles_from_all_arena ON arena_profile_stats;

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

CREATE TRIGGER sync_profiles_from_all_arena
AFTER INSERT OR UPDATE ON arena_profile_stats
FOR EACH ROW
EXECUTE FUNCTION sync_profiles_from_all_arena();


-- ── 5. Update admin_fix_elo_sync ─────────────────────────────────────────────

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


-- ── 6. Diagnostic: verify the function exists and works ─────────────────────

SELECT proname, pronargs, prorettype::regtype
FROM pg_proc
WHERE proname = 'record_match';
