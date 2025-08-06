-- Restrict global exercise updates to admin users only
-- This replaces the permissive policy that allowed any authenticated user to update global exercises

-- Drop the existing update policies
DROP POLICY IF EXISTS "Users can update exercises" ON exercises;
DROP POLICY IF EXISTS "Users can update their own exercises" ON exercises;

-- Create a new policy that allows:
-- 1. Users to update their own exercises (created_by = auth.uid())
-- 2. Only admin users to update global exercises (is_global = true AND user has admin role)
CREATE POLICY "Admin only global exercise updates" ON exercises
    FOR UPDATE USING (
        created_by = auth.uid() OR 
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