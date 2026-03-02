-- =============================================================================
-- Fix: Admin panel edits not taking effect
--
-- Problem: The profiles and arena_profile_stats tables have RLS enabled but
-- lack UPDATE policies for admins.  When the admin panel (which uses the
-- anon key via createBrowserClient) calls .update(), Supabase silently
-- returns no error but updates 0 rows because no UPDATE policy matches.
--
-- Solution: Add UPDATE policies that allow:
--   - Admins to update ANY profile / arena stats
--   - Users to update their OWN profile (user_id = auth.uid())
--
-- Run in Supabase SQL Editor.  Safe to re-run (idempotent).
-- =============================================================================


-- ── 1. Ensure RLS is enabled on profiles ────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;


-- ── 2. Drop any existing UPDATE policies on profiles to avoid conflicts ─────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'profiles' AND cmd = 'UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', pol.policyname);
  END LOOP;
END $$;


-- ── 3. Create UPDATE policy for profiles ────────────────────────────────────
-- Admins can update any profile.
-- Regular users can update their own profile (matched by user_id).
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    auth.uid() = user_id
    OR public.is_admin()
  );


-- ── 4. Ensure RLS is enabled on arena_profile_stats ─────────────────────────
ALTER TABLE arena_profile_stats ENABLE ROW LEVEL SECURITY;


-- ── 5. Drop any existing UPDATE policies on arena_profile_stats ─────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'arena_profile_stats' AND cmd = 'UPDATE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON arena_profile_stats', pol.policyname);
  END LOOP;
END $$;


-- ── 6. Create UPDATE policy for arena_profile_stats ─────────────────────────
-- Admins can update any arena stats row.
-- The sync trigger functions (SECURITY DEFINER) bypass RLS anyway,
-- but explicit admin access is needed for the admin panel's direct updates.
CREATE POLICY "arena_profile_stats_update" ON arena_profile_stats
  FOR UPDATE USING (
    public.is_admin()
  );


-- ── 7. Ensure SELECT policies exist (so admin can read all rows) ────────────
-- profiles: public read is usually allowed, but ensure it exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
  END IF;
END $$;

-- arena_profile_stats: ensure public read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'arena_profile_stats' AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY "arena_profile_stats_select" ON arena_profile_stats FOR SELECT USING (true);
  END IF;
END $$;


-- ── 8. Ensure INSERT policies exist ─────────────────────────────────────────
-- profiles: admins can insert (for seeding users)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (
      auth.uid() IS NOT NULL OR public.is_admin()
    );
  END IF;
END $$;

-- arena_profile_stats: admins and trigger functions can insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'arena_profile_stats' AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY "arena_profile_stats_insert" ON arena_profile_stats FOR INSERT WITH CHECK (
      public.is_admin() OR auth.uid() IS NOT NULL
    );
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- Verification: Run these queries after the migration to confirm policies exist
--
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN ('profiles', 'arena_profile_stats')
-- ORDER BY tablename, cmd;
-- ══════════════════════════════════════════════════════════════════════════════
