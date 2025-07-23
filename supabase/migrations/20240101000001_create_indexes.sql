-- Create indexes for performance optimization

-- User lookups
CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);

-- Exercise lookups
CREATE INDEX idx_exercises_muscle_group ON exercises(primary_muscle_group);
CREATE INDEX idx_exercises_type ON exercises(exercise_type);
CREATE INDEX idx_exercises_global ON exercises(is_global);
CREATE INDEX idx_exercises_name ON exercises(name);

-- Program lookups
CREATE INDEX idx_programs_user_id ON programs(user_id);
CREATE INDEX idx_programs_current ON programs(user_id, is_current) WHERE is_current = true;
CREATE INDEX idx_programs_active ON programs(user_id, is_active) WHERE is_active = true;

-- Program workout lookups
CREATE INDEX idx_program_workouts_program_id ON program_workouts(program_id);
CREATE INDEX idx_program_workouts_week_day ON program_workouts(program_id, week_number, day_number);

-- Program exercise lookups
CREATE INDEX idx_program_exercises_workout_id ON program_exercises(workout_id);
CREATE INDEX idx_program_exercises_exercise_id ON program_exercises(exercise_id);
CREATE INDEX idx_program_exercises_order ON program_exercises(workout_id, order_index);

-- Workout log lookups
CREATE INDEX idx_workout_logs_user_date ON workout_logs(user_id, date DESC);
CREATE INDEX idx_workout_logs_user_finished ON workout_logs(user_id, is_finished);
CREATE INDEX idx_workout_logs_drafts ON workout_logs(user_id, is_draft) WHERE is_draft = true;
CREATE INDEX idx_workout_logs_program ON workout_logs(program_id) WHERE program_id IS NOT NULL;

-- Workout log exercise lookups
CREATE INDEX idx_workout_log_exercises_log_id ON workout_log_exercises(workout_log_id);
CREATE INDEX idx_workout_log_exercises_exercise_id ON workout_log_exercises(exercise_id);
CREATE INDEX idx_workout_log_exercises_order ON workout_log_exercises(workout_log_id, order_index);

-- Analytics lookups
CREATE INDEX idx_user_analytics_user_exercise ON user_analytics(user_id, exercise_id);
CREATE INDEX idx_user_analytics_last_workout ON user_analytics(user_id, last_workout_date DESC);
CREATE INDEX idx_user_analytics_max_weight ON user_analytics(user_id, max_weight DESC);
CREATE INDEX idx_user_analytics_total_volume ON user_analytics(user_id, total_volume DESC);