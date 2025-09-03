-- Add program assignment tracking table for modification history
-- This supports requirement 5.4: Add program modification tracking for assigned programs

-- Create program assignment history table
CREATE TABLE IF NOT EXISTS program_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Action tracking
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('assigned', 'modified', 'unassigned')),
    
    -- Assignment data (for assigned action)
    assignment_data JSONB,
    
    -- Modification data (for modified action)
    modification_data JSONB,
    
    -- Unassignment reason (for unassigned action)
    unassignment_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_program_assignment_history_program_id ON program_assignment_history(program_id);
CREATE INDEX idx_program_assignment_history_client_id ON program_assignment_history(client_id);
CREATE INDEX idx_program_assignment_history_coach_id ON program_assignment_history(coach_id);
CREATE INDEX idx_program_assignment_history_action_type ON program_assignment_history(action_type);
CREATE INDEX idx_program_assignment_history_created_at ON program_assignment_history(created_at DESC);

-- RLS policies for program assignment history
ALTER TABLE program_assignment_history ENABLE ROW LEVEL SECURITY;

-- Coaches can view history for their assigned programs
CREATE POLICY "Coaches can view assignment history for their programs" ON program_assignment_history
    FOR SELECT USING (
        coach_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Clients can view history for programs assigned to them
CREATE POLICY "Clients can view their program assignment history" ON program_assignment_history
    FOR SELECT USING (
        client_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'admin' = ANY(u.roles)
        )
    );

-- Only coaches can create assignment history records
CREATE POLICY "Coaches can create assignment history" ON program_assignment_history
    FOR INSERT WITH CHECK (
        coach_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() 
            AND 'coach' = ANY(u.roles)
        )
    );

-- Function to automatically track program modifications
CREATE OR REPLACE FUNCTION track_program_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- Only track modifications for coach-assigned programs
    IF NEW.coach_assigned = true AND NEW.assigned_to_client IS NOT NULL THEN
        -- Check if this is a modification (not initial assignment)
        IF OLD.coach_assigned = true AND OLD.assigned_to_client IS NOT NULL THEN
            -- Track the modification
            INSERT INTO program_assignment_history (
                program_id,
                client_id,
                coach_id,
                action_type,
                modification_data
            ) VALUES (
                NEW.id,
                NEW.assigned_to_client,
                NEW.user_id, -- Assuming the program owner is the coach
                'modified',
                jsonb_build_object(
                    'old_values', jsonb_build_object(
                        'name', OLD.name,
                        'coach_notes', OLD.coach_notes,
                        'client_goals', OLD.client_goals,
                        'expected_duration_weeks', OLD.expected_duration_weeks,
                        'program_difficulty', OLD.program_difficulty
                    ),
                    'new_values', jsonb_build_object(
                        'name', NEW.name,
                        'coach_notes', NEW.coach_notes,
                        'client_goals', NEW.client_goals,
                        'expected_duration_weeks', NEW.expected_duration_weeks,
                        'program_difficulty', NEW.program_difficulty
                    ),
                    'modified_at', NOW()
                )
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic program modification tracking
DROP TRIGGER IF EXISTS trigger_track_program_modification ON programs;
CREATE TRIGGER trigger_track_program_modification
    AFTER UPDATE ON programs
    FOR EACH ROW
    EXECUTE FUNCTION track_program_modification();

-- Function to get program assignment statistics
CREATE OR REPLACE FUNCTION get_program_assignment_stats(coach_user_id UUID)
RETURNS TABLE (
    total_assignments BIGINT,
    active_assignments BIGINT,
    recent_assignments BIGINT,
    total_modifications BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) FILTER (WHERE action_type = 'assigned') as total_assignments,
        COUNT(*) FILTER (WHERE action_type = 'assigned' AND 
            NOT EXISTS (
                SELECT 1 FROM program_assignment_history pah2 
                WHERE pah2.program_id = program_assignment_history.program_id 
                AND pah2.action_type = 'unassigned' 
                AND pah2.created_at > program_assignment_history.created_at
            )
        ) as active_assignments,
        COUNT(*) FILTER (WHERE action_type = 'assigned' AND created_at > NOW() - INTERVAL '30 days') as recent_assignments,
        COUNT(*) FILTER (WHERE action_type = 'modified') as total_modifications
    FROM program_assignment_history
    WHERE coach_id = coach_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT SELECT, INSERT ON program_assignment_history TO authenticated;
GRANT EXECUTE ON FUNCTION get_program_assignment_stats(UUID) TO authenticated;