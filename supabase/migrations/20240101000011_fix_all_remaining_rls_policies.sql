-- Fix all remaining RLS policies to avoid users table lookup
-- This resolves all "permission denied for table users" errors

-- Temporarily disable RLS to allow policy updates
ALTER TABLE programs DISABLE ROW LEVEL SECURITY;
ALTER TABLE program_workouts DISABLE ROW LEVEL SECURITY;
ALTER TABLE program_exercises DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_analytics DISABLE ROW LEVEL SECURITY;

-- Drop existing programs policies
DROP POLICY IF EXISTS "Users can view their own programs" ON programs;
DROP POLICY IF EXISTS "Users can create their own programs" ON programs;
DROP POLICY IF EXISTS "Users can update their own programs" ON programs;
DROP POLICY IF EXISTS "Users can delete their own programs" ON programs;

-- Drop existing program_workouts policies
DROP POLICY IF EXISTS "Users can view their own program workouts" ON program_workouts;
DROP POLICY IF EXISTS "Users can create their own program workouts" ON program_workouts;
DROP POLICY IF EXISTS "Users can update their own program workouts" ON program_workouts;
DROP POLICY IF EXISTS "Users can delete their own program workouts" ON program_workouts;

-- Drop existing program_exercises policies
DROP POLICY IF EXISTS "Users can view their own program exercises" ON program_exercises;
DROP POLICY IF EXISTS "Users can create their own program exercises" ON program_exercises;
DROP POLICY IF EXISTS "Users can update their own program exercises" ON program_exercises;
DROP POLICY IF EXISTS "Users can delete their own program exercises" ON program_exercises;

-- Drop existing user_analytics policies
DROP POLICY IF EXISTS "Users can view their own analytics" ON user_analytics;
DROP POLICY IF EXISTS "Users can create their own analytics" ON user_analytics;
DROP POLICY IF EXISTS "Users can update their own analytics" ON user_analytics;
DROP POLICY IF EXISTS "Users can delete their own analytics" ON user_analytics;

-- Create new programs policies using the security definer function
CREATE POLICY "Users can view their own programs" ON programs
    FOR SELECT USING (user_id = get_user_id_from_auth());

CREATE POLICY "Users can create their own programs" ON programs
    FOR INSERT WITH CHECK (user_id = get_user_id_from_auth());

CREATE POLICY "Users can update their own programs" ON programs
    FOR UPDATE USING (user_id = get_user_id_from_auth());

CREATE POLICY "Users can delete their own programs" ON programs
    FOR DELETE USING (user_id = get_user_id_from_auth());

-- Create new program_workouts policies using the security definer function
CREATE POLICY "Users can view their own program workouts" ON program_workouts
    FOR SELECT USING (program_id IN (
        SELECT id FROM programs WHERE user_id = get_user_id_from_auth()
    ));

CREATE POLICY "Users can create their own program workouts" ON program_workouts
    FOR INSERT WITH CHECK (program_id IN (
        SELECT id FROM programs WHERE user_id = get_user_id_from_auth()
    ));

CREATE POLICY "Users can update their own program workouts" ON program_workouts
    FOR UPDATE USING (program_id IN (
        SELECT id FROM programs WHERE user_id = get_user_id_from_auth()
    ));

CREATE POLICY "Users can delete their own program workouts" ON program_workouts
    FOR DELETE USING (program_id IN (
        SELECT id FROM programs WHERE user_id = get_user_id_from_auth()
    ));

-- Create new program_exercises policies using the security definer function
CREATE POLICY "Users can view their own program exercises" ON program_exercises
    FOR SELECT USING (workout_id IN (
        SELECT id FROM program_workouts WHERE program_id IN (
            SELECT id FROM programs WHERE user_id = get_user_id_from_auth()
        )
    ));

CREATE POLICY "Users can create their own program exercises" ON program_exercises
    FOR INSERT WITH CHECK (workout_id IN (
        SELECT id FROM program_workouts WHERE program_id IN (
            SELECT id FROM programs WHERE user_id = get_user_id_from_auth()
        )
    ));

CREATE POLICY "Users can update their own program exercises" ON program_exercises
    FOR UPDATE USING (workout_id IN (
        SELECT id FROM program_workouts WHERE program_id IN (
            SELECT id FROM programs WHERE user_id = get_user_id_from_auth()
        )
    ));

CREATE POLICY "Users can delete their own program exercises" ON program_exercises
    FOR DELETE USING (workout_id IN (
        SELECT id FROM program_workouts WHERE program_id IN (
            SELECT id FROM programs WHERE user_id = get_user_id_from_auth()
        )
    ));

-- Create new user_analytics policies using the security definer function
CREATE POLICY "Users can view their own analytics" ON user_analytics
    FOR SELECT USING (user_id = get_user_id_from_auth());

CREATE POLICY "Users can create their own analytics" ON user_analytics
    FOR INSERT WITH CHECK (user_id = get_user_id_from_auth());

CREATE POLICY "Users can update their own analytics" ON user_analytics
    FOR UPDATE USING (user_id = get_user_id_from_auth());

CREATE POLICY "Users can delete their own analytics" ON user_analytics
    FOR DELETE USING (user_id = get_user_id_from_auth());

-- Re-enable RLS
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;