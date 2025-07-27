-- Seed data for development environment
-- This file contains sample data to help with development and testing

-- Clear existing data (in case of re-seeding)
TRUNCATE TABLE user_analytics, workout_log_exercises, workout_logs, program_exercises, program_workouts, programs, users, exercises RESTART IDENTITY CASCADE;

-- Insert global exercises (similar to current Firestore data)
INSERT INTO exercises (id, name, primary_muscle_group, exercise_type, instructions, is_global) VALUES
-- Chest exercises
('550e8400-e29b-41d4-a716-446655440001', 'Bench Press', 'Chest', 'Compound', 'Lie on bench, lower bar to chest, press up', true),
('550e8400-e29b-41d4-a716-446655440002', 'Push-ups', 'Chest', 'Bodyweight', 'Start in plank position, lower chest to ground, push up', true),
('550e8400-e29b-41d4-a716-446655440003', 'Incline Dumbbell Press', 'Chest', 'Compound', 'On incline bench, press dumbbells up and together', true),
('550e8400-e29b-41d4-a716-446655440004', 'Dumbbell Flyes', 'Chest', 'Isolation', 'Lie on bench, arc dumbbells out and back together', true),

-- Back exercises
('550e8400-e29b-41d4-a716-446655440005', 'Pull-ups', 'Back', 'Compound', 'Hang from bar, pull body up until chin over bar', true),
('550e8400-e29b-41d4-a716-446655440006', 'Bent-over Row', 'Back', 'Compound', 'Bend at hips, pull weight to lower chest', true),
('550e8400-e29b-41d4-a716-446655440007', 'Lat Pulldown', 'Back', 'Compound', 'Pull bar down to upper chest, squeeze shoulder blades', true),
('550e8400-e29b-41d4-a716-446655440008', 'Deadlift', 'Back', 'Compound', 'Lift weight from ground by extending hips and knees', true),

-- Legs exercises
('550e8400-e29b-41d4-a716-446655440009', 'Squat', 'Legs', 'Compound', 'Lower body by bending knees and hips, return to standing', true),
('550e8400-e29b-41d4-a716-44665544000a', 'Leg Press', 'Legs', 'Compound', 'Push weight away using legs while seated', true),
('550e8400-e29b-41d4-a716-44665544000b', 'Lunges', 'Legs', 'Compound', 'Step forward, lower back knee toward ground', true),
('550e8400-e29b-41d4-a716-44665544000c', 'Leg Curl', 'Legs', 'Isolation', 'Curl heels toward glutes against resistance', true),

-- Shoulders exercises
('550e8400-e29b-41d4-a716-44665544000d', 'Overhead Press', 'Shoulders', 'Compound', 'Press weight overhead from shoulder level', true),
('550e8400-e29b-41d4-a716-44665544000e', 'Lateral Raises', 'Shoulders', 'Isolation', 'Raise arms out to sides to shoulder height', true),
('550e8400-e29b-41d4-a716-44665544000f', 'Front Raises', 'Shoulders', 'Isolation', 'Raise arms forward to shoulder height', true),
('550e8400-e29b-41d4-a716-446655440010', 'Rear Delt Flyes', 'Shoulders', 'Isolation', 'Bend forward, raise arms out to sides', true),

-- Arms exercises
('550e8400-e29b-41d4-a716-446655440011', 'Bicep Curls', 'Arms', 'Isolation', 'Curl weight up by flexing biceps', true),
('550e8400-e29b-41d4-a716-446655440012', 'Tricep Dips', 'Arms', 'Compound', 'Lower body by bending arms, push back up', true),
('550e8400-e29b-41d4-a716-446655440013', 'Hammer Curls', 'Arms', 'Isolation', 'Curl with neutral grip, thumbs up', true),
('550e8400-e29b-41d4-a716-446655440014', 'Tricep Extensions', 'Arms', 'Isolation', 'Extend arms overhead, lower weight behind head', true),

-- Core exercises
('550e8400-e29b-41d4-a716-446655440015', 'Plank', 'Core', 'Isometric', 'Hold body straight in push-up position', true),
('550e8400-e29b-41d4-a716-446655440016', 'Crunches', 'Core', 'Isolation', 'Lift shoulders off ground by contracting abs', true),
('550e8400-e29b-41d4-a716-446655440017', 'Russian Twists', 'Core', 'Isolation', 'Rotate torso side to side while seated', true),
('550e8400-e29b-41d4-a716-446655440018', 'Mountain Climbers', 'Core', 'Cardio', 'Alternate bringing knees to chest in plank position', true);

-- Create sample development users for testing
-- Note: In production, users will be created through Supabase Auth
INSERT INTO users (id, auth_id, email, name, experience_level, preferred_units, age, weight, height, goals, available_equipment, injuries, preferences, settings) VALUES
('550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440100', 'test@example.com', 'Test User', 'beginner', 'LB', 25, 150.0, 70.0, '{"Build Muscle", "Get Stronger"}', '{"Dumbbells", "Barbell", "Bench"}', '{}', '{}', '{}'),
('550e8400-e29b-41d4-a716-446655440101', '550e8400-e29b-41d4-a716-446655440101', 'beginner@example.com', 'Beginner User', 'beginner', 'LB', 22, 140.0, 68.0, '{"Lose Weight", "Build Muscle"}', '{"Dumbbells", "Resistance Bands"}', '{}', '{}', '{}'),
('550e8400-e29b-41d4-a716-446655440102', '550e8400-e29b-41d4-a716-446655440102', 'intermediate@example.com', 'Intermediate User', 'intermediate', 'LB', 28, 165.0, 72.0, '{"Build Muscle", "Improve Endurance"}', '{"Dumbbells", "Barbell", "Bench", "Pull-up Bar"}', '{}', '{}', '{}'),
('550e8400-e29b-41d4-a716-446655440103', '550e8400-e29b-41d4-a716-446655440103', 'advanced@example.com', 'Advanced User', 'advanced', 'LB', 32, 180.0, 74.0, '{"Get Stronger", "Build Muscle", "Improve Performance"}', '{"Dumbbells", "Barbell", "Bench", "Pull-up Bar", "Squat Rack"}', '{}', '{}', '{}');

-- Create sample programs for testing
INSERT INTO programs (id, user_id, name, description, duration, days_per_week, weight_unit, difficulty, goals, equipment, is_template, is_current, is_active, start_date, completed_weeks) VALUES
('550e8400-e29b-41d4-a716-446655440200', '550e8400-e29b-41d4-a716-446655440100', 'Basic Strength Program', 'A simple 3-day strength training program for beginners', 8, 3, 'LB', 'beginner', '{"Build Muscle", "Get Stronger"}', '{"Dumbbells", "Barbell", "Bench"}', false, true, true, CURRENT_DATE, 0),
('550e8400-e29b-41d4-a716-446655440201', '550e8400-e29b-41d4-a716-446655440101', 'Beginner Full Body', 'Full body workout for beginners', 6, 3, 'LB', 'beginner', '{"Lose Weight", "Build Muscle"}', '{"Dumbbells", "Resistance Bands"}', false, true, true, CURRENT_DATE, 1),
('550e8400-e29b-41d4-a716-446655440202', '550e8400-e29b-41d4-a716-446655440102', 'Push Pull Legs', 'Intermediate push/pull/legs split', 12, 6, 'LB', 'intermediate', '{"Build Muscle", "Improve Endurance"}', '{"Dumbbells", "Barbell", "Bench", "Pull-up Bar"}', false, true, true, CURRENT_DATE, 2),
('550e8400-e29b-41d4-a716-446655440203', '550e8400-e29b-41d4-a716-446655440103', 'Advanced Powerlifting', 'Advanced powerlifting program', 16, 4, 'LB', 'advanced', '{"Get Stronger", "Build Muscle"}', '{"Dumbbells", "Barbell", "Bench", "Squat Rack"}', false, true, true, CURRENT_DATE, 4);

-- Create sample program workouts
INSERT INTO program_workouts (id, program_id, week_number, day_number, name) VALUES
-- Basic Strength Program workouts
('550e8400-e29b-41d4-a716-446655440300', '550e8400-e29b-41d4-a716-446655440200', 1, 1, 'Upper Body A'),
('550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440200', 1, 2, 'Lower Body'),
('550e8400-e29b-41d4-a716-446655440302', '550e8400-e29b-41d4-a716-446655440200', 1, 3, 'Upper Body B'),
-- Beginner Full Body workouts
('550e8400-e29b-41d4-a716-446655440303', '550e8400-e29b-41d4-a716-446655440201', 1, 1, 'Full Body A'),
('550e8400-e29b-41d4-a716-446655440304', '550e8400-e29b-41d4-a716-446655440201', 1, 2, 'Full Body B'),
('550e8400-e29b-41d4-a716-446655440305', '550e8400-e29b-41d4-a716-446655440201', 1, 3, 'Full Body C');

-- Create sample program exercises
INSERT INTO program_exercises (id, workout_id, exercise_id, sets, reps, rest_minutes, notes, order_index) VALUES
-- Upper Body A exercises
('550e8400-e29b-41d4-a716-446655440400', '550e8400-e29b-41d4-a716-446655440300', '550e8400-e29b-41d4-a716-446655440001', 3, 8, 3, 'Focus on form', 1),
('550e8400-e29b-41d4-a716-446655440401', '550e8400-e29b-41d4-a716-446655440300', '550e8400-e29b-41d4-a716-446655440006', 3, 10, 2, 'Squeeze shoulder blades', 2),
('550e8400-e29b-41d4-a716-446655440402', '550e8400-e29b-41d4-a716-446655440300', '550e8400-e29b-41d4-a716-44665544000d', 3, 10, 2, 'Control the weight', 3),
-- Lower Body exercises
('550e8400-e29b-41d4-a716-446655440403', '550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440009', 3, 12, 3, 'Go deep', 1),
('550e8400-e29b-41d4-a716-446655440404', '550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-446655440008', 3, 5, 4, 'Keep back straight', 2),
('550e8400-e29b-41d4-a716-446655440405', '550e8400-e29b-41d4-a716-446655440301', '550e8400-e29b-41d4-a716-44665544000b', 3, 10, 2, 'Alternate legs', 3);

-- Create sample workout logs for testing
INSERT INTO workout_logs (id, user_id, program_id, week_index, day_index, name, type, date, completed_date, is_finished, is_draft, weight_unit, duration, notes) VALUES
('550e8400-e29b-41d4-a716-446655440500', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440200', 1, 1, 'Upper Body A', 'program_workout', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '7 days', true, false, 'LB', 45, 'Good workout'),
('550e8400-e29b-41d4-a716-446655440501', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440200', 1, 2, 'Lower Body', 'program_workout', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE - INTERVAL '5 days', true, false, 'LB', 50, 'Legs felt strong'),
('550e8400-e29b-41d4-a716-446655440502', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440200', 1, 3, 'Upper Body B', 'program_workout', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE - INTERVAL '3 days', true, false, 'LB', 40, 'Felt tired'),
('550e8400-e29b-41d4-a716-446655440503', '550e8400-e29b-41d4-a716-446655440100', NULL, NULL, NULL, 'Quick Workout', 'quick_workout', CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE - INTERVAL '1 day', true, false, 'LB', 25, 'Quick session');

-- Create sample workout log exercises
INSERT INTO workout_log_exercises (id, workout_log_id, exercise_id, sets, reps, weights, completed, bodyweight, notes, is_added, added_type, original_index, order_index) VALUES
-- Upper Body A workout exercises
('550e8400-e29b-41d4-a716-446655440600', '550e8400-e29b-41d4-a716-446655440500', '550e8400-e29b-41d4-a716-446655440001', 3, '{8,8,7}', '{135,135,135}', '{true,true,true}', NULL, 'Good form', false, NULL, 1, 1),
('550e8400-e29b-41d4-a716-446655440601', '550e8400-e29b-41d4-a716-446655440500', '550e8400-e29b-41d4-a716-446655440006', 3, '{10,10,9}', '{95,95,95}', '{true,true,true}', NULL, 'Felt strong', false, NULL, 2, 2),
('550e8400-e29b-41d4-a716-446655440602', '550e8400-e29b-41d4-a716-446655440500', '550e8400-e29b-41d4-a716-44665544000d', 3, '{10,10,10}', '{65,65,65}', '{true,true,true}', NULL, 'Perfect reps', false, NULL, 3, 3),
-- Lower Body workout exercises
('550e8400-e29b-41d4-a716-446655440603', '550e8400-e29b-41d4-a716-446655440501', '550e8400-e29b-41d4-a716-446655440009', 3, '{12,12,10}', '{185,185,185}', '{true,true,true}', NULL, 'Deep squats', false, NULL, 1, 1),
('550e8400-e29b-41d4-a716-446655440604', '550e8400-e29b-41d4-a716-446655440501', '550e8400-e29b-41d4-a716-446655440008', 3, '{5,5,5}', '{225,225,225}', '{true,true,true}', NULL, 'PR attempt', false, NULL, 2, 2),
-- Quick workout exercises
('550e8400-e29b-41d4-a716-446655440605', '550e8400-e29b-41d4-a716-446655440503', '550e8400-e29b-41d4-a716-446655440002', 3, '{15,12,10}', '{0,0,0}', '{true,true,true}', 150.0, 'Bodyweight only', true, 'quick_add', -1, 1),
('550e8400-e29b-41d4-a716-446655440606', '550e8400-e29b-41d4-a716-446655440503', '550e8400-e29b-41d4-a716-446655440015', 1, '{60}', '{0}', '{true}', 150.0, '1 minute hold', true, 'quick_add', -1, 2);

-- Create sample user analytics
INSERT INTO user_analytics (id, user_id, exercise_id, total_volume, max_weight, total_reps, total_sets, last_workout_date, pr_date) VALUES
('550e8400-e29b-41d4-a716-446655440700', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440001', 3105.0, 135.0, 23, 3, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '7 days'),
('550e8400-e29b-41d4-a716-446655440701', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440006', 2755.0, 95.0, 29, 3, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '7 days'),
('550e8400-e29b-41d4-a716-446655440702', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-44665544000d', 1950.0, 65.0, 30, 3, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '7 days'),
('550e8400-e29b-41d4-a716-446655440703', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440009', 6290.0, 185.0, 34, 3, CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE - INTERVAL '5 days'),
('550e8400-e29b-41d4-a716-446655440704', '550e8400-e29b-41d4-a716-446655440100', '550e8400-e29b-41d4-a716-446655440008', 3375.0, 225.0, 15, 3, CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE - INTERVAL '5 days');