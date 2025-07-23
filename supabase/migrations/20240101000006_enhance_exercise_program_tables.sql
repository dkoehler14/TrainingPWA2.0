-- Enhance exercise and program management tables
-- This migration adds additional constraints, validations, and optimizations

-- Add check constraints for exercises table
ALTER TABLE exercises 
ADD CONSTRAINT check_exercise_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
ADD CONSTRAINT check_primary_muscle_group_not_empty CHECK (LENGTH(TRIM(primary_muscle_group)) > 0),
ADD CONSTRAINT check_exercise_type_not_empty CHECK (LENGTH(TRIM(exercise_type)) > 0);

-- Add check constraints for programs table
ALTER TABLE programs
ADD CONSTRAINT check_program_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
ADD CONSTRAINT check_duration_positive CHECK (duration > 0),
ADD CONSTRAINT check_days_per_week_valid CHECK (days_per_week >= 1 AND days_per_week <= 7),
ADD CONSTRAINT check_weight_unit_valid CHECK (weight_unit IN ('LB', 'KG')),
ADD CONSTRAINT check_completed_weeks_non_negative CHECK (completed_weeks >= 0),
ADD CONSTRAINT check_completed_weeks_not_exceed_duration CHECK (completed_weeks <= duration);

-- Add check constraints for program_workouts table
ALTER TABLE program_workouts
ADD CONSTRAINT check_workout_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
ADD CONSTRAINT check_week_number_positive CHECK (week_number > 0),
ADD CONSTRAINT check_day_number_valid CHECK (day_number >= 1 AND day_number <= 7);

-- Add check constraints for program_exercises table
ALTER TABLE program_exercises
ADD CONSTRAINT check_sets_positive CHECK (sets > 0),
ADD CONSTRAINT check_reps_positive CHECK (reps IS NULL OR reps > 0),
ADD CONSTRAINT check_rest_minutes_non_negative CHECK (rest_minutes IS NULL OR rest_minutes >= 0),
ADD CONSTRAINT check_order_index_non_negative CHECK (order_index >= 0);

-- Add composite indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_exercises_muscle_type ON exercises(primary_muscle_group, exercise_type);
CREATE INDEX IF NOT EXISTS idx_exercises_global_muscle ON exercises(is_global, primary_muscle_group) WHERE is_global = true;
CREATE INDEX IF NOT EXISTS idx_exercises_user_created ON exercises(created_by, created_at) WHERE created_by IS NOT NULL;

-- Add composite indexes for programs
CREATE INDEX IF NOT EXISTS idx_programs_user_active_current ON programs(user_id, is_active, is_current);
CREATE INDEX IF NOT EXISTS idx_programs_template_difficulty ON programs(is_template, difficulty) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_programs_user_start_date ON programs(user_id, start_date) WHERE start_date IS NOT NULL;

-- Add indexes for program_workouts ordering and lookups
CREATE INDEX IF NOT EXISTS idx_program_workouts_program_week ON program_workouts(program_id, week_number);
CREATE INDEX IF NOT EXISTS idx_program_workouts_program_day ON program_workouts(program_id, day_number);

-- Add indexes for program_exercises relationships
CREATE INDEX IF NOT EXISTS idx_program_exercises_workout_order ON program_exercises(workout_id, order_index);
CREATE INDEX IF NOT EXISTS idx_program_exercises_exercise_workout ON program_exercises(exercise_id, workout_id);

-- Create function to validate program workout consistency
CREATE OR REPLACE FUNCTION validate_program_workout_consistency()
RETURNS TRIGGER AS $$
DECLARE
    program_days_per_week INTEGER;
    program_duration INTEGER;
BEGIN
    -- Get program constraints
    SELECT days_per_week, duration INTO program_days_per_week, program_duration
    FROM programs WHERE id = NEW.program_id;
    
    -- Validate day number doesn't exceed days per week
    IF NEW.day_number > program_days_per_week THEN
        RAISE EXCEPTION 'Day number % exceeds program days per week %', NEW.day_number, program_days_per_week;
    END IF;
    
    -- Validate week number doesn't exceed program duration
    IF NEW.week_number > program_duration THEN
        RAISE EXCEPTION 'Week number % exceeds program duration %', NEW.week_number, program_duration;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for program workout validation
CREATE TRIGGER validate_program_workout_trigger
    BEFORE INSERT OR UPDATE ON program_workouts
    FOR EACH ROW EXECUTE FUNCTION validate_program_workout_consistency();

-- Create function to update program updated_at timestamp
CREATE OR REPLACE FUNCTION update_program_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE programs SET updated_at = NOW() WHERE id = NEW.program_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to update program timestamp when workouts or exercises change
CREATE TRIGGER update_program_on_workout_change
    AFTER INSERT OR UPDATE OR DELETE ON program_workouts
    FOR EACH ROW EXECUTE FUNCTION update_program_timestamp();

CREATE TRIGGER update_program_on_exercise_change
    AFTER INSERT OR UPDATE OR DELETE ON program_exercises
    FOR EACH ROW EXECUTE FUNCTION update_program_timestamp();

-- Create function to ensure only one current program per user
CREATE OR REPLACE FUNCTION ensure_single_current_program()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current = true THEN
        -- Set all other programs for this user to not current
        UPDATE programs 
        SET is_current = false, updated_at = NOW()
        WHERE user_id = NEW.user_id AND id != NEW.id AND is_current = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to ensure only one current program per user
CREATE TRIGGER ensure_single_current_program_trigger
    AFTER INSERT OR UPDATE ON programs
    FOR EACH ROW EXECUTE FUNCTION ensure_single_current_program();

-- Add updated_at trigger for exercises table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_exercises_updated_at
    BEFORE UPDATE ON exercises
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_programs_updated_at
    BEFORE UPDATE ON programs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for program summary with workout counts
CREATE OR REPLACE VIEW program_summary AS
SELECT 
    p.*,
    COUNT(DISTINCT pw.id) as total_workouts,
    COUNT(DISTINCT pe.id) as total_exercises,
    COALESCE(AVG(pe.sets), 0) as avg_sets_per_exercise
FROM programs p
LEFT JOIN program_workouts pw ON p.id = pw.program_id
LEFT JOIN program_exercises pe ON pw.id = pe.workout_id
GROUP BY p.id;

-- Create view for exercise usage statistics
CREATE OR REPLACE VIEW exercise_usage_stats AS
SELECT 
    e.*,
    COUNT(DISTINCT pe.id) as program_usage_count,
    COUNT(DISTINCT wle.id) as workout_log_usage_count,
    COUNT(DISTINCT pe.workout_id) as unique_workouts_count
FROM exercises e
LEFT JOIN program_exercises pe ON e.id = pe.exercise_id
LEFT JOIN workout_log_exercises wle ON e.id = wle.exercise_id
GROUP BY e.id;

-- Add comments for documentation
COMMENT ON TABLE exercises IS 'Exercise library containing both global and user-created exercises';
COMMENT ON TABLE programs IS 'User workout programs with structured weekly schedules';
COMMENT ON TABLE program_workouts IS 'Individual workout sessions within a program';
COMMENT ON TABLE program_exercises IS 'Exercises assigned to specific workout sessions';

COMMENT ON COLUMN exercises.is_global IS 'True for system-wide exercises, false for user-created exercises';
COMMENT ON COLUMN programs.is_current IS 'Only one program per user can be current at a time';
COMMENT ON COLUMN programs.is_template IS 'Template programs can be copied by other users';
COMMENT ON COLUMN program_workouts.week_number IS 'Week number within the program (1-based)';
COMMENT ON COLUMN program_workouts.day_number IS 'Day number within the week (1-7)';
COMMENT ON COLUMN program_exercises.order_index IS 'Order of exercise within the workout (0-based)';