-- Backfill category_id on arenas that only have the legacy text `category` slug.
-- Links arenas to their matching category by slug.
-- Safe to re-run (only updates rows where category_id IS NULL).

UPDATE arenas
SET category_id = c.id
FROM categories c
WHERE arenas.category = c.slug
  AND arenas.category_id IS NULL;
