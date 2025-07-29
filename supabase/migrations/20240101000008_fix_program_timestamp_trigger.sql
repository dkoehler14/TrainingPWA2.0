-- Fix the program timestamp trigger to handle both program_workouts and program_exercises tables
-- The issue is that program_exercises doesn't have program_id directly, it needs to be looked up through workout_id

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS update_program_on_exercise_change ON program_exercises;
DROP TRIGGER IF EXISTS update_program_on_workout_change ON program_workouts;
DROP FUNCTION IF EXISTS update_program_timestamp();

-- Create separate functions for each table type
CREATE OR REPLACE FUNCTION update_program_timestamp_from_workout()
RETURNS TRIGGER AS $$
BEGIN
    -- For program_workouts table, program_id is directly available
    IF TG_OP = 'DELETE' THEN
        UPDATE programs SET updated_at = NOW() WHERE id = OLD.program_id;
        RETURN OLD;
    ELSE
        UPDATE programs SET updated_at = NOW() WHERE id = NEW.program_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_program_timestamp_from_exercise()
RETURNS TRIGGER AS $$
DECLARE
    target_program_id UUID;
BEGIN
    -- For program_exercises table, we need to lookup program_id through workout_id
    IF TG_OP = 'DELETE' THEN
        SELECT program_id INTO target_program_id 
        FROM program_workouts 
        WHERE id = OLD.workout_id;
        
        UPDATE programs SET updated_at = NOW() WHERE id = target_program_id;
        RETURN OLD;
    ELSE
        SELECT program_id INTO target_program_id 
        FROM program_workouts 
        WHERE id = NEW.workout_id;
        
        UPDATE programs SET updated_at = NOW() WHERE id = target_program_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create the triggers with the correct functions
CREATE TRIGGER update_program_on_workout_change
    AFTER INSERT OR UPDATE OR DELETE ON program_workouts
    FOR EACH ROW EXECUTE FUNCTION update_program_timestamp_from_workout();

CREATE TRIGGER update_program_on_exercise_change
    AFTER INSERT OR UPDATE OR DELETE ON program_exercises
    FOR EACH ROW EXECUTE FUNCTION update_program_timestamp_from_exercise();