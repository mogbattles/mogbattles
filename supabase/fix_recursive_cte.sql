-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: get_root_arena_id_for_profile — missing WITH RECURSIVE
--
-- BUG: The "ancestors" CTE references itself (recursive), but the query
--      uses plain WITH instead of WITH RECURSIVE. PostgreSQL rejects the
--      self-reference at runtime, causing EVERY swipe vote to silently fail.
--
-- This one-line fix (WITH → WITH RECURSIVE) restores all ELO calculations.
--
-- Also fixes the same bug in get_root_arena_id if present.
--
-- HOW TO RUN: paste into Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Fix get_root_arena_id_for_profile ───────────────────────────────────────

CREATE OR REPLACE FUNCTION get_root_arena_id_for_profile(p_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root_arena_id uuid;
BEGIN
  WITH RECURSIVE profile_cat AS (
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


-- ── Also fix get_root_arena_id (same bug) ───────────────────────────────────

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
