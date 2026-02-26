-- ═══════════════════════════════════════════════════════════════════════════
-- MogBattles — Follow System + Direct Messaging
--
-- HOW TO RUN: paste the entire file into Supabase → SQL Editor → Run.
--             Safe to run multiple times (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PART 1: Follow System ─────────────────────────────────────────────────────
-- One-way follows. Mutual follow (both directions) = "friends" who can DM.

CREATE TABLE IF NOT EXISTS follows (
  follower_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select_all"  ON follows;
DROP POLICY IF EXISTS "follows_insert_own"  ON follows;
DROP POLICY IF EXISTS "follows_delete_own"  ON follows;

CREATE POLICY "follows_select_all"
  ON follows FOR SELECT USING (true);

CREATE POLICY "follows_insert_own"
  ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "follows_delete_own"
  ON follows FOR DELETE USING (auth.uid() = follower_id);

-- Indexes for fast follower/following lookups
CREATE INDEX IF NOT EXISTS follows_follower_idx  ON follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows (following_id);

-- Helper function used by DM RLS policies
CREATE OR REPLACE FUNCTION is_mutual_follow(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM follows WHERE follower_id = a AND following_id = b)
    AND
    EXISTS (SELECT 1 FROM follows WHERE follower_id = b AND following_id = a);
$$;


-- ── PART 2: Conversations ─────────────────────────────────────────────────────
-- One row per unique pair. participant_a < participant_b (enforced by CHECK)
-- so there is exactly one row per pair regardless of who initiates.

CREATE TABLE IF NOT EXISTS conversations (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_a    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at  timestamptz,
  created_at       timestamptz DEFAULT now(),
  CHECK (participant_a < participant_b),
  UNIQUE (participant_a, participant_b)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_participant" ON conversations;
DROP POLICY IF EXISTS "conversations_insert_mutual"      ON conversations;

CREATE POLICY "conversations_select_participant"
  ON conversations FOR SELECT
  USING (auth.uid() = participant_a OR auth.uid() = participant_b);

CREATE POLICY "conversations_insert_mutual"
  ON conversations FOR INSERT
  WITH CHECK (
    (auth.uid() = participant_a OR auth.uid() = participant_b)
    AND is_mutual_follow(participant_a, participant_b)
  );

CREATE INDEX IF NOT EXISTS conversations_a_idx ON conversations (participant_a);
CREATE INDEX IF NOT EXISTS conversations_b_idx ON conversations (participant_b);


-- ── PART 3: Direct Messages ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS direct_messages (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid    NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  content         text    NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at      timestamptz DEFAULT now(),
  read_at         timestamptz
);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dm_select_participant" ON direct_messages;
DROP POLICY IF EXISTS "dm_insert_sender"      ON direct_messages;
DROP POLICY IF EXISTS "dm_update_read"        ON direct_messages;

-- Only conversation participants can read messages
CREATE POLICY "dm_select_participant"
  ON direct_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
    )
  );

-- Only the sender can insert (and must be a mutual follow)
CREATE POLICY "dm_insert_sender"
  ON direct_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND (c.participant_a = auth.uid() OR c.participant_b = auth.uid())
        AND is_mutual_follow(c.participant_a, c.participant_b)
    )
  );

-- Only the recipient can mark messages as read
CREATE POLICY "dm_update_read"
  ON direct_messages FOR UPDATE
  USING (auth.uid() <> sender_id);

CREATE INDEX IF NOT EXISTS dm_conversation_idx  ON direct_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS dm_sender_idx        ON direct_messages (sender_id);

-- Enable Realtime for live message delivery
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;


-- ── PART 4: Trigger — keep last_message_at fresh ──────────────────────────────

CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dm_last_message ON direct_messages;
CREATE TRIGGER dm_last_message
  AFTER INSERT ON direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_last_message();
