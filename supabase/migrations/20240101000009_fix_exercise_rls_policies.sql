-- Fix exercise RLS policies to avoid users table lookup
-- This resolves the "permission denied for table users" error

-- Drop existing exercise policies
DROP POLICY IF EXISTS "Anyone can view global exercises" ON exercises;
DROP POLICY IF EXISTS "Users can view their own exercises" ON exercises;
DROP POLICY IF EXISTS "Users can create their own exercises" ON exercises;
DROP POLICY IF EXISTS "Users can update their own exercises" ON exercises;

-- Create new exercise policies that work with auth.uid() directly
-- Note: With the new schema, created_by now directly references auth.uid()

-- No need for separate auth_id column since created_by now directly references auth.uid()

-- Create new RLS policies using auth.uid() directly
CREATE POLICY "Anyone can view global exercises" ON exercises
    FOR SELECT USING (is_global = true);

CREATE POLICY "Users can view their own exercises" ON exercises
    FOR SELECT USING (
        is_global = true OR 
        created_by = auth.uid()
    );

CREATE POLICY "Users can create their own exercises" ON exercises
    FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own exercises" ON exercises
    FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own exercises" ON exercises
    FOR DELETE USING (created_by = auth.uid());