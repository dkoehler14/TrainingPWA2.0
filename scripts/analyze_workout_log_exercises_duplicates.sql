-- Script to analyze workout_log_exercises for duplicate exercises within the same workout
-- This helps determine if we need data cleanup before adding the unique constraint

-- Find all duplicate exercise entries within the same workout_log
SELECT
    workout_log_id,
    exercise_id,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(id ORDER BY created_at) as duplicate_ids,
    ARRAY_AGG(order_index ORDER BY created_at) as order_indexes
FROM workout_log_exercises
GROUP BY workout_log_id, exercise_id
HAVING COUNT(*) > 1
ORDER BY workout_log_id, exercise_id;

-- Summary statistics
SELECT
    'Total duplicate groups' as metric,
    COUNT(*) as value
FROM (
    SELECT workout_log_id, exercise_id
    FROM workout_log_exercises
    GROUP BY workout_log_id, exercise_id
    HAVING COUNT(*) > 1
) duplicates;

-- Show details of workouts with duplicates
SELECT
    wl.id as workout_log_id,
    wl.user_id,
    wl.program_id,
    wl.week_index,
    wl.day_index,
    wl.name as workout_name,
    wl.date,
    COUNT(wle.id) as total_exercises,
    COUNT(DISTINCT wle.exercise_id) as unique_exercises,
    (COUNT(wle.id) - COUNT(DISTINCT wle.exercise_id)) as duplicate_count
FROM workout_logs wl
JOIN workout_log_exercises wle ON wl.id = wle.workout_log_id
GROUP BY wl.id, wl.user_id, wl.program_id, wl.week_index, wl.day_index, wl.name, wl.date
HAVING (COUNT(wle.id) - COUNT(DISTINCT wle.exercise_id)) > 0
ORDER BY duplicate_count DESC, wl.date DESC;

-- Show exercise details for duplicate entries
SELECT
    wle.workout_log_id,
    wle.exercise_id,
    e.name as exercise_name,
    e.primary_muscle_group,
    COUNT(*) as instances,
    ARRAY_AGG(wle.order_index ORDER BY wle.order_index) as order_positions,
    ARRAY_AGG(wle.sets ORDER BY wle.order_index) as sets_values,
    ARRAY_AGG(wle.is_added ORDER BY wle.order_index) as is_added_flags,
    ARRAY_AGG(wle.added_type ORDER BY wle.order_index) as added_types
FROM workout_log_exercises wle
JOIN exercises e ON wle.exercise_id = e.id
GROUP BY wle.workout_log_id, wle.exercise_id, e.name, e.primary_muscle_group
HAVING COUNT(*) > 1
ORDER BY wle.workout_log_id, e.name;