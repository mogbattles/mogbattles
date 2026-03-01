-- =============================================================================
-- Moderator/Admin Content Permissions
--
-- Rules:
-- - Admins can create/edit/delete ALL articles, news, and forum posts
-- - Moderators can create/edit/delete articles, news, and forum posts
--   EXCEPT those authored by admins
-- - Both need author_id tracking on articles and news_posts
--
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================


-- ── 1. Add author_id to articles and news_posts ─────────────────────────────

ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES auth.users;
ALTER TABLE news_posts ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES auth.users;

-- Backfill: set author_id for existing articles/news to the first admin
UPDATE articles
SET author_id = (SELECT user_id FROM user_roles WHERE role = 'admin' LIMIT 1)
WHERE author_id IS NULL;

UPDATE news_posts
SET author_id = (SELECT user_id FROM user_roles WHERE role = 'admin' LIMIT 1)
WHERE author_id IS NULL;


-- ── 2. RLS policies for articles ────────────────────────────────────────────

-- Drop old policies
DROP POLICY IF EXISTS articles_select_published ON articles;
DROP POLICY IF EXISTS articles_insert_author ON articles;
DROP POLICY IF EXISTS articles_update_author ON articles;
DROP POLICY IF EXISTS articles_delete_admin ON articles;

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Anyone can read published articles; mods/admins can read drafts
CREATE POLICY articles_select ON articles FOR SELECT USING (
  is_published = true
  OR public.is_moderator_or_admin()
);

-- Mods and admins can insert
CREATE POLICY articles_insert ON articles FOR INSERT WITH CHECK (
  public.is_moderator_or_admin()
);

-- Admins can update any article; mods can update non-admin-authored articles
CREATE POLICY articles_update ON articles FOR UPDATE USING (
  public.is_admin()
  OR (
    public.is_moderator_or_admin()
    AND NOT public.has_role(author_id, 'admin')
  )
);

-- Admins can delete any article; mods can delete non-admin-authored articles
CREATE POLICY articles_delete ON articles FOR DELETE USING (
  public.is_admin()
  OR (
    public.is_moderator_or_admin()
    AND NOT public.has_role(author_id, 'admin')
  )
);


-- ── 3. RLS policies for news_posts ──────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can read published news" ON news_posts;
DROP POLICY IF EXISTS "Admins can insert news" ON news_posts;
DROP POLICY IF EXISTS "Admins can update news" ON news_posts;
DROP POLICY IF EXISTS "Admins can delete news" ON news_posts;
DROP POLICY IF EXISTS news_select ON news_posts;
DROP POLICY IF EXISTS news_insert ON news_posts;
DROP POLICY IF EXISTS news_update ON news_posts;
DROP POLICY IF EXISTS news_delete ON news_posts;

ALTER TABLE news_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can read published news
CREATE POLICY news_select ON news_posts FOR SELECT USING (
  is_published = true
  OR public.is_moderator_or_admin()
);

-- Mods and admins can insert
CREATE POLICY news_insert ON news_posts FOR INSERT WITH CHECK (
  public.is_moderator_or_admin()
);

-- Admins can update any; mods can update non-admin-authored
CREATE POLICY news_update ON news_posts FOR UPDATE USING (
  public.is_admin()
  OR (
    public.is_moderator_or_admin()
    AND NOT public.has_role(author_id, 'admin')
  )
);

-- Admins can delete any; mods can delete non-admin-authored
CREATE POLICY news_delete ON news_posts FOR DELETE USING (
  public.is_admin()
  OR (
    public.is_moderator_or_admin()
    AND NOT public.has_role(author_id, 'admin')
  )
);


-- ── 4. RLS policies for forum_threads ───────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can read forum threads" ON forum_threads;
DROP POLICY IF EXISTS "Authenticated users can insert threads" ON forum_threads;
DROP POLICY IF EXISTS forum_threads_select ON forum_threads;
DROP POLICY IF EXISTS forum_threads_insert ON forum_threads;
DROP POLICY IF EXISTS forum_threads_update ON forum_threads;
DROP POLICY IF EXISTS forum_threads_delete ON forum_threads;

ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY forum_threads_select ON forum_threads FOR SELECT USING (true);

CREATE POLICY forum_threads_insert ON forum_threads FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

-- Author can update own; admins update any; mods update non-admin-authored
CREATE POLICY forum_threads_update ON forum_threads FOR UPDATE USING (
  auth.uid() = author_id
  OR public.is_admin()
  OR (
    public.is_moderator_or_admin()
    AND NOT public.has_role(author_id, 'admin')
  )
);

-- Author can delete own; admins delete any; mods delete non-admin-authored
CREATE POLICY forum_threads_delete ON forum_threads FOR DELETE USING (
  auth.uid() = author_id
  OR public.is_admin()
  OR (
    public.is_moderator_or_admin()
    AND NOT public.has_role(author_id, 'admin')
  )
);


-- ── 5. RLS policies for forum_replies ───────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can read forum replies" ON forum_replies;
DROP POLICY IF EXISTS "Authenticated users can insert replies" ON forum_replies;
DROP POLICY IF EXISTS forum_replies_select ON forum_replies;
DROP POLICY IF EXISTS forum_replies_insert ON forum_replies;
DROP POLICY IF EXISTS forum_replies_update ON forum_replies;
DROP POLICY IF EXISTS forum_replies_delete ON forum_replies;

ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY forum_replies_select ON forum_replies FOR SELECT USING (true);

CREATE POLICY forum_replies_insert ON forum_replies FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

-- Author can update own; admins update any; mods update non-admin-authored
CREATE POLICY forum_replies_update ON forum_replies FOR UPDATE USING (
  auth.uid() = author_id
  OR public.is_admin()
  OR (
    public.is_moderator_or_admin()
    AND NOT public.has_role(author_id, 'admin')
  )
);

-- Author can delete own; admins delete any; mods delete non-admin-authored
CREATE POLICY forum_replies_delete ON forum_replies FOR DELETE USING (
  auth.uid() = author_id
  OR public.is_admin()
  OR (
    public.is_moderator_or_admin()
    AND NOT public.has_role(author_id, 'admin')
  )
);
