-- Admin Impersonation RPCs
-- Allows admins to post forum threads/replies and vote as seeded profiles
-- Run in Supabase SQL Editor

-- 1. Forum posting as a seeded profile
CREATE OR REPLACE FUNCTION admin_post_as_profile(
  p_type text,              -- 'thread' or 'reply'
  p_profile_id uuid,        -- seeded profile to post as
  p_thread_id uuid DEFAULT NULL,
  p_board_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_content text DEFAULT NULL,
  p_image_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
  v_id uuid;
BEGIN
  -- Admin check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Verify this is a seeded profile (user_id IS NULL, is_test_profile = false)
  SELECT name INTO v_name FROM profiles
  WHERE id = p_profile_id AND user_id IS NULL AND is_test_profile = false;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'not a seeded profile';
  END IF;

  IF p_type = 'thread' THEN
    INSERT INTO forum_threads (board_id, author_id, author_name, title, content, image_url)
    VALUES (p_board_id, auth.uid(), v_name, p_title, p_content, p_image_url)
    RETURNING id INTO v_id;
  ELSIF p_type = 'reply' THEN
    INSERT INTO forum_replies (thread_id, author_id, author_name, content, image_url)
    VALUES (p_thread_id, auth.uid(), v_name, p_content, p_image_url)
    RETURNING id INTO v_id;
  ELSE
    RAISE EXCEPTION 'invalid type: use thread or reply';
  END IF;

  RETURN v_id;
END;
$$;

-- 2. Voting as a seeded profile (wrapper around record_match)
CREATE OR REPLACE FUNCTION admin_vote_as_profile(
  p_arena_id uuid,
  p_winner_id uuid,
  p_loser_id uuid,
  p_acting_as uuid  -- seeded profile (audit trail)
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result record;
BEGIN
  -- Admin check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Verify this is a seeded profile
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_acting_as AND user_id IS NULL AND is_test_profile = false
  ) THEN
    RAISE EXCEPTION 'not a seeded profile';
  END IF;

  -- Use existing record_match RPC (ELO logic stays the same)
  SELECT * INTO v_result
  FROM public.record_match(p_arena_id, p_winner_id, p_loser_id, auth.uid());

  RETURN jsonb_build_object(
    'winner_elo_before', v_result.winner_elo_before,
    'winner_elo_after', v_result.winner_elo_after,
    'loser_elo_before', v_result.loser_elo_before,
    'loser_elo_after', v_result.loser_elo_after
  );
END;
$$;
