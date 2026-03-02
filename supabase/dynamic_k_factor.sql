-- ═══════════════════════════════════════════════════════════════════════════════
-- Dynamic K-Factor — Adaptive ELO adjustment speed
--
-- New profiles adjust rapidly (K=40) to find their true rating quickly.
-- Established profiles stabilize (K=24) to prevent wild swings.
--
-- Match count thresholds (per player, based on ROOT arena matches):
--   0–30 matches  → K=40  (rapid discovery phase)
--   31–100 matches → K=32  (standard adjustment)
--   101+ matches   → K=24  (established, stable rating)
--
-- Each player uses their OWN K-factor (standard FIDE practice).
-- This means ELO is not strictly zero-sum, which is intentional and correct.
--
-- Run in Supabase SQL Editor. Safe to re-run (idempotent via CREATE OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════════


-- Drop existing function first (return type hasn't changed, but signature matters)
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
  v_loser_root_id uuid;
  v_arena_slug text;
  v_is_official boolean;
  v_arena_tier text;
  v_w_elo int;
  v_l_elo int;
  v_w_new int;
  v_l_new int;
  v_expected_w float;
  -- Dynamic K-factor variables
  v_w_matches int;
  v_l_matches int;
  v_k_w int;
  v_k_l int;
  -- Arena-specific ELO (independent calculation per sub-arena)
  v_aw_elo int;
  v_al_elo int;
  v_aw_new int;
  v_al_new int;
  v_a_expected_w float;
  v_aw_matches int;
  v_al_matches int;
  v_ak_w int;
  v_ak_l int;
BEGIN
  -- ── Resolve root arena for ELO ──────────────────────────────────────────
  SELECT slug, is_official, arena_tier INTO v_arena_slug, v_is_official, v_arena_tier
  FROM arenas WHERE id = p_arena_id;

  IF COALESCE(v_arena_tier, 'custom') = 'custom' AND NOT COALESCE(v_is_official, false) THEN
    v_root_arena_id := p_arena_id;
    v_loser_root_id := p_arena_id;
  ELSIF v_arena_slug = 'all' THEN
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

  -- ── Get current ELOs and match counts from each player's ROOT arena ────
  SELECT COALESCE(elo_rating, 1200), COALESCE(matches, 0)
  INTO v_w_elo, v_w_matches
  FROM arena_profile_stats
  WHERE arena_id = v_root_arena_id AND profile_id = p_winner_id;

  IF NOT FOUND THEN
    v_w_elo := 1200;
    v_w_matches := 0;
  END IF;

  SELECT COALESCE(elo_rating, 1200), COALESCE(matches, 0)
  INTO v_l_elo, v_l_matches
  FROM arena_profile_stats
  WHERE arena_id = v_loser_root_id AND profile_id = p_loser_id;

  IF NOT FOUND THEN
    v_l_elo := 1200;
    v_l_matches := 0;
  END IF;

  -- ── Dynamic K-factor based on match count ──────────────────────────────
  -- New profiles: K=40 (rapid discovery, reaches true rating in ~15–20 matches)
  -- Standard:     K=32 (normal adjustment)
  -- Established:  K=24 (stable, prevents wild swings)
  IF v_w_matches < 30 THEN v_k_w := 40;
  ELSIF v_w_matches < 100 THEN v_k_w := 32;
  ELSE v_k_w := 24;
  END IF;

  IF v_l_matches < 30 THEN v_k_l := 40;
  ELSIF v_l_matches < 100 THEN v_k_l := 32;
  ELSE v_k_l := 24;
  END IF;

  -- ── ELO calculation (each player uses their own K) ─────────────────────
  v_expected_w := 1.0 / (1.0 + power(10.0, (v_l_elo - v_w_elo)::float / 400.0));
  v_w_new := v_w_elo + round(v_k_w * (1.0 - v_expected_w))::int;
  v_l_new := v_l_elo + round(v_k_l * (0.0 - (1.0 - v_expected_w)))::int;

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

  -- ── Upsert ROOT arena stats for loser (may differ from winner's root) ───
  INSERT INTO arena_profile_stats (arena_id, profile_id, elo_rating, wins, losses, matches)
  VALUES (v_loser_root_id, p_loser_id, v_l_new, 0, 1, 1)
  ON CONFLICT (arena_id, profile_id) DO UPDATE
    SET elo_rating = v_l_new,
        losses     = arena_profile_stats.losses + 1,
        matches    = arena_profile_stats.matches + 1;

  -- ── Arena-specific ELO (independent per sub-arena) ──────────────────────
  IF v_root_arena_id IS DISTINCT FROM p_arena_id
     AND v_arena_slug NOT IN ('all', 'members') THEN

    SELECT COALESCE(elo_rating, 1200), COALESCE(matches, 0)
    INTO v_aw_elo, v_aw_matches
    FROM arena_profile_stats
    WHERE arena_id = p_arena_id AND profile_id = p_winner_id;
    IF NOT FOUND THEN v_aw_elo := 1200; v_aw_matches := 0; END IF;

    SELECT COALESCE(elo_rating, 1200), COALESCE(matches, 0)
    INTO v_al_elo, v_al_matches
    FROM arena_profile_stats
    WHERE arena_id = p_arena_id AND profile_id = p_loser_id;
    IF NOT FOUND THEN v_al_elo := 1200; v_al_matches := 0; END IF;

    -- Arena-specific K-factors
    IF v_aw_matches < 30 THEN v_ak_w := 40;
    ELSIF v_aw_matches < 100 THEN v_ak_w := 32;
    ELSE v_ak_w := 24;
    END IF;

    IF v_al_matches < 30 THEN v_ak_l := 40;
    ELSIF v_al_matches < 100 THEN v_ak_l := 32;
    ELSE v_ak_l := 24;
    END IF;

    v_a_expected_w := 1.0 / (1.0 + power(10.0, (v_al_elo - v_aw_elo)::float / 400.0));
    v_aw_new := GREATEST(100, v_aw_elo + round(v_ak_w * (1.0 - v_a_expected_w))::int);
    v_al_new := GREATEST(100, v_al_elo + round(v_ak_l * (0.0 - (1.0 - v_a_expected_w)))::int);

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

  -- ── Return ELO deltas ──────────────────────────────────────────────────
  RETURN QUERY SELECT v_w_elo, v_w_new, v_l_elo, v_l_new;
END;
$$;
