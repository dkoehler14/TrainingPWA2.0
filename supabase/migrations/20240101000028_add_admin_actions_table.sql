-- Create admin_actions table for logging administrative actions
CREATE TABLE admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX idx_admin_actions_admin_id ON admin_actions(admin_id);
CREATE INDEX idx_admin_actions_target_user_id ON admin_actions(target_user_id);
CREATE INDEX idx_admin_actions_action_type ON admin_actions(action_type);
CREATE INDEX idx_admin_actions_created_at ON admin_actions(created_at);

-- Add RLS policies
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- Only admins can view admin actions
CREATE POLICY "Admins can view admin actions" ON admin_actions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Only admins can insert admin actions
CREATE POLICY "Admins can insert admin actions" ON admin_actions
    FOR INSERT WITH CHECK (
        admin_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Add suspension fields to coach_profiles table
ALTER TABLE coach_profiles ADD COLUMN suspension_reason TEXT;
ALTER TABLE coach_profiles ADD COLUMN suspended_at TIMESTAMP WITH TIME ZONE;

-- Update the demote_coach function to handle relationship termination
CREATE OR REPLACE FUNCTION demote_coach(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Remove coach role
    PERFORM remove_user_role(target_user_id, 'coach');
    
    -- Deactivate coach profile
    UPDATE coach_profiles 
    SET is_active = false, updated_at = NOW()
    WHERE user_id = target_user_id;
    
    -- Terminate all active coach-client relationships
    UPDATE coach_client_relationships 
    SET status = 'terminated', terminated_at = NOW(), updated_at = NOW()
    WHERE coach_id = target_user_id AND status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT, INSERT ON admin_actions TO authenticated;