-- ═══════════════════════════════════════════════════════════════════════════
-- MogBattles — Live Streams table
--
-- HOW TO RUN: paste into Supabase → SQL Editor → Run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS live_streams (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_name   text        NOT NULL UNIQUE,
  title       text        NOT NULL DEFAULT 'Live Battle',
  is_active   boolean     NOT NULL DEFAULT true,
  started_at  timestamptz DEFAULT now(),
  ended_at    timestamptz
);

ALTER TABLE live_streams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "streams_select_active" ON live_streams;
DROP POLICY IF EXISTS "streams_insert_host"   ON live_streams;
DROP POLICY IF EXISTS "streams_update_host"   ON live_streams;

-- Everyone can see active streams; hosts can see their own ended ones
CREATE POLICY "streams_select_active"
  ON live_streams FOR SELECT
  USING (is_active = true OR host_id = auth.uid());

-- Only the host can create a stream row
CREATE POLICY "streams_insert_host"
  ON live_streams FOR INSERT
  WITH CHECK (auth.uid() = host_id);

-- Only the host can update (end) their stream
CREATE POLICY "streams_update_host"
  ON live_streams FOR UPDATE
  USING (auth.uid() = host_id);

CREATE INDEX IF NOT EXISTS live_streams_active_idx    ON live_streams (is_active, started_at DESC);
CREATE INDEX IF NOT EXISTS live_streams_host_idx      ON live_streams (host_id);

-- Enable Realtime so the /live page updates without polling
ALTER PUBLICATION supabase_realtime ADD TABLE live_streams;
