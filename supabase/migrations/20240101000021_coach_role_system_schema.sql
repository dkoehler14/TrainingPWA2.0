-- Coach Role System Database Schema
-- This migration creates the database foundation for the coach role system

-- Coach Profiles Table
CREATE TABLE coach_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    specializations TEXT[],
    certifications TEXT[],
    bio TEXT,
    phone VARCHAR(20),
    website VARCHAR(255),
    client_limit INTEGER, -- NULL for unlimited
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Coach-Client Relationships Table
CREATE TABLE coach_client_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'terminated')),
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    terminated_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    invitation_method VARCHAR(20) CHECK (invitation_method IN ('email', 'username')),
    invitation_message TEXT,
    coach_notes TEXT,
    client_goals TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(coach_id, client_id)
);

-- Client Invitations Table
CREATE TABLE client_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coach_email VARCHAR(255) NOT NULL,
    coach_name VARCHAR(255) NOT NULL,
    
    -- Invitation target (one of these will be set)
    target_email VARCHAR(255),
    target_user_id UUID REFERENCES users(id),
    
    invitation_code VARCHAR(50) UNIQUE NOT NULL,
    message TEXT,
    
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'canceled')),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    responded_at TIMESTAMP WITH TIME ZONE,
    
    -- Response tracking
    viewed_at TIMESTAMP WITH TIME ZONE,
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Coaching Insights Table
CREATE TABLE coaching_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relationship_id UUID NOT NULL REFERENCES coach_client_relationships(id) ON DELETE CASCADE,
    
    type VARCHAR(30) CHECK (type IN ('recommendation', 'observation', 'goal_update', 'program_adjustment')),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    
    -- AI integration fields
    ai_generated BOOLEAN DEFAULT false,
    ai_confidence DECIMAL(3,2), -- 0.00 to 1.00
    based_on_data JSONB, -- Store workout count, date range, exercises analyzed
    
    -- Client interaction
    client_viewed BOOLEAN DEFAULT false,
    client_viewed_at TIMESTAMP WITH TIME ZONE,
    client_response TEXT,
    
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    tags TEXT[],
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add coach-specific columns to existing programs table
ALTER TABLE programs ADD COLUMN coach_assigned BOOLEAN DEFAULT false;
ALTER TABLE programs ADD COLUMN assigned_to_client UUID REFERENCES users(id);
ALTER TABLE programs ADD COLUMN assigned_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE programs ADD COLUMN coach_notes TEXT;
ALTER TABLE programs ADD COLUMN client_goals TEXT[];
ALTER TABLE programs ADD COLUMN expected_duration_weeks INTEGER;
ALTER TABLE programs ADD COLUMN program_difficulty VARCHAR(20) CHECK (program_difficulty IN ('beginner', 'intermediate', 'advanced'));
ALTER TABLE programs ADD COLUMN visibility VARCHAR(20) DEFAULT 'private' CHECK (visibility IN ('private', 'coach_only', 'template', 'public'));

-- Create indexes for performance
CREATE INDEX idx_coach_profiles_user_id ON coach_profiles(user_id);
CREATE INDEX idx_coach_profiles_active ON coach_profiles(is_active);

CREATE INDEX idx_coach_client_relationships_coach_id ON coach_client_relationships(coach_id);
CREATE INDEX idx_coach_client_relationships_client_id ON coach_client_relationships(client_id);
CREATE INDEX idx_coach_client_relationships_status ON coach_client_relationships(status);
CREATE INDEX idx_coach_client_relationships_coach_client ON coach_client_relationships(coach_id, client_id);

CREATE INDEX idx_client_invitations_coach_id ON client_invitations(coach_id);
CREATE INDEX idx_client_invitations_target_email ON client_invitations(target_email);
CREATE INDEX idx_client_invitations_target_user_id ON client_invitations(target_user_id);
CREATE INDEX idx_client_invitations_code ON client_invitations(invitation_code);
CREATE INDEX idx_client_invitations_status ON client_invitations(status);
CREATE INDEX idx_client_invitations_expires_at ON client_invitations(expires_at);

CREATE INDEX idx_coaching_insights_coach_id ON coaching_insights(coach_id);
CREATE INDEX idx_coaching_insights_client_id ON coaching_insights(client_id);
CREATE INDEX idx_coaching_insights_relationship_id ON coaching_insights(relationship_id);
CREATE INDEX idx_coaching_insights_type ON coaching_insights(type);
CREATE INDEX idx_coaching_insights_client_viewed ON coaching_insights(client_viewed);

CREATE INDEX idx_programs_coach_assigned ON programs(coach_assigned);
CREATE INDEX idx_programs_assigned_to_client ON programs(assigned_to_client);
CREATE INDEX idx_programs_visibility ON programs(visibility);

-- Add updated_at triggers for new tables
CREATE TRIGGER update_coach_profiles_updated_at
    BEFORE UPDATE ON coach_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coach_client_relationships_updated_at
    BEFORE UPDATE ON coach_client_relationships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_invitations_updated_at
    BEFORE UPDATE ON client_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coaching_insights_updated_at
    BEFORE UPDATE ON coaching_insights
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();