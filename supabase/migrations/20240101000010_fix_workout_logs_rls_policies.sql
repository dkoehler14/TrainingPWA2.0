-- Fix workout logs RLS policies to avoid users table lookup
-- This resolves the "permission denied for table users" error in getSingleDraft

-- Temporarily disable RLS to allow policy updates
ALTER TABLE workout_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE workout_log_exercises DISABLE ROW LEVEL SECURITY;

-- Drop existing workout_logs policies
DROP POLICY IF EXISTS "Users can view their own workout logs" ON workout_logs;
DROP POLICY IF EXISTS "Users can create their own workout logs" ON workout_logs;
DROP POLICY IF EXISTS "Users can update their own workout logs" ON workout_logs;
DROP POLICY IF EXISTS "Users can delete their own workout logs" ON workout_logs;

-- Drop existing workout_log_exercises policies
DROP POLICY IF EXISTS "Users can view their own workout log exercises" ON workout_log_exercises;
DROP POLICY IF EXISTS "Users can create their own workout log exercises" ON workout_log_exercises;
DROP POLICY IF EXISTS "Users can update their own workout log exercises" ON workout_log_exercises;
DROP POLICY IF EXISTS "Users can delete their own workout log exercises" ON workout_log_exercises;

-- Create a function to get user ID from auth ID (to avoid RLS issues)
CREATE OR REPLACE FUNCTION get_user_id_from_auth()
RETURNS UUID AS $$
DECLARE
    user_uuid UUID;
BEGIN
    SELECT id INTO user_uuid 
    FROM users 
    WHERE auth_id = auth.uid();
    
    RETURN user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new workout_logs policies using the security definer function
CREATE POLICY "Users can view their own workout logs" ON workout_logs
    FOR SELECT USING (user_id = get_user_id_from_auth());

CREATE POLICY "Users can create their own workout logs" ON workout_logs
    FOR INSERT WITH CHECK (user_id = get_user_id_from_auth());

CREATE POLICY "Users can update their own workout logs" ON workout_logs
    FOR UPDATE USING (user_id = get_user_id_from_auth());

CREATE POLICY "Users can delete their own workout logs" ON workout_logs
    FOR DELETE USING (user_id = get_user_id_from_auth());

-- Create new workout_log_exercises policies using the security definer function
CREATE POLICY "Users can view their own workout log exercises" ON workout_log_exercises
    FOR SELECT USING (workout_log_id IN (
        SELECT id FROM workout_logs WHERE user_id = get_user_id_from_auth()
    ));

CREATE POLICY "Users can create their own workout log exercises" ON workout_log_exercises
    FOR INSERT WITH CHECK (workout_log_id IN (
        SELECT id FROM workout_logs WHERE user_id = get_user_id_from_auth()
    ));

CREATE POLICY "Users can update their own workout log exercises" ON workout_log_exercises
    FOR UPDATE USING (workout_log_id IN (
        SELECT id FROM workout_logs WHERE user_id = get_user_id_from_auth()
    ));

CREATE POLICY "Users can delete their own workout log exercises" ON workout_log_exercises
    FOR DELETE USING (workout_log_id IN (
        SELECT id FROM workout_logs WHERE user_id = get_user_id_from_auth()
    ));

-- Re-enable RLS
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_log_exercises ENABLE ROW LEVEL SECURITY;