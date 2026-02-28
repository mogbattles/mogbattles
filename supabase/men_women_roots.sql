-- ═══════════════════════════════════════════════════════════════════════════════
-- Structural change: rename "Humans" → "Men", create "Women" root category,
-- add social media columns to profiles.
-- Safe to re-run (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Rename "Humans" root → "Men" ─────────────────────────────────────────
UPDATE categories
SET name = 'Men', slug = 'men', icon = '👨', description = 'Male categories'
WHERE slug = 'human';

-- Update all child paths from "human/..." to "men/..."
UPDATE categories
SET path = 'men' || substring(path from 6)  -- replace leading 'human' with 'men'
WHERE path LIKE 'human/%';

-- Update thing_type from 'human' to 'men' for existing categories
UPDATE categories SET thing_type = 'men' WHERE thing_type = 'human';

-- ─── 2. Create "Women" root category ─────────────────────────────────────────
INSERT INTO categories (name, slug, description, icon, parent_id, thing_type, depth, path, sort_order)
VALUES ('Women', 'women', 'Female categories', '👩', NULL, 'women', 0, 'women', 1)
ON CONFLICT (slug) DO NOTHING;

-- ─── 3. Seed Women sub-categories (matching Men's structure) ─────────────────
DO $$
DECLARE
  women_id uuid;
BEGIN
  SELECT id INTO women_id FROM categories WHERE slug = 'women';

  INSERT INTO categories (name, slug, description, icon, parent_id, thing_type, depth, path, sort_order) VALUES
    ('Actresses',               'actresses',               'Movie & TV actresses',           '🎬', women_id, 'women', 1, 'women/actresses',               1),
    ('Female Athletes',         'female-athletes',         'Female sports athletes',         '🏆', women_id, 'women', 1, 'women/female-athletes',         2),
    ('Female Singers',          'female-singers',          'Female music artists',           '🎵', women_id, 'women', 1, 'women/female-singers',          3),
    ('Female Models',           'female-models',           'Female fashion models',          '👗', women_id, 'women', 1, 'women/female-models',           4),
    ('Female Streamers',        'female-streamers',        'Female streamers & influencers', '📺', women_id, 'women', 1, 'women/female-streamers',        5),
    ('Female Politicians',      'female-politicians',      'Female political figures',       '🏛️', women_id, 'women', 1, 'women/female-politicians',      6)
  ON CONFLICT (slug) DO NOTHING;
END $$;

-- ─── 4. Add social media columns to profiles ─────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS instagram   text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tiktok      text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS twitter     text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS youtube     text;
