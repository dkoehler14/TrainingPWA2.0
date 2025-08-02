-- Enable Row Level Security (RLS) for all tables

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_log_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Exercises table policies (global exercises viewable by all, user exercises only by owner)
CREATE POLICY "Anyone can view global exercises" ON exercises
    FOR SELECT USING (is_global = true);

CREATE POLICY "Users can view their own exercises" ON exercises
    FOR SELECT USING (created_by IS NULL OR created_by = auth.uid());

CREATE POLICY "Users can create their own exercises" ON exercises
    FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own exercises" ON exercises
    FOR UPDATE USING (created_by = auth.uid());

-- Programs table policies
CREATE POLICY "Users can view their own programs" ON programs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own programs" ON programs
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own programs" ON programs
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own programs" ON programs
    FOR DELETE USING (user_id = auth.uid());

-- Program workouts table policies
CREATE POLICY "Users can view their own program workouts" ON program_workouts
    FOR SELECT USING (program_id IN (
        SELECT id FROM programs WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can create their own program workouts" ON program_workouts
    FOR INSERT WITH CHECK (program_id IN (
        SELECT id FROM programs WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update their own program workouts" ON program_workouts
    FOR UPDATE USING (program_id IN (
        SELECT id FROM programs WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can delete their own program workouts" ON program_workouts
    FOR DELETE USING (program_id IN (
        SELECT id FROM programs WHERE user_id = auth.uid()
    ));

-- Program exercises table policies
CREATE POLICY "Users can view their own program exercises" ON program_exercises
    FOR SELECT USING (workout_id IN (
        SELECT id FROM program_workouts WHERE program_id IN (
            SELECT id FROM programs WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Users can create their own program exercises" ON program_exercises
    FOR INSERT WITH CHECK (workout_id IN (
        SELECT id FROM program_workouts WHERE program_id IN (
            SELECT id FROM programs WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Users can update their own program exercises" ON program_exercises
    FOR UPDATE USING (workout_id IN (
        SELECT id FROM program_workouts WHERE program_id IN (
            SELECT id FROM programs WHERE user_id = auth.uid()
        )
    ));

CREATE POLICY "Users can delete their own program exercises" ON program_exercises
    FOR DELETE USING (workout_id IN (
        SELECT id FROM program_workouts WHERE program_id IN (
            SELECT id FROM programs WHERE user_id = auth.uid()
        )
    ));

-- Workout logs table policies
CREATE POLICY "Users can view their own workout logs" ON workout_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own workout logs" ON workout_logs
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own workout logs" ON workout_logs
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own workout logs" ON workout_logs
    FOR DELETE USING (user_id = auth.uid());

-- Workout log exercises table policies
CREATE POLICY "Users can view their own workout log exercises" ON workout_log_exercises
    FOR SELECT USING (workout_log_id IN (
        SELECT id FROM workout_logs WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can create their own workout log exercises" ON workout_log_exercises
    FOR INSERT WITH CHECK (workout_log_id IN (
        SELECT id FROM workout_logs WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update their own workout log exercises" ON workout_log_exercises
    FOR UPDATE USING (workout_log_id IN (
        SELECT id FROM workout_logs WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can delete their own workout log exercises" ON workout_log_exercises
    FOR DELETE USING (workout_log_id IN (
        SELECT id FROM workout_logs WHERE user_id = auth.uid()
    ));

-- User analytics table policies
CREATE POLICY "Users can view their own analytics" ON user_analytics
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own analytics" ON user_analytics
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own analytics" ON user_analytics
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own analytics" ON user_analytics
    FOR DELETE USING (user_id = auth.uid());