-- ═══════════════════════════════════════════════════════════════════════════════
-- Hierarchical Category System for MogBattles
--
-- Creates a self-referencing category tree, a profile↔category junction table,
-- adds category_id FK to arenas, seeds initial "human" categories,
-- and migrates existing flat data into the new structure.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Categories table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  icon        text,                                              -- emoji
  parent_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  thing_type  text NOT NULL DEFAULT 'human',
  depth       int  NOT NULL DEFAULT 0,
  path        text NOT NULL DEFAULT '',                          -- materialized: "human/athletes/basketball"
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent     ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_path       ON categories USING btree(path text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_categories_thing_type ON categories(thing_type);
CREATE INDEX IF NOT EXISTS idx_categories_slug       ON categories(slug);

-- RLS: everyone reads, admins write
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_all"   ON categories FOR SELECT USING (true);
CREATE POLICY "categories_insert_admin" ON categories FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "categories_update_admin" ON categories FOR UPDATE USING (is_admin());
CREATE POLICY "categories_delete_admin" ON categories FOR DELETE USING (is_admin());

-- ─── 2. Profile ↔ Category junction table ───────────────────────────────────

CREATE TABLE IF NOT EXISTS profile_categories (
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_categories_cat ON profile_categories(category_id);

ALTER TABLE profile_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pc_select_all"   ON profile_categories FOR SELECT USING (true);
CREATE POLICY "pc_insert_admin" ON profile_categories FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "pc_delete_admin" ON profile_categories FOR DELETE USING (is_admin());

-- ─── 3. Add category_id FK to arenas ─────────────────────────────────────────

ALTER TABLE arenas ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id);
CREATE INDEX IF NOT EXISTS idx_arenas_category ON arenas(category_id);

-- ─── 4. Helper functions ─────────────────────────────────────────────────────

-- Get all descendant category IDs (inclusive of root_id)
CREATE OR REPLACE FUNCTION get_category_descendants(root_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE
AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM categories WHERE id = root_id
    UNION ALL
    SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
  )
  SELECT id FROM tree;
$$;

-- Get ancestor chain (for breadcrumbs), ordered root → leaf
CREATE OR REPLACE FUNCTION get_category_ancestors(cat_id uuid)
RETURNS TABLE(id uuid, name text, slug text, depth int)
LANGUAGE sql STABLE
AS $$
  WITH RECURSIVE chain AS (
    SELECT c.id, c.name, c.slug, c.depth, c.parent_id
    FROM categories c WHERE c.id = cat_id
    UNION ALL
    SELECT c.id, c.name, c.slug, c.depth, c.parent_id
    FROM categories c JOIN chain ch ON c.id = ch.parent_id
  )
  SELECT chain.id, chain.name, chain.slug, chain.depth FROM chain ORDER BY depth;
$$;

-- ─── 5. Seed initial "human" category tree ───────────────────────────────────

-- Root node
INSERT INTO categories (name, slug, description, icon, parent_id, thing_type, depth, path, sort_order)
VALUES ('Humans', 'human', 'All human categories', '🧑', NULL, 'human', 0, 'human', 0)
ON CONFLICT (slug) DO NOTHING;

-- Child categories (depth=1) under "human"
-- We use a DO block so we can reference the parent UUID
DO $$
DECLARE
  human_id uuid;
BEGIN
  SELECT id INTO human_id FROM categories WHERE slug = 'human';

  INSERT INTO categories (name, slug, description, icon, parent_id, thing_type, depth, path, sort_order) VALUES
    ('Actors',                  'actors',                  'Movie & TV actors',           '🎬', human_id, 'human', 1, 'human/actors',                  1),
    ('Athletes',                'athletes',                'Sports athletes',             '🏆', human_id, 'human', 1, 'human/athletes',                2),
    ('Singers',                 'singers',                 'Music artists & singers',     '🎵', human_id, 'human', 1, 'human/singers',                 3),
    ('Models',                  'models',                  'Fashion & runway models',     '👗', human_id, 'human', 1, 'human/models',                  4),
    ('Streamers',               'streamers',               'Twitch & YouTube streamers',  '📺', human_id, 'human', 1, 'human/streamers',               5),
    ('Politicians',             'politicians',             'Political figures',           '🏛️', human_id, 'human', 1, 'human/politicians',             6),
    ('Political Commentators',  'political-commentators',  'Political commentators',      '🎙', human_id, 'human', 1, 'human/political-commentators',  7),
    ('Looksmaxxers',            'looksmaxxers',            'Looksmaxxing community',      '💎', human_id, 'human', 1, 'human/looksmaxxers',            8),
    ('PSL Icons',               'psl-icons',               'PSL rating icons',            '👁', human_id, 'human', 1, 'human/psl-icons',               9)
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- ─── 6. Migrate profiles.categories[] → profile_categories junction ──────────

INSERT INTO profile_categories (profile_id, category_id)
SELECT p.id, c.id
FROM profiles p
CROSS JOIN LATERAL unnest(p.categories) AS cat_name
JOIN categories c ON (
  -- Map old category strings to new slugs
  -- Most match directly; handle special cases
  c.slug = CASE cat_name
    WHEN 'political_commentators' THEN 'political-commentators'
    WHEN 'psl_icons' THEN 'psl-icons'
    ELSE replace(cat_name, '_', '-')
  END
)
WHERE p.categories IS NOT NULL AND array_length(p.categories, 1) > 0
ON CONFLICT DO NOTHING;

-- ─── 7. Migrate arenas.category string → arenas.category_id UUID ─────────────

UPDATE arenas a
SET category_id = c.id
FROM categories c
WHERE a.category IS NOT NULL
  AND a.category_id IS NULL
  AND c.slug = CASE a.category
    WHEN 'political_commentators' THEN 'political-commentators'
    WHEN 'psl_icons' THEN 'psl-icons'
    ELSE replace(a.category, '_', '-')
  END;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Done! Old columns (profiles.categories[], arenas.category) are untouched
-- for backward compatibility. New code should read from the new tables.
-- ═══════════════════════════════════════════════════════════════════════════════
