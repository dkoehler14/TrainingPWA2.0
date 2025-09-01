-- Add unique constraint to prevent duplicate exercises within the same workout log
-- This migration ensures data integrity by preventing multiple entries of the same exercise
-- in a single workout session

-- Add the unique constraint to prevent future duplicates
-- This constraint ensures that each workout log can only have one entry per exercise
ALTER TABLE workout_log_exercises
ADD CONSTRAINT unique_workout_log_exercise
UNIQUE (workout_log_id, exercise_id);

-- Add performance index for the unique constraint (automatically created by PostgreSQL)
-- But we'll also add a specific index for better query performance
CREATE INDEX IF NOT EXISTS idx_workout_log_exercises_unique_lookup
ON workout_log_exercises (workout_log_id, exercise_id);

-- Add comments for documentation
COMMENT ON CONSTRAINT unique_workout_log_exercise ON workout_log_exercises IS
'Prevents duplicate exercises within the same workout log to ensure data integrity';

COMMENT ON INDEX idx_workout_log_exercises_unique_lookup IS
'Optimizes unique constraint lookups and duplicate prevention queries';

-- Create a function to handle duplicate exercise insertion attempts gracefully
CREATE OR REPLACE FUNCTION handle_duplicate_workout_exercise_upsert(
    p_workout_log_id UUID,
    p_exercise_id UUID,
    p_sets INTEGER,
    p_reps INTEGER[],
    p_weights DECIMAL(6,2)[],
    p_completed BOOLEAN[],
    p_bodyweight DECIMAL(5,2),
    p_notes TEXT,
    p_order_index INTEGER
) RETURNS UUID AS $$
DECLARE
    existing_id UUID;
    new_id UUID;
BEGIN
    -- Try to find existing exercise entry in this workout
    SELECT id INTO existing_id
    FROM workout_log_exercises
    WHERE workout_log_id = p_workout_log_id
    AND exercise_id = p_exercise_id;

    IF existing_id IS NOT NULL THEN
        -- Update existing entry
        UPDATE workout_log_exercises
        SET
            sets = p_sets,
            reps = p_reps,
            weights = p_weights,
            completed = p_completed,
            bodyweight = p_bodyweight,
            notes = p_notes,
            order_index = p_order_index,
            updated_at = NOW()
        WHERE id = existing_id;

        RETURN existing_id;
    ELSE
        -- Create new entry
        INSERT INTO workout_log_exercises (
            workout_log_id,
            exercise_id,
            sets,
            reps,
            weights,
            completed,
            bodyweight,
            notes,
            order_index
        ) VALUES (
            p_workout_log_id,
            p_exercise_id,
            p_sets,
            p_reps,
            p_weights,
            p_completed,
            p_bodyweight,
            p_notes,
            p_order_index
        ) RETURNING id INTO new_id;

        RETURN new_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comment for the upsert function
COMMENT ON FUNCTION handle_duplicate_workout_exercise_upsert IS
'Safely creates or updates workout log exercises, handling unique constraint violations gracefully';