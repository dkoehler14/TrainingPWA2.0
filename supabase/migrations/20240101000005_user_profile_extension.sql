-- Create user profile extension table for additional profile data

-- Create user_profiles table to extend user data
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(100),
    bio TEXT,
    avatar_url TEXT,
    social_links JSONB DEFAULT '{}',
    fitness_level VARCHAR(50) DEFAULT 'beginner',
    fitness_goals TEXT[],
    public_profile BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS on user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create indexes for user_profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_public ON user_profiles(public_profile) WHERE public_profile = true;
CREATE INDEX IF NOT EXISTS idx_user_profiles_fitness_level ON user_profiles(fitness_level);

-- Create RLS policies for user_profiles

-- Users can view their own profile
CREATE POLICY "Users can view their own profile" ON user_profiles
    FOR SELECT USING (user_id = auth.uid());

-- Users can view public profiles
CREATE POLICY "Anyone can view public profiles" ON user_profiles
    FOR SELECT USING (
        public_profile = true AND
        auth.uid() IS NOT NULL
    );

-- Users can update their own profile
CREATE POLICY "Users can update their own profile" ON user_profiles
    FOR UPDATE USING (user_id = auth.uid());

-- Users can create their own profile
CREATE POLICY "Users can create their own profile" ON user_profiles
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Create function to automatically create user profile on user creation
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create user profile
CREATE TRIGGER on_user_created
    AFTER INSERT ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.create_user_profile();

-- Create view for public user profiles (for social features)
CREATE OR REPLACE VIEW public_user_profiles AS
SELECT 
    u.id,
    u.name,
    p.display_name,
    p.bio,
    p.avatar_url,
    p.fitness_level,
    p.fitness_goals
FROM 
    users u
JOIN 
    user_profiles p ON u.id = p.user_id
WHERE 
    u.account_status = 'active' AND
    p.public_profile = true;