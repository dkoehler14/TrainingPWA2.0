-- Row Level Security Policies for Coach Role System
-- This migration creates RLS policies for all coach-related tables

-- Enable RLS on all coach tables
ALTER TABLE coach_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_client_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_insights ENABLE ROW LEVEL SECURITY;

-- Coach Profiles Policies
-- Coach profiles can be viewed by the coach themselves, their clients, and admins
CREATE POLICY "Coach profiles viewable by coach, clients, and admins" ON coach_profiles
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM coach_client_relationships ccr
            WHERE ccr.coach_id = user_id 
            AND ccr.client_id = auth.uid() 
            AND ccr.status = 'active'
        ) OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Only coaches can update their own profiles
CREATE POLICY "Coaches can update own profile" ON coach_profiles
    FOR UPDATE USING (user_id = auth.uid());

-- Only users with coach role can create profiles
CREATE POLICY "Coach role required for profile creation" ON coach_profiles
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'coach' = ANY(u.roles)
        )
    );

-- Admins can delete coach profiles
CREATE POLICY "Admins can delete coach profiles" ON coach_profiles
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Coach-Client Relationships Policies
-- Relationships viewable by coach, client, or admin
CREATE POLICY "Relationships viewable by participants and admins" ON coach_client_relationships
    FOR SELECT USING (
        coach_id = auth.uid() OR 
        client_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Only coaches can create relationships (through invitation acceptance)
CREATE POLICY "System can create relationships" ON coach_client_relationships
    FOR INSERT WITH CHECK (true); -- Controlled by functions

-- Coaches and clients can update relationships (different fields)
CREATE POLICY "Participants can update relationships" ON coach_client_relationships
    FOR UPDATE USING (
        coach_id = auth.uid() OR 
        client_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Admins can delete relationships
CREATE POLICY "Admins can delete relationships" ON coach_client_relationships
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Client Invitations Policies
-- Invitations viewable by coach who sent them, target user, or admins
CREATE POLICY "Invitations viewable by coach and target" ON client_invitations
    FOR SELECT USING (
        coach_id = auth.uid() OR
        target_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        ) OR
        -- Allow viewing by email for invitation acceptance flow
        (target_email IS NOT NULL AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND u.email = target_email
        ))
    );

-- Only coaches can create invitations
CREATE POLICY "Coaches can create invitations" ON client_invitations
    FOR INSERT WITH CHECK (
        coach_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'coach' = ANY(u.roles)
        )
    );

-- Coaches and target users can update invitations (for status changes)
CREATE POLICY "Coaches and targets can update invitations" ON client_invitations
    FOR UPDATE USING (
        coach_id = auth.uid() OR
        target_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND u.email = target_email
        ) OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Coaches and admins can delete invitations
CREATE POLICY "Coaches and admins can delete invitations" ON client_invitations
    FOR DELETE USING (
        coach_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Coaching Insights Policies
-- Insights viewable by coach and client in the relationship
CREATE POLICY "Insights viewable by coach and client" ON coaching_insights
    FOR SELECT USING (
        coach_id = auth.uid() OR 
        client_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Only coaches can create insights for their clients
CREATE POLICY "Coaches can create insights for clients" ON coaching_insights
    FOR INSERT WITH CHECK (
        coach_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM coach_client_relationships ccr
            WHERE ccr.coach_id = auth.uid() 
            AND ccr.client_id = coaching_insights.client_id 
            AND ccr.status = 'active'
            AND ccr.id = coaching_insights.relationship_id
        )
    );

-- Coaches and clients can update insights (coaches for content, clients for responses)
CREATE POLICY "Coaches and clients can update insights" ON coaching_insights
    FOR UPDATE USING (
        coach_id = auth.uid() OR 
        client_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Coaches and admins can delete insights
CREATE POLICY "Coaches and admins can delete insights" ON coaching_insights
    FOR DELETE USING (
        coach_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Enhanced Programs Policies for Coach Assignments
-- Drop existing programs policies to recreate with coach support
DROP POLICY IF EXISTS "Users can view their own programs" ON programs;
DROP POLICY IF EXISTS "Users can create their own programs" ON programs;
DROP POLICY IF EXISTS "Users can update their own programs" ON programs;
DROP POLICY IF EXISTS "Users can delete their own programs" ON programs;
DROP POLICY IF EXISTS "Users can view template programs" ON programs;

-- Users and coaches can view programs (enhanced)
CREATE POLICY "Users and coaches can view programs" ON programs
    FOR SELECT USING (
        user_id = auth.uid() OR
        assigned_to_client = auth.uid() OR
        (is_template = true AND visibility IN ('template', 'public')) OR
        EXISTS (
            SELECT 1 FROM coach_client_relationships ccr
            WHERE ccr.coach_id = auth.uid() 
            AND ccr.client_id = user_id 
            AND ccr.status = 'active'
        ) OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Users and coaches can create programs
CREATE POLICY "Users and coaches can create programs" ON programs
    FOR INSERT WITH CHECK (
        user_id = auth.uid() OR
        (coach_assigned = true AND EXISTS (
            SELECT 1 FROM coach_client_relationships ccr
            WHERE ccr.coach_id = auth.uid() 
            AND ccr.client_id = assigned_to_client 
            AND ccr.status = 'active'
        )) OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Users and coaches can update programs they have access to
CREATE POLICY "Users and coaches can update programs" ON programs
    FOR UPDATE USING (
        user_id = auth.uid() OR
        (coach_assigned = true AND EXISTS (
            SELECT 1 FROM coach_client_relationships ccr
            WHERE ccr.coach_id = auth.uid() 
            AND ccr.client_id = assigned_to_client 
            AND ccr.status = 'active'
        )) OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Users and coaches can delete programs they have access to
CREATE POLICY "Users and coaches can delete programs" ON programs
    FOR DELETE USING (
        user_id = auth.uid() OR
        (coach_assigned = true AND EXISTS (
            SELECT 1 FROM coach_client_relationships ccr
            WHERE ccr.coach_id = auth.uid() 
            AND ccr.client_id = assigned_to_client 
            AND ccr.status = 'active'
        )) OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Enhanced Workout Logs Policies for Coach Access
-- Drop existing workout logs policies to recreate with coach support
DROP POLICY IF EXISTS "Users can view their own workout logs" ON workout_logs;
DROP POLICY IF EXISTS "Users can create their own workout logs" ON workout_logs;
DROP POLICY IF EXISTS "Users can update their own workout logs" ON workout_logs;
DROP POLICY IF EXISTS "Users can delete their own workout logs" ON workout_logs;

-- Users and coaches can view workout logs (enhanced)
CREATE POLICY "Users and coaches can view workout logs" ON workout_logs
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM coach_client_relationships ccr
            WHERE ccr.coach_id = auth.uid() 
            AND ccr.client_id = user_id 
            AND ccr.status = 'active'
        ) OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Users can create their own workout logs
CREATE POLICY "Users can create their own workout logs" ON workout_logs
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own workout logs
CREATE POLICY "Users can update their own workout logs" ON workout_logs
    FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own workout logs
CREATE POLICY "Users can delete their own workout logs" ON workout_logs
    FOR DELETE USING (user_id = auth.uid());

-- Enhanced User Analytics Policies for Coach Access
-- Drop existing user analytics policies to recreate with coach support
DROP POLICY IF EXISTS "Users can view their own analytics" ON user_analytics;
DROP POLICY IF EXISTS "Users can update their own analytics" ON user_analytics;

-- Users and coaches can view user analytics (enhanced)
CREATE POLICY "Users and coaches can view user analytics" ON user_analytics
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM coach_client_relationships ccr
            WHERE ccr.coach_id = auth.uid() 
            AND ccr.client_id = user_id 
            AND ccr.status = 'active'
        ) OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- System can update user analytics (controlled by triggers)
CREATE POLICY "System can update user analytics" ON user_analytics
    FOR ALL USING (true);