-- Allow users to update global exercises and their own exercises
-- This fixes the issue where global exercises cannot be updated

-- Drop the existing update policy
DROP POLICY IF EXISTS "Users can update their own exercises" ON exercises;

-- Create a new policy that allows:
-- 1. Users to update their own exercises (created_by = auth.uid())
-- 2. Any authenticated user to update global exercises (for now, can be restricted later)
CREATE POLICY "Users can update exercises" ON exercises
    FOR UPDATE USING (
        created_by = auth.uid() OR 
        (is_global = true AND auth.uid() IS NOT NULL)
    );