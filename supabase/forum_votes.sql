-- Forum Votes (Reddit-style upvote/downvote)
-- Run in Supabase SQL Editor

-- 1. Create forum_votes table
CREATE TABLE IF NOT EXISTS forum_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES forum_threads(id) ON DELETE CASCADE,
  reply_id uuid REFERENCES forum_replies(id) ON DELETE CASCADE,
  vote smallint NOT NULL CHECK (vote IN (-1, 1)),  -- +1 upvote, -1 downvote
  created_at timestamptz DEFAULT now(),
  CONSTRAINT one_target CHECK (
    (thread_id IS NOT NULL AND reply_id IS NULL) OR
    (thread_id IS NULL AND reply_id IS NOT NULL)
  ),
  CONSTRAINT unique_thread_vote UNIQUE (user_id, thread_id),
  CONSTRAINT unique_reply_vote UNIQUE (user_id, reply_id)
);

-- 2. Add vote_score to forum_threads (replies already have `likes`)
ALTER TABLE forum_threads ADD COLUMN IF NOT EXISTS vote_score integer DEFAULT 0;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_forum_votes_thread ON forum_votes(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_forum_votes_reply ON forum_votes(reply_id) WHERE reply_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_forum_votes_user ON forum_votes(user_id);

-- 4. RLS
ALTER TABLE forum_votes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read all forum votes') THEN
    CREATE POLICY "Users can read all forum votes" ON forum_votes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own forum votes') THEN
    CREATE POLICY "Users can insert own forum votes" ON forum_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own forum votes') THEN
    CREATE POLICY "Users can update own forum votes" ON forum_votes FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own forum votes') THEN
    CREATE POLICY "Users can delete own forum votes" ON forum_votes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. RPC: forum_vote — upsert vote, returns new net score
CREATE OR REPLACE FUNCTION forum_vote(
  p_thread_id uuid DEFAULT NULL,
  p_reply_id uuid DEFAULT NULL,
  p_vote smallint DEFAULT 1  -- +1 or -1
)
RETURNS integer  -- new net score
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing smallint;
  v_delta integer;
  v_new_score integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_thread_id IS NOT NULL THEN
    -- ── Thread vote ──
    SELECT vote INTO v_existing FROM forum_votes
      WHERE user_id = v_uid AND thread_id = p_thread_id;

    IF v_existing IS NOT NULL THEN
      IF v_existing = p_vote THEN
        -- Toggle off: remove vote
        DELETE FROM forum_votes WHERE user_id = v_uid AND thread_id = p_thread_id;
        v_delta := -v_existing;
      ELSE
        -- Flip vote direction
        UPDATE forum_votes SET vote = p_vote WHERE user_id = v_uid AND thread_id = p_thread_id;
        v_delta := p_vote - v_existing;  -- e.g. 1 - (-1) = +2
      END IF;
    ELSE
      -- New vote
      INSERT INTO forum_votes (user_id, thread_id, vote) VALUES (v_uid, p_thread_id, p_vote);
      v_delta := p_vote;
    END IF;

    UPDATE forum_threads SET vote_score = vote_score + v_delta WHERE id = p_thread_id
      RETURNING vote_score INTO v_new_score;

  ELSIF p_reply_id IS NOT NULL THEN
    -- ── Reply vote (updates `likes` column as net score) ──
    SELECT vote INTO v_existing FROM forum_votes
      WHERE user_id = v_uid AND reply_id = p_reply_id;

    IF v_existing IS NOT NULL THEN
      IF v_existing = p_vote THEN
        DELETE FROM forum_votes WHERE user_id = v_uid AND reply_id = p_reply_id;
        v_delta := -v_existing;
      ELSE
        UPDATE forum_votes SET vote = p_vote WHERE user_id = v_uid AND reply_id = p_reply_id;
        v_delta := p_vote - v_existing;
      END IF;
    ELSE
      INSERT INTO forum_votes (user_id, reply_id, vote) VALUES (v_uid, p_reply_id, p_vote);
      v_delta := p_vote;
    END IF;

    UPDATE forum_replies SET likes = likes + v_delta WHERE id = p_reply_id
      RETURNING likes INTO v_new_score;

  ELSE
    RAISE EXCEPTION 'must provide thread_id or reply_id';
  END IF;

  RETURN v_new_score;
END;
$$;

-- 6. RPC: get_my_forum_votes — batch-fetch current user's votes for a thread page
CREATE OR REPLACE FUNCTION get_my_forum_votes(p_thread_id uuid)
RETURNS TABLE(thread_id uuid, reply_id uuid, vote smallint)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT fv.thread_id, fv.reply_id, fv.vote
  FROM forum_votes fv
  WHERE fv.user_id = auth.uid()
    AND (
      fv.thread_id = p_thread_id
      OR fv.reply_id IN (
        SELECT fr.id FROM forum_replies fr WHERE fr.thread_id = p_thread_id
      )
    );
$$;
