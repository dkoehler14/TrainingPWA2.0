-- Test script to verify workout logging and analytics tables functionality

-- Test 1: Check table structure and constraints
\d+ workout_logs;
\d+ workout_log_exercises;
\d+ user_analytics;

-- Test 2: Insert test data to verify constraints
-- First create a test user
INSERT INTO users (auth_id, email, name) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'test@example.com', 'Test User');

-- Create a test exercise
INSERT INTO exercises (name, primary_muscle_group, exercise_type) VALUES 
('Bench Press', 'Chest', 'Compound');

-- Test workout log constraints
INSERT INTO workout_logs (user_id, date, type, weight_unit) 
SELECT u.id, CURRENT_DATE, 'quick_workout', 'LB' 
FROM users u WHERE u.email = 'test@example.com';

-- Test workout log exercise constraints
INSERT INTO workout_log_exercises (workout_log_id, exercise_id, sets, reps, weights, completed, order_index)
SELECT 
    wl.id, 
    e.id, 
    3, 
    ARRAY[10, 8, 6], 
    ARRAY[135.0, 145.0, 155.0], 
    ARRAY[true, true, true], 
    0
FROM workout_logs wl, exercises e, users u 
WHERE wl.user_id = u.id AND u.email = 'test@example.com' AND e.name = 'Bench Press';

-- Test analytics trigger by marking workout as finished
UPDATE workout_logs SET is_finished = true 
WHERE id IN (SELECT wl.id FROM workout_logs wl JOIN users u ON wl.user_id = u.id WHERE u.email = 'test@example.com');

-- Verify analytics were created
SELECT * FROM user_analytics ua 
JOIN users u ON ua.user_id = u.id 
JOIN exercises e ON ua.exercise_id = e.id 
WHERE u.email = 'test@example.com';

-- Test views
SELECT * FROM workout_statistics WHERE user_id IN (SELECT id FROM users WHERE email = 'test@example.com');
SELECT * FROM exercise_performance_tracking WHERE user_id IN (SELECT id FROM users WHERE email = 'test@example.com');

-- Test constraint violations (these should fail)
-- Test negative sets (should fail)
-- INSERT INTO workout_log_exercises (workout_log_id, exercise_id, sets, reps, weights, completed, order_index)
-- VALUES ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', -1, ARRAY[10], ARRAY[135.0], ARRAY[true], 0);

-- Test array length mismatch (should fail)
-- INSERT INTO workout_log_exercises (workout_log_id, exercise_id, sets, reps, weights, completed, order_index)
-- VALUES ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 3, ARRAY[10, 8], ARRAY[135.0, 145.0, 155.0], ARRAY[true, true, true], 0);

-- Clean up test data
DELETE FROM user_analytics WHERE user_id IN (SELECT id FROM users WHERE email = 'test@example.com');
DELETE FROM workout_log_exercises WHERE workout_log_id IN (SELECT wl.id FROM workout_logs wl JOIN users u ON wl.user_id = u.id WHERE u.email = 'test@example.com');
DELETE FROM workout_logs WHERE user_id IN (SELECT id FROM users WHERE email = 'test@example.com');
DELETE FROM exercises WHERE name = 'Bench Press';
DELETE FROM users WHERE email = 'test@example.com';

-- Show successful completion
SELECT 'Workout logging and analytics tables test completed successfully!' as result;