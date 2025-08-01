-- Create the missing get_user_id_from_auth function
-- This function should return the user ID from the users table based on auth.uid()

CREATE OR REPLACE FUNCTION get_user_id_from_auth()
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;