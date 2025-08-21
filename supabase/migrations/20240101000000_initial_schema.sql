-- Initial schema for exercise tracker migration from Firestore
-- This migration creates the basic table structure

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY, -- This will be auth.uid()
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    roles TEXT[] DEFAULT ARRAY['user'],
    experience_level VARCHAR(50) DEFAULT 'beginner',
    preferred_units VARCHAR(10) DEFAULT 'LB',
    age INTEGER,
    weight_lbs DECIMAL(5,2),
    height_feet INTEGER,
    height_inches INTEGER,
    goals TEXT[],
    available_equipment TEXT[],
    injuries TEXT[],
    preferences JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exercises table
CREATE TABLE exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    primary_muscle_group VARCHAR(100) NOT NULL,
    exercise_type VARCHAR(100) NOT NULL,
    instructions TEXT,
    is_global BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id), -- References auth.uid() directly
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Programs table
CREATE TABLE programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    duration INTEGER NOT NULL, -- weeks
    days_per_week INTEGER NOT NULL,
    weight_unit VARCHAR(10) DEFAULT 'LB',
    difficulty VARCHAR(50),
    goals TEXT[],
    equipment TEXT[],
    is_template BOOLEAN DEFAULT false,
    is_current BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    start_date DATE,
    completed_weeks INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Program workouts table
CREATE TABLE program_workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL,
    day_number INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(program_id, week_number, day_number)
);

-- Program exercises table
CREATE TABLE program_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id UUID NOT NULL REFERENCES program_workouts(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id),
    sets INTEGER NOT NULL,
    reps VARCHAR(50), -- NULL for time-based exercises
    rest_minutes INTEGER,
    notes TEXT,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workout logs table
CREATE TABLE workout_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id UUID REFERENCES programs(id),
    week_index INTEGER,
    day_index INTEGER,
    name VARCHAR(255),
    type VARCHAR(50) DEFAULT 'program_workout',
    date DATE NOT NULL,
    completed_date TIMESTAMP WITH TIME ZONE,
    is_finished BOOLEAN DEFAULT false,
    is_draft BOOLEAN DEFAULT false,
    weight_unit VARCHAR(10) DEFAULT 'LB',
    duration INTEGER, -- minutes
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workout log exercises table
CREATE TABLE workout_log_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_log_id UUID NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id),
    sets INTEGER NOT NULL,
    reps INTEGER[],
    weights DECIMAL(6,2)[],
    completed BOOLEAN[],
    bodyweight DECIMAL(5,2),
    notes TEXT,
    is_added BOOLEAN DEFAULT false,
    added_type VARCHAR(50),
    original_index INTEGER DEFAULT -1,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User analytics table
CREATE TABLE user_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id),
    total_volume DECIMAL(10,2) DEFAULT 0,
    max_weight DECIMAL(6,2) DEFAULT 0,
    total_reps INTEGER DEFAULT 0,
    total_sets INTEGER DEFAULT 0,
    last_workout_date DATE,
    pr_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, exercise_id)
);