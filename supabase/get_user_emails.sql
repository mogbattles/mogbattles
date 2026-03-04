-- RPC function to fetch user emails from auth.users
-- Only callable by admins. Returns email for given user IDs.
-- Run in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION get_user_emails(user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, email::text
  FROM auth.users
  WHERE id = ANY(user_ids)
    AND public.is_admin();
$$;
