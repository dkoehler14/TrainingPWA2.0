-- Fix exercise RLS policies to avoid users table lookup
-- This resolves the "permission denied for table users" error

-- Drop existing exercise policies
DROP POLICY IF EXISTS "Anyone can view global exercises" ON exercises;
DROP POLICY IF EXISTS "Users can view their own exercises" ON exercises;
DROP POLICY IF EXISTS "Users can create their own exercises" ON exercises;
DROP POLICY IF EXISTS "Users can update their own exercises" ON exercises;

-- Create new exercise policies that work with auth.uid() directly
-- Note: We need to update the exercises table to store auth_id instead of user_id for created_by

-- First, let's add a new column for auth_id if it doesn't exist
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS created_by_auth_id UUID REFERENCES auth.users(id);

-- Migrate existing data: populate created_by_auth_id from users table
UPDATE exercises 
SET created_by_auth_id = (
    SELECT auth_id 
    FROM users 
    WHERE users.id = exercises.created_by
)
WHERE created_by IS NOT NULL AND created_by_auth_id IS NULL;

-- Create new RLS policies using auth.uid() directly
CREATE POLICY "Anyone can view global exercises" ON exercises
    FOR SELECT USING (is_global = true);

CREATE POLICY "Users can view their own exercises" ON exercises
    FOR SELECT USING (
        is_global = true OR 
        created_by_auth_id = auth.uid()
    );

CREATE POLICY "Users can create their own exercises" ON exercises
    FOR INSERT WITH CHECK (created_by_auth_id = auth.uid());

CREATE POLICY "Users can update their own exercises" ON exercises
    FOR UPDATE USING (created_by_auth_id = auth.uid());

CREATE POLICY "Users can delete their own exercises" ON exercises
    FOR DELETE USING (created_by_auth_id = auth.uid());

-- Update the exercise service to use created_by_auth_id instead of created_by
-- This will be handled in the application code