-- Create a function to test auth.uid()
CREATE OR REPLACE FUNCTION debug_auth_uid()
RETURNS TABLE (
  current_user_id UUID,
  current_role_name TEXT,
  jwt_claims JSONB
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT 
    auth.uid() as current_user_id,
    current_user as current_role_name,
    auth.jwt() as jwt_claims;
$$;