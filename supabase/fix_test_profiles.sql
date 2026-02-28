-- Fix: ensure ALL seeded profiles have is_test_profile = true
-- Some were created before the flag existed and have NULL instead of true.
-- This marks any profile whose user_id doesn't exist in auth.users as a test profile.
-- Also sets is_test_profile = false for real users who have NULL.

UPDATE profiles
SET is_test_profile = true
WHERE is_test_profile IS NULL
  AND user_id NOT IN (SELECT id FROM auth.users);

UPDATE profiles
SET is_test_profile = false
WHERE is_test_profile IS NULL
  AND user_id IN (SELECT id FROM auth.users);
