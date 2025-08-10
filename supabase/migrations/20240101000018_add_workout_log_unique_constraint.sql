-- Add unique constraint and performance indexes for workout log duplicate prevention
-- This migration implements database-level duplicate prevention for workout logs
-- Requirements: 4.1, 4.2

-- First, check for existing duplicates and clean them up if any exist
-- This query will identify duplicates based on (user_id, program_id, week_index, day_index)
DO $$
DECLARE
    duplicate_record RECORD;
    keep_id UUID;
    delete_ids UUID[];
BEGIN
    -- Find and handle duplicates
    FOR duplicate_record IN 
        SELECT user_id, program_id, week_index, day_index, array_agg(id ORDER BY created_at DESC) as ids, COUNT(*) as count
        FROM workout_logs 
        WHERE program_id IS NOT NULL 
        GROUP BY user_id, program_id, week_index, day_index 
        HAVING COUNT(*) > 1
    LOOP
        -- Keep the most recent record (first in the ordered array)
        keep_id := duplicate_record.ids[1];
        delete_ids := duplicate_record.ids[2:];
        
        -- Log the cleanup action
        RAISE NOTICE 'Found % duplicates for user %, program %, week %, day %. Keeping ID %, deleting %', 
            duplicate_record.count, 
            duplicate_record.user_id, 
            duplicate_record.program_id, 
            duplicate_record.week_index, 
            duplicate_record.day_index,
            keep_id,
            delete_ids;
        
        -- Delete the duplicate records (CASCADE will handle workout_log_exercises)
        DELETE FROM workout_logs WHERE id = ANY(delete_ids);
    END LOOP;
END $$;

-- Add the unique constraint to prevent future duplicates
-- This constraint ensures that each user can only have one workout log per program/week/day combination
ALTER TABLE workout_logs 
ADD CONSTRAINT unique_user_program_week_day 
UNIQUE (user_id, program_id, week_index, day_index);

-- Add performance indexes for workout log lookups
-- These indexes will improve query performance for the most common lookup patterns

-- Index for finding existing workout logs during save operations (cache-first approach)
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_program_week_day_lookup 
ON workout_logs (user_id, program_id, week_index, day_index) 
WHERE program_id IS NOT NULL;

-- Index for workout log queries by user and date (for workout history)
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date_desc 
ON workout_logs (user_id, date DESC);

-- Index for finding draft/in-progress workouts
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_draft 
ON workout_logs (user_id, is_draft, created_at DESC) 
WHERE is_draft = true;

-- Index for finding finished workouts by program
CREATE INDEX IF NOT EXISTS idx_workout_logs_program_finished 
ON workout_logs (program_id, week_index, day_index, is_finished) 
WHERE program_id IS NOT NULL AND is_finished = true;

-- Composite index for workout log exercises to improve join performance
CREATE INDEX IF NOT EXISTS idx_workout_log_exercises_workout_order 
ON workout_log_exercises (workout_log_id, order_index);

-- Add comments for documentation
COMMENT ON CONSTRAINT unique_user_program_week_day ON workout_logs IS 
'Prevents duplicate workout logs for the same user, program, week, and day combination';

COMMENT ON INDEX idx_workout_logs_user_program_week_day_lookup IS 
'Optimizes cache-first lookup queries for existing workout logs during save operations';

COMMENT ON INDEX idx_workout_logs_user_date_desc IS 
'Optimizes workout history queries ordered by date';

COMMENT ON INDEX idx_workout_logs_user_draft IS 
'Optimizes queries for finding in-progress/draft workouts';

COMMENT ON INDEX idx_workout_logs_program_finished IS 
'Optimizes queries for completed workouts within programs';

COMMENT ON INDEX idx_workout_log_exercises_workout_order IS 
'Optimizes exercise retrieval and ordering within workout logs';

-- Create a function to handle constraint violations gracefully
-- This function can be used by the application to attempt updates when creates fail
CREATE OR REPLACE FUNCTION upsert_workout_log(
    p_user_id UUID,
    p_program_id UUID,
    p_week_index INTEGER,
    p_day_index INTEGER,
    p_name VARCHAR(255),
    p_date DATE,
    p_type VARCHAR(50) DEFAULT 'program_workout',
    p_weight_unit VARCHAR(10) DEFAULT 'LB',
    p_is_draft BOOLEAN DEFAULT true
) RETURNS UUID AS $$
DECLARE
    existing_id UUID;
    new_id UUID;
BEGIN
    -- Try to find existing workout log
    SELECT id INTO existing_id
    FROM workout_logs
    WHERE user_id = p_user_id 
    AND program_id = p_program_id 
    AND week_index = p_week_index 
    AND day_index = p_day_index;
    
    IF existing_id IS NOT NULL THEN
        -- Update existing record
        UPDATE workout_logs 
        SET 
            name = p_name,
            date = p_date,
            type = p_type,
            weight_unit = p_weight_unit,
            is_draft = p_is_draft,
            updated_at = NOW()
        WHERE id = existing_id;
        
        RETURN existing_id;
    ELSE
        -- Create new record
        INSERT INTO workout_logs (
            user_id, program_id, week_index, day_index, 
            name, date, type, weight_unit, is_draft
        ) VALUES (
            p_user_id, p_program_id, p_week_index, p_day_index,
            p_name, p_date, p_type, p_weight_unit, p_is_draft
        ) RETURNING id INTO new_id;
        
        RETURN new_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment for the upsert function
COMMENT ON FUNCTION upsert_workout_log IS 
'Safely creates or updates workout logs, handling unique constraint violations gracefully';

-- Create a function to validate workout log cache entries
-- This function can be used by the application to validate cached workout log IDs
CREATE OR REPLACE FUNCTION validate_workout_log_cache(
    p_workout_log_id UUID,
    p_user_id UUID,
    p_program_id UUID,
    p_week_index INTEGER,
    p_day_index INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    log_exists BOOLEAN := false;
BEGIN
    -- Check if the workout log exists and matches the expected parameters
    SELECT EXISTS(
        SELECT 1 FROM workout_logs
        WHERE id = p_workout_log_id
        AND user_id = p_user_id
        AND program_id = p_program_id
        AND week_index = p_week_index
        AND day_index = p_day_index
    ) INTO log_exists;
    
    RETURN log_exists;
END;
$$ LANGUAGE plpgsql;

-- Add comment for the validation function
COMMENT ON FUNCTION validate_workout_log_cache IS 
'Validates that a cached workout log ID exists and matches the expected parameters';

-- Create a function to get or create workout log (for cache-first operations)
CREATE OR REPLACE FUNCTION get_or_create_workout_log(
    p_user_id UUID,
    p_program_id UUID,
    p_week_index INTEGER,
    p_day_index INTEGER,
    p_name VARCHAR(255),
    p_date DATE,
    p_type VARCHAR(50) DEFAULT 'program_workout',
    p_weight_unit VARCHAR(10) DEFAULT 'LB'
) RETURNS TABLE(
    workout_log_id UUID,
    was_created BOOLEAN
) AS $$
DECLARE
    existing_id UUID;
    new_id UUID;
BEGIN
    -- Try to find existing workout log
    SELECT id INTO existing_id
    FROM workout_logs
    WHERE user_id = p_user_id 
    AND program_id = p_program_id 
    AND week_index = p_week_index 
    AND day_index = p_day_index;
    
    IF existing_id IS NOT NULL THEN
        -- Return existing record
        RETURN QUERY SELECT existing_id, false;
    ELSE
        -- Create new record
        INSERT INTO workout_logs (
            user_id, program_id, week_index, day_index, 
            name, date, type, weight_unit, is_draft
        ) VALUES (
            p_user_id, p_program_id, p_week_index, p_day_index,
            p_name, p_date, p_type, p_weight_unit, true
        ) RETURNING id INTO new_id;
        
        RETURN QUERY SELECT new_id, true;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment for the get_or_create function
COMMENT ON FUNCTION get_or_create_workout_log IS 
'Gets existing workout log or creates new one, returning the ID and creation status';