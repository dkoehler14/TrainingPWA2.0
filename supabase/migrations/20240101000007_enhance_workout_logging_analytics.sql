-- Enhance workout logging and analytics tables
-- This migration adds constraints, validations, triggers, and performance optimizations
-- for workout_logs, workout_log_exercises, and user_analytics tables

-- Add check constraints for workout_logs table
ALTER TABLE workout_logs 
ADD CONSTRAINT check_workout_log_date_not_future CHECK (date <= CURRENT_DATE),
ADD CONSTRAINT check_workout_log_duration_positive CHECK (duration IS NULL OR duration > 0),
ADD CONSTRAINT check_workout_log_weight_unit_valid CHECK (weight_unit IN ('LB', 'KG')),
ADD CONSTRAINT check_workout_log_type_valid CHECK (type IN ('program_workout', 'quick_workout', 'custom_workout')),
ADD CONSTRAINT check_workout_log_week_index_non_negative CHECK (week_index IS NULL OR week_index >= 0),
ADD CONSTRAINT check_workout_log_day_index_valid CHECK (day_index IS NULL OR (day_index >= 0 AND day_index <= 6)),
ADD CONSTRAINT check_workout_log_program_consistency CHECK (
    (program_id IS NOT NULL AND week_index IS NOT NULL AND day_index IS NOT NULL) OR
    (program_id IS NULL)
);

-- Add check constraints for workout_log_exercises table
ALTER TABLE workout_log_exercises
ADD CONSTRAINT check_workout_log_exercise_sets_positive CHECK (sets > 0),
ADD CONSTRAINT check_workout_log_exercise_arrays_length_match CHECK (
    array_length(reps, 1) = sets AND 
    array_length(weights, 1) = sets AND 
    array_length(completed, 1) = sets
),
ADD CONSTRAINT check_workout_log_exercise_bodyweight_positive CHECK (bodyweight IS NULL OR bodyweight > 0),
ADD CONSTRAINT check_workout_log_exercise_order_index_non_negative CHECK (order_index >= 0),
ADD CONSTRAINT check_workout_log_exercise_original_index_valid CHECK (original_index >= -1),
ADD CONSTRAINT check_workout_log_exercise_added_type_valid CHECK (
    added_type IS NULL OR added_type IN ('superset', 'dropset', 'custom', 'replacement')
);

-- Add check constraints for user_analytics table
ALTER TABLE user_analytics
ADD CONSTRAINT check_user_analytics_total_volume_non_negative CHECK (total_volume >= 0),
ADD CONSTRAINT check_user_analytics_max_weight_non_negative CHECK (max_weight >= 0),
ADD CONSTRAINT check_user_analytics_total_reps_non_negative CHECK (total_reps >= 0),
ADD CONSTRAINT check_user_analytics_total_sets_non_negative CHECK (total_sets >= 0),
ADD CONSTRAINT check_user_analytics_last_workout_not_future CHECK (last_workout_date IS NULL OR last_workout_date <= CURRENT_DATE),
ADD CONSTRAINT check_user_analytics_pr_date_not_future CHECK (pr_date IS NULL OR pr_date <= CURRENT_DATE),
ADD CONSTRAINT check_user_analytics_pr_date_after_last_workout CHECK (
    pr_date IS NULL OR last_workout_date IS NULL OR pr_date <= last_workout_date
);

-- Create additional performance indexes for workout queries
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_type_date ON workout_logs(user_id, type, date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_logs_completed_date ON workout_logs(user_id, completed_date DESC) WHERE completed_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workout_logs_program_week_day ON workout_logs(program_id, week_index, day_index) WHERE program_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workout_logs_duration ON workout_logs(user_id, duration DESC) WHERE duration IS NOT NULL;

-- Create composite indexes for workout log exercises (using join for date lookup)
CREATE INDEX IF NOT EXISTS idx_workout_log_exercises_exercise_id_workout_id ON workout_log_exercises(exercise_id, workout_log_id);
CREATE INDEX IF NOT EXISTS idx_workout_log_exercises_added ON workout_log_exercises(workout_log_id, is_added, added_type) WHERE is_added = true;
-- Note: Cannot create index with subquery predicate, will rely on application-level filtering for completed exercises

-- Create specialized indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_user_analytics_exercise_volume ON user_analytics(exercise_id, total_volume DESC);
CREATE INDEX IF NOT EXISTS idx_user_analytics_exercise_max_weight ON user_analytics(exercise_id, max_weight DESC);
CREATE INDEX IF NOT EXISTS idx_user_analytics_recent_activity ON user_analytics(user_id, last_workout_date DESC) WHERE last_workout_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_analytics_pr_tracking ON user_analytics(user_id, pr_date DESC) WHERE pr_date IS NOT NULL;

-- Create function to automatically update user analytics when workout is completed
CREATE OR REPLACE FUNCTION update_user_analytics_on_workout_completion()
RETURNS TRIGGER AS $$
DECLARE
    exercise_record RECORD;
    total_volume_calc DECIMAL(10,2);
    max_weight_calc DECIMAL(6,2);
    total_reps_calc INTEGER;
    total_sets_calc INTEGER;
BEGIN
    -- Only process if workout is being marked as finished
    IF NEW.is_finished = true AND (OLD.is_finished IS NULL OR OLD.is_finished = false) THEN
        -- Process each exercise in the completed workout
        FOR exercise_record IN 
            SELECT 
                wle.exercise_id,
                SUM(
                    CASE 
                        WHEN wle.weights IS NOT NULL AND wle.reps IS NOT NULL THEN
                            (SELECT SUM(w * r) FROM unnest(wle.weights, wle.reps) AS t(w, r) WHERE t.w > 0 AND t.r > 0)
                        ELSE 0
                    END
                ) as workout_volume,
                MAX(
                    CASE 
                        WHEN wle.weights IS NOT NULL THEN
                            (SELECT MAX(w) FROM unnest(wle.weights) AS w WHERE w > 0)
                        ELSE 0
                    END
                ) as workout_max_weight,
                SUM(
                    CASE 
                        WHEN wle.reps IS NOT NULL THEN
                            (SELECT SUM(r) FROM unnest(wle.reps) AS r WHERE r > 0)
                        ELSE 0
                    END
                ) as workout_total_reps,
                SUM(wle.sets) as workout_total_sets
            FROM workout_log_exercises wle
            WHERE wle.workout_log_id = NEW.id
            GROUP BY wle.exercise_id
        LOOP
            -- Update or insert analytics record
            INSERT INTO user_analytics (
                user_id, 
                exercise_id, 
                total_volume, 
                max_weight, 
                total_reps, 
                total_sets, 
                last_workout_date,
                pr_date,
                updated_at
            )
            VALUES (
                NEW.user_id,
                exercise_record.exercise_id,
                exercise_record.workout_volume,
                exercise_record.workout_max_weight,
                exercise_record.workout_total_reps,
                exercise_record.workout_total_sets,
                NEW.date,
                CASE 
                    WHEN exercise_record.workout_max_weight > 0 THEN NEW.date
                    ELSE NULL
                END,
                NOW()
            )
            ON CONFLICT (user_id, exercise_id) DO UPDATE SET
                total_volume = user_analytics.total_volume + exercise_record.workout_volume,
                max_weight = GREATEST(user_analytics.max_weight, exercise_record.workout_max_weight),
                total_reps = user_analytics.total_reps + exercise_record.workout_total_reps,
                total_sets = user_analytics.total_sets + exercise_record.workout_total_sets,
                last_workout_date = GREATEST(user_analytics.last_workout_date, NEW.date),
                pr_date = CASE 
                    WHEN exercise_record.workout_max_weight > user_analytics.max_weight THEN NEW.date
                    ELSE user_analytics.pr_date
                END,
                updated_at = NOW();
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update analytics on workout completion
CREATE TRIGGER update_analytics_on_workout_completion
    AFTER UPDATE ON workout_logs
    FOR EACH ROW EXECUTE FUNCTION update_user_analytics_on_workout_completion();

-- Create function to validate workout log exercise data consistency
CREATE OR REPLACE FUNCTION validate_workout_log_exercise_data()
RETURNS TRIGGER AS $$
DECLARE
    rep_value INTEGER;
    weight_value DECIMAL(6,2);
BEGIN
    -- Ensure arrays have the correct length
    IF array_length(NEW.reps, 1) != NEW.sets THEN
        RAISE EXCEPTION 'Reps array length (%) must match sets count (%)', array_length(NEW.reps, 1), NEW.sets;
    END IF;
    
    IF array_length(NEW.weights, 1) != NEW.sets THEN
        RAISE EXCEPTION 'Weights array length (%) must match sets count (%)', array_length(NEW.weights, 1), NEW.sets;
    END IF;
    
    IF array_length(NEW.completed, 1) != NEW.sets THEN
        RAISE EXCEPTION 'Completed array length (%) must match sets count (%)', array_length(NEW.completed, 1), NEW.sets;
    END IF;
    
    -- Validate reps are positive
    IF NEW.reps IS NOT NULL THEN
        FOREACH rep_value IN ARRAY NEW.reps LOOP
            IF rep_value <= 0 THEN
                RAISE EXCEPTION 'All reps must be positive, found: %', rep_value;
            END IF;
        END LOOP;
    END IF;
    
    -- Validate weights are non-negative
    IF NEW.weights IS NOT NULL THEN
        FOREACH weight_value IN ARRAY NEW.weights LOOP
            IF weight_value < 0 THEN
                RAISE EXCEPTION 'All weights must be non-negative, found: %', weight_value;
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for workout log exercise validation
CREATE TRIGGER validate_workout_log_exercise_data_trigger
    BEFORE INSERT OR UPDATE ON workout_log_exercises
    FOR EACH ROW EXECUTE FUNCTION validate_workout_log_exercise_data();

-- Create function to update workout log timestamp when exercises change
CREATE OR REPLACE FUNCTION update_workout_log_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE workout_logs SET updated_at = NOW() WHERE id = COALESCE(NEW.workout_log_id, OLD.workout_log_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update workout log timestamp
CREATE TRIGGER update_workout_log_on_exercise_change
    AFTER INSERT OR UPDATE OR DELETE ON workout_log_exercises
    FOR EACH ROW EXECUTE FUNCTION update_workout_log_timestamp();

-- Create function to prevent modification of finished workouts
CREATE OR REPLACE FUNCTION prevent_finished_workout_modification()
RETURNS TRIGGER AS $$
DECLARE
    workout_finished BOOLEAN;
BEGIN
    -- Check if the workout is finished
    SELECT is_finished INTO workout_finished 
    FROM workout_logs 
    WHERE id = COALESCE(NEW.workout_log_id, OLD.workout_log_id);
    
    -- Prevent modifications to finished workouts (except for notes)
    IF workout_finished = true AND TG_OP != 'DELETE' THEN
        IF OLD IS NOT NULL AND (
            NEW.sets != OLD.sets OR
            NEW.reps != OLD.reps OR
            NEW.weights != OLD.weights OR
            NEW.completed != OLD.completed OR
            NEW.bodyweight != OLD.bodyweight OR
            NEW.is_added != OLD.is_added OR
            NEW.added_type != OLD.added_type OR
            NEW.order_index != OLD.order_index
        ) THEN
            RAISE EXCEPTION 'Cannot modify exercise data for finished workout';
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to prevent finished workout modification
CREATE TRIGGER prevent_finished_workout_exercise_modification
    BEFORE UPDATE OR DELETE ON workout_log_exercises
    FOR EACH ROW EXECUTE FUNCTION prevent_finished_workout_modification();

-- Create updated_at triggers for workout logging tables
CREATE TRIGGER update_workout_logs_updated_at
    BEFORE UPDATE ON workout_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_analytics_updated_at
    BEFORE UPDATE ON user_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for workout statistics
CREATE OR REPLACE VIEW workout_statistics AS
SELECT 
    wl.user_id,
    wl.id as workout_log_id,
    wl.name as workout_name,
    wl.date,
    wl.duration,
    wl.type,
    COUNT(wle.id) as total_exercises,
    SUM(wle.sets) as total_sets,
    SUM(
        CASE 
            WHEN wle.reps IS NOT NULL THEN
                (SELECT SUM(r) FROM unnest(wle.reps) AS r WHERE r > 0)
            ELSE 0
        END
    ) as total_reps,
    SUM(
        CASE 
            WHEN wle.weights IS NOT NULL AND wle.reps IS NOT NULL THEN
                (SELECT SUM(w * r) FROM unnest(wle.weights, wle.reps) AS t(w, r) WHERE t.w > 0 AND t.r > 0)
            ELSE 0
        END
    ) as total_volume,
    MAX(
        CASE 
            WHEN wle.weights IS NOT NULL THEN
                (SELECT MAX(w) FROM unnest(wle.weights) AS w WHERE w > 0)
            ELSE 0
        END
    ) as max_weight_lifted,
    COUNT(CASE WHEN wle.is_added = true THEN 1 END) as added_exercises_count
FROM workout_logs wl
LEFT JOIN workout_log_exercises wle ON wl.id = wle.workout_log_id
WHERE wl.is_finished = true
GROUP BY wl.user_id, wl.id, wl.name, wl.date, wl.duration, wl.type;

-- Create view for exercise performance tracking
CREATE OR REPLACE VIEW exercise_performance_tracking AS
SELECT 
    ua.user_id,
    ua.exercise_id,
    e.name as exercise_name,
    e.primary_muscle_group,
    ua.total_volume,
    ua.max_weight,
    ua.total_reps,
    ua.total_sets,
    ua.last_workout_date,
    ua.pr_date,
    -- Calculate average volume per workout
    CASE 
        WHEN workout_count.count > 0 THEN ua.total_volume / workout_count.count
        ELSE 0
    END as avg_volume_per_workout,
    -- Calculate average weight per set
    CASE 
        WHEN ua.total_sets > 0 THEN ua.total_volume / ua.total_sets
        ELSE 0
    END as avg_weight_per_set,
    workout_count.count as total_workouts
FROM user_analytics ua
JOIN exercises e ON ua.exercise_id = e.id
LEFT JOIN (
    SELECT 
        wle.exercise_id,
        COUNT(DISTINCT wl.id) as count
    FROM workout_log_exercises wle
    JOIN workout_logs wl ON wle.workout_log_id = wl.id
    WHERE wl.is_finished = true
    GROUP BY wle.exercise_id
) workout_count ON ua.exercise_id = workout_count.exercise_id;

-- Create view for recent workout activity
CREATE OR REPLACE VIEW recent_workout_activity AS
SELECT 
    wl.user_id,
    wl.id as workout_log_id,
    wl.name as workout_name,
    wl.date,
    wl.completed_date,
    wl.duration,
    wl.type,
    COUNT(wle.id) as exercise_count,
    SUM(wle.sets) as total_sets,
    ARRAY_AGG(
        JSON_BUILD_OBJECT(
            'exercise_name', e.name,
            'sets', wle.sets,
            'max_weight', (SELECT MAX(w) FROM unnest(wle.weights) AS w WHERE w > 0),
            'total_reps', (SELECT SUM(r) FROM unnest(wle.reps) AS r WHERE r > 0)
        ) ORDER BY wle.order_index
    ) as exercises_summary
FROM workout_logs wl
LEFT JOIN workout_log_exercises wle ON wl.id = wle.workout_log_id
LEFT JOIN exercises e ON wle.exercise_id = e.id
WHERE wl.is_finished = true
GROUP BY wl.user_id, wl.id, wl.name, wl.date, wl.completed_date, wl.duration, wl.type
ORDER BY wl.completed_date DESC;

-- Add comments for documentation
COMMENT ON TABLE workout_logs IS 'User workout sessions with program tracking and completion status';
COMMENT ON TABLE workout_log_exercises IS 'Individual exercises performed within workout sessions';
COMMENT ON TABLE user_analytics IS 'Aggregated exercise performance statistics per user';

COMMENT ON COLUMN workout_logs.is_draft IS 'True for in-progress workouts, false for completed workouts';
COMMENT ON COLUMN workout_logs.week_index IS 'Zero-based week index within the program';
COMMENT ON COLUMN workout_logs.day_index IS 'Zero-based day index within the week (0=Monday, 6=Sunday)';
COMMENT ON COLUMN workout_log_exercises.reps IS 'Array of reps performed for each set';
COMMENT ON COLUMN workout_log_exercises.weights IS 'Array of weights used for each set';
COMMENT ON COLUMN workout_log_exercises.completed IS 'Array indicating completion status of each set';
COMMENT ON COLUMN workout_log_exercises.is_added IS 'True if exercise was added during workout (not from program)';
COMMENT ON COLUMN workout_log_exercises.original_index IS 'Original position in program (-1 for added exercises)';
COMMENT ON COLUMN user_analytics.total_volume IS 'Cumulative volume (weight × reps) across all workouts';
COMMENT ON COLUMN user_analytics.pr_date IS 'Date when personal record (max_weight) was achieved';

-- Create function to clean up old draft workouts (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_draft_workouts()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM workout_logs 
    WHERE is_draft = true 
    AND created_at < NOW() - INTERVAL '7 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to recalculate user analytics for a specific user and exercise
CREATE OR REPLACE FUNCTION recalculate_user_analytics(target_user_id UUID, target_exercise_id UUID)
RETURNS VOID AS $$
DECLARE
    calc_total_volume DECIMAL(10,2);
    calc_max_weight DECIMAL(6,2);
    calc_total_reps INTEGER;
    calc_total_sets INTEGER;
    calc_last_workout_date DATE;
    calc_pr_date DATE;
BEGIN
    -- Calculate aggregated statistics from workout logs
    SELECT 
        COALESCE(SUM(
            CASE 
                WHEN wle.weights IS NOT NULL AND wle.reps IS NOT NULL THEN
                    (SELECT SUM(w * r) FROM unnest(wle.weights, wle.reps) AS t(w, r) WHERE t.w > 0 AND t.r > 0)
                ELSE 0
            END
        ), 0),
        COALESCE(MAX(
            CASE 
                WHEN wle.weights IS NOT NULL THEN
                    (SELECT MAX(w) FROM unnest(wle.weights) AS w WHERE w > 0)
                ELSE 0
            END
        ), 0),
        COALESCE(SUM(
            CASE 
                WHEN wle.reps IS NOT NULL THEN
                    (SELECT SUM(r) FROM unnest(wle.reps) AS r WHERE r > 0)
                ELSE 0
            END
        ), 0),
        COALESCE(SUM(wle.sets), 0),
        MAX(wl.date),
        MAX(CASE 
            WHEN wle.weights IS NOT NULL AND (SELECT MAX(w) FROM unnest(wle.weights) AS w WHERE w > 0) > 0 
            THEN wl.date 
            ELSE NULL 
        END)
    INTO 
        calc_total_volume,
        calc_max_weight,
        calc_total_reps,
        calc_total_sets,
        calc_last_workout_date,
        calc_pr_date
    FROM workout_log_exercises wle
    JOIN workout_logs wl ON wle.workout_log_id = wl.id
    WHERE wl.user_id = target_user_id 
    AND wle.exercise_id = target_exercise_id
    AND wl.is_finished = true;
    
    -- Update or insert the analytics record
    INSERT INTO user_analytics (
        user_id,
        exercise_id,
        total_volume,
        max_weight,
        total_reps,
        total_sets,
        last_workout_date,
        pr_date,
        updated_at
    )
    VALUES (
        target_user_id,
        target_exercise_id,
        calc_total_volume,
        calc_max_weight,
        calc_total_reps,
        calc_total_sets,
        calc_last_workout_date,
        calc_pr_date,
        NOW()
    )
    ON CONFLICT (user_id, exercise_id) DO UPDATE SET
        total_volume = calc_total_volume,
        max_weight = calc_max_weight,
        total_reps = calc_total_reps,
        total_sets = calc_total_sets,
        last_workout_date = calc_last_workout_date,
        pr_date = calc_pr_date,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;