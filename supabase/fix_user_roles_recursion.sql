-- ═══════════════════════════════════════════════════════════════════════════════
-- Fix: "infinite recursion detected in policy for relation user_roles"
--
-- Problem: The user_roles SELECT policy references user_roles itself
--          (e.g. checking if caller is admin to allow reading other users' roles).
--          When articles INSERT policy checks user_roles for role-based access,
--          it triggers the user_roles SELECT policy which recurses infinitely.
--
-- Solution:
--   1. Create a SECURITY DEFINER function that bypasses RLS to check roles
--   2. Simplify user_roles SELECT policy to avoid self-referencing
--   3. Update articles INSERT policy to use the SECURITY DEFINER function
-- ═══════════════════════════════════════════════════════════════════════════════

-- Step 1: Create a SECURITY DEFINER helper that checks roles without RLS
-- This function runs with elevated privileges and skips RLS on user_roles.
CREATE OR REPLACE FUNCTION has_role(check_user_id uuid, check_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = check_user_id AND role = check_role
  );
$$;

-- Convenience: check if caller is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Convenience: check if caller is moderator or admin
CREATE OR REPLACE FUNCTION is_moderator_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('moderator', 'admin')
  );
$$;

-- Step 2: Drop the recursive user_roles policies and recreate them safely
-- (Drop all existing policies first — adjust names if they differ in your DB)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'user_roles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON user_roles', pol.policyname);
  END LOOP;
END $$;

-- Simple SELECT policy: users can see their own roles.
-- Admins can see everyone's roles (checked via SECURITY DEFINER function, no recursion).
CREATE POLICY "user_roles_select_own" ON user_roles
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_admin()
  );

-- Only admins can insert roles (via SECURITY DEFINER check)
CREATE POLICY "user_roles_insert_admin" ON user_roles
  FOR INSERT WITH CHECK (
    is_admin()
  );

-- Only admins can delete roles
CREATE POLICY "user_roles_delete_admin" ON user_roles
  FOR DELETE USING (
    is_admin()
  );

-- Step 3: Fix articles policies (drop and recreate)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'articles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON articles', pol.policyname);
  END LOOP;
END $$;

-- Anyone can read published articles
CREATE POLICY "articles_select_published" ON articles
  FOR SELECT USING (
    is_published = true OR is_moderator_or_admin()
  );

-- Moderators and admins can insert articles
CREATE POLICY "articles_insert_author" ON articles
  FOR INSERT WITH CHECK (
    is_moderator_or_admin()
  );

-- Moderators and admins can update articles
CREATE POLICY "articles_update_author" ON articles
  FOR UPDATE USING (
    is_moderator_or_admin()
  );

-- Only admins can delete articles
CREATE POLICY "articles_delete_admin" ON articles
  FOR DELETE USING (
    is_admin()
  );
