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

-- Note: User-dependent data (users, programs, workouts, etc.) is now handled by
-- the JavaScript seeder (scripts/seed/supabase/seeder.js) which properly creates
-- auth users first and then creates database records with matching IDs.
-- This ensures that user.id = auth.uid() as required by the simplified schema.