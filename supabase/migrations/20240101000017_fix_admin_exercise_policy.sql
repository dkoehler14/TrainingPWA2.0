-- Fix admin-only global exercise updates policy
-- This corrects issues with role checking and ensures proper admin validation

-- First, fix the role management functions (they had typos)
DROP FUNCTION IF EXISTS add_user_role(UUID, TEXT);
DROP FUNCTION IF EXISTS remove_user_role(UUID, TEXT);
DROP FUNCTION IF EXISTS user_has_role(UUID, TEXT);

-- Function to add a role to a user
CREATE OR REPLACE FUNCTION add_user_role(user_id UUID, new_role TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE users 
    SET roles = array_append(roles, new_role)
    WHERE id = user_id 
    AND NOT (new_role = ANY(roles));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove a role from a user
CREATE OR REPLACE FUNCTION remove_user_role(user_id UUID, old_role TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE users 
    SET roles = array_remove(roles, old_role)
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION user_has_role(user_id UUID, check_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users 
        WHERE id = user_id 
        AND check_role = ANY(roles)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the existing admin policy if it exists
DROP POLICY IF EXISTS "Admin only global exercise updates" ON exercises;

-- Drop the old update policy that was too permissive
DROP POLICY IF EXISTS "Users can update their own exercises" ON exercises;

-- Create the corrected admin-only global exercise updates policy
CREATE POLICY "Admin only global exercise updates" ON exercises
    FOR UPDATE USING (
        -- Users can always update their own exercises
        created_by = auth.uid() OR 
        -- Only admin users can update global exercises
        (
            is_global = true AND 
            EXISTS (
                SELECT 1 FROM users
                WHERE users.id = auth.uid() 
                AND 'admin' = ANY(users.roles)
            )
        )
    );

-- Add a comment to document the policy
COMMENT ON POLICY "Admin only global exercise updates" ON exercises IS 
'Allows users to update their own exercises and restricts global exercise updates to admin users only';

-- Create a helper function to debug auth context (useful for testing)
CREATE OR REPLACE FUNCTION debug_auth_uid()
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'auth_uid', auth.uid(),
        'current_user', current_user,
        'session_user', session_user
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;