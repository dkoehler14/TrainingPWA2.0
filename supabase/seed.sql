-- Seed data for development environment
-- This file contains sample data to help with development and testing

-- Clear existing data (in case of re-seeding)
TRUNCATE TABLE user_analytics, workout_log_exercises, workout_logs, program_exercises, program_workouts, programs, users, exercises RESTART IDENTITY CASCADE;

-- Insert global exercises (similar to current Firestore data)
INSERT INTO exercises (id, name, primary_muscle_group, exercise_type, instructions, is_global) VALUES
-- Chest exercises
('550e8400-e29b-41d4-a716-446655440001', 'Barbell Bench Press', 'Chest', 'Barbell', 'Lie on bench, lower bar to chest, press up', true),
('550e8400-e29b-41d4-a716-446655440002', 'Push-ups', 'Chest', 'Bodyweight', 'Start in plank position, lower chest to ground, push up', true),
('550e8400-e29b-41d4-a716-446655440003', 'Incline Dumbbell Press', 'Chest', 'Dumbbell', 'On incline bench, press dumbbells up and together', true),
('550e8400-e29b-41d4-a716-446655440004', 'Dumbbell Flyes', 'Chest', 'Dumbbell', 'Lie on bench, arc dumbbells out and back together', true),

-- Back exercises
('550e8400-e29b-41d4-a716-446655440005', 'Pull-ups', 'Back', 'Bodyweight Loadable', 'Hang from bar, pull body up until chin over bar', true),
('550e8400-e29b-41d4-a716-446655440006', 'Barbell Bent-over Row', 'Back', 'Barbell', 'Bend at hips, pull weight to lower chest', true),
('550e8400-e29b-41d4-a716-446655440007', 'Lat Pulldown', 'Back', 'Cable', 'Pull bar down to upper chest, squeeze shoulder blades', true),
('550e8400-e29b-41d4-a716-446655440008', 'Trap Bar Deadlift', 'Back', 'Trap Bar', 'Lift weight from ground by extending hips and knees', true),

-- Legs exercises
('550e8400-e29b-41d4-a716-446655440009', 'Barbell Squat', 'Quads', 'Barbell', 'Lower body by bending knees and hips, return to standing', true),
('550e8400-e29b-41d4-a716-44665544000a', 'Leg Press', 'Quads', 'Machine', 'Push weight away using legs while seated', true),
('550e8400-e29b-41d4-a716-44665544000b', 'DB Lunges', 'Quads', 'Dumbbell', 'Step forward, lower back knee toward ground', true),
('550e8400-e29b-41d4-a716-44665544000c', '1 Leg Seated Cable Leg Curl', 'Hamstrings', 'Cable', 'Curl heels toward glutes against resistance', true),

-- Shoulders exercises
('550e8400-e29b-41d4-a716-44665544000d', 'Barbell Overhead Press', 'Shoulders', 'Barbell', 'Press weight overhead from shoulder level', true),
('550e8400-e29b-41d4-a716-44665544000e', 'DB Lateral Raises', 'Shoulders', 'Dumbbell', 'Raise arms out to sides to shoulder height', true),
('550e8400-e29b-41d4-a716-44665544000f', 'DB Front Raises', 'Shoulders', 'Dumbbell', 'Raise arms forward to shoulder height', true),
('550e8400-e29b-41d4-a716-446655440010', 'Cable Rear Delt Flyes', 'Shoulders', 'Cable', 'Bend forward, raise arms out to sides', true),

-- Arms exercises
('550e8400-e29b-41d4-a716-446655440011', 'DB Bicep Curls', 'Biceps', 'Dumbbell', 'Curl weight up by flexing biceps', true),
('550e8400-e29b-41d4-a716-446655440012', 'Tricep Dips', 'Triceps', 'Bodyweight Loadable', 'Lower body by bending arms, push back up', true),
('550e8400-e29b-41d4-a716-446655440013', 'DB Hammer Curls', 'Biceps', 'Dumbbell', 'Curl with neutral grip, thumbs up', true),
('550e8400-e29b-41d4-a716-446655440014', 'Cable Overhead Tricep Extensions', 'Triceps', 'Cable', 'Extend arms overhead, lower weight behind head', true),

-- Core exercises
('550e8400-e29b-41d4-a716-446655440015', 'Plank', 'Abs', 'Bodyweight', 'Hold body straight in push-up position', true),
('550e8400-e29b-41d4-a716-446655440016', 'Crunches', 'Abs', 'Bodyweight', 'Lift shoulders off ground by contracting abs', true),
('550e8400-e29b-41d4-a716-446655440017', 'Russian Twists', 'Abs', 'Medicine Ball', 'Rotate torso side to side while seated', true),
('550e8400-e29b-41d4-a716-446655440018', 'Mountain Climbers', 'Abs', 'Bodyweight', 'Alternate bringing knees to chest in plank position', true);

-- Note: User-dependent data (users, programs, workouts, etc.) is now handled by
-- the JavaScript seeder (scripts/seed/supabase/seeder.js) which properly creates
-- auth users first and then creates database records with matching IDs.
-- This ensures that user.id = auth.uid() as required by the simplified schema.