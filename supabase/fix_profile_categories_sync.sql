-- Fix stale profiles.categories data by syncing from profile_categories junction table
-- Run in Supabase SQL Editor
--
-- The junction table (profile_categories) is the source of truth for arena membership.
-- The legacy profiles.categories array may have stale/duplicate entries from before
-- the hierarchical system was introduced.

-- Step 1: Update profiles.categories from junction table for profiles that HAVE junction entries
UPDATE profiles p
SET
  categories = sub.cat_slugs,
  category = sub.cat_slugs[1]  -- first category as legacy single field
FROM (
  SELECT
    pc.profile_id,
    array_agg(c.slug ORDER BY c.slug) AS cat_slugs
  FROM profile_categories pc
  JOIN categories c ON c.id = pc.category_id
  GROUP BY pc.profile_id
) sub
WHERE p.id = sub.profile_id
  AND (
    p.categories IS DISTINCT FROM sub.cat_slugs
    OR p.category IS DISTINCT FROM sub.cat_slugs[1]
  );

-- Step 2: Clear legacy columns for profiles with NO junction entries
-- (but only if they currently have stale categories)
UPDATE profiles p
SET categories = '{}', category = NULL
WHERE NOT EXISTS (
  SELECT 1 FROM profile_categories pc WHERE pc.profile_id = p.id
)
AND (p.categories IS NOT NULL AND array_length(p.categories, 1) > 0);
