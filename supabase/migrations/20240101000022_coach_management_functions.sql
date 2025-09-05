-- Coach Management Database Functions
-- This migration creates the database functions for coach management operations

-- Function to promote user to coach
CREATE OR REPLACE FUNCTION promote_to_coach(
    target_user_id UUID,
    coach_specializations TEXT[] DEFAULT '{}',
    coach_bio TEXT DEFAULT ''
)
RETURNS VOID AS $$
BEGIN
    -- Add coach role
    PERFORM add_user_role(target_user_id, 'coach');
    
    -- Create coach profile
    INSERT INTO coach_profiles (user_id, specializations, bio)
    VALUES (target_user_id, coach_specializations, coach_bio)
    ON CONFLICT (user_id) DO UPDATE SET
        is_active = true,
        specializations = EXCLUDED.specializations,
        bio = EXCLUDED.bio,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to demote coach (deactivate coach profile and terminate relationships)
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

-- Function to create coach-client relationship from invitation acceptance
CREATE OR REPLACE FUNCTION accept_coaching_invitation(invitation_id UUID)
RETURNS UUID AS $$
DECLARE
    invitation_record client_invitations%ROWTYPE;
    relationship_id UUID;
BEGIN
    -- Get invitation details
    SELECT * INTO invitation_record 
    FROM client_invitations 
    WHERE id = invitation_id 
    AND status = 'pending' 
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invitation';
    END IF;
    
    -- Verify the current user is the target of the invitation
    IF invitation_record.target_user_id IS NOT NULL AND invitation_record.target_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Invitation not intended for current user';
    END IF;
    
    -- For email invitations, we'll need to match by email in the application layer
    
    -- Create relationship
    INSERT INTO coach_client_relationships (
        coach_id,
        client_id,
        status,
        accepted_at,
        invitation_method,
        invitation_message
    ) VALUES (
        invitation_record.coach_id,
        auth.uid(),
        'active',
        NOW(),
        'email',
        invitation_record.message
    ) RETURNING id INTO relationship_id;
    
    -- Update invitation status
    UPDATE client_invitations 
    SET status = 'accepted', responded_at = NOW()
    WHERE id = invitation_id;
    
    RETURN relationship_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decline coaching invitation
CREATE OR REPLACE FUNCTION decline_coaching_invitation(invitation_id UUID)
RETURNS VOID AS $$
DECLARE
    invitation_record client_invitations%ROWTYPE;
BEGIN
    -- Get invitation details
    SELECT * INTO invitation_record 
    FROM client_invitations 
    WHERE id = invitation_id 
    AND status = 'pending' 
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invitation';
    END IF;
    
    -- Verify the current user is the target of the invitation
    IF invitation_record.target_user_id IS NOT NULL AND invitation_record.target_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Invitation not intended for current user';
    END IF;
    
    -- Update invitation status
    UPDATE client_invitations 
    SET status = 'declined', responded_at = NOW()
    WHERE id = invitation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check coach permissions for client data
CREATE OR REPLACE FUNCTION coach_can_access_client_data(
    coach_user_id UUID,
    client_user_id UUID,
    data_type TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM coach_client_relationships ccr
        WHERE ccr.coach_id = coach_user_id 
        AND ccr.client_id = client_user_id 
        AND ccr.status = 'active'
        AND (
            (data_type = 'workouts') OR
            (data_type = 'progress') OR
            (data_type = 'analytics') OR
            (data_type = 'programs')
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to terminate coach-client relationship
CREATE OR REPLACE FUNCTION terminate_coaching_relationship(
    relationship_id UUID,
    termination_reason TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    relationship_record coach_client_relationships%ROWTYPE;
BEGIN
    -- Get relationship details
    SELECT * INTO relationship_record 
    FROM coach_client_relationships 
    WHERE id = relationship_id 
    AND status = 'active';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active relationship not found';
    END IF;
    
    -- Verify the current user is either the coach or client in this relationship
    IF relationship_record.coach_id != auth.uid() AND relationship_record.client_id != auth.uid() THEN
        RAISE EXCEPTION 'Permission denied: not a participant in this relationship';
    END IF;
    
    -- Terminate the relationship
    UPDATE coach_client_relationships 
    SET 
        status = 'terminated', 
        terminated_at = NOW(), 
        updated_at = NOW(),
        coach_notes = CASE 
            WHEN termination_reason IS NOT NULL THEN 
                COALESCE(coach_notes, '') || E'\n\nTermination reason: ' || termination_reason
            ELSE coach_notes
        END
    WHERE id = relationship_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get coach's active clients with summary data
CREATE OR REPLACE FUNCTION get_coach_clients_summary(coach_user_id UUID)
RETURNS TABLE (
    client_id UUID,
    client_name VARCHAR(255),
    client_email VARCHAR(255),
    relationship_id UUID,
    accepted_at TIMESTAMP WITH TIME ZONE,
    last_workout_date DATE,
    total_workouts BIGINT,
    assigned_programs BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id as client_id,
        u.name as client_name,
        u.email as client_email,
        ccr.id as relationship_id,
        ccr.accepted_at,
        (SELECT MAX(wl.date) FROM workout_logs wl WHERE wl.user_id = u.id) as last_workout_date,
        (SELECT COUNT(*) FROM workout_logs wl WHERE wl.user_id = u.id AND wl.is_finished = true) as total_workouts,
        (SELECT COUNT(*) FROM programs p WHERE p.assigned_to_client = u.id AND p.coach_assigned = true) as assigned_programs
    FROM coach_client_relationships ccr
    JOIN users u ON u.id = ccr.client_id
    WHERE ccr.coach_id = coach_user_id 
    AND ccr.status = 'active'
    ORDER BY ccr.accepted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to expire old invitations (to be called by a scheduled job)
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE client_invitations 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' 
    AND expires_at <= NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate coach profile completeness
CREATE OR REPLACE FUNCTION validate_coach_profile(coach_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    profile_record coach_profiles%ROWTYPE;
    validation_result JSONB := '{}';
    is_valid BOOLEAN := true;
    missing_fields TEXT[] := '{}';
BEGIN
    -- Get coach profile
    SELECT * INTO profile_record 
    FROM coach_profiles 
    WHERE user_id = coach_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_valid', false,
            'error', 'Coach profile not found'
        );
    END IF;
    
    -- Check required fields
    IF profile_record.bio IS NULL OR LENGTH(TRIM(profile_record.bio)) = 0 THEN
        missing_fields := array_append(missing_fields, 'bio');
        is_valid := false;
    END IF;
    
    IF profile_record.specializations IS NULL OR array_length(profile_record.specializations, 1) = 0 THEN
        missing_fields := array_append(missing_fields, 'specializations');
        is_valid := false;
    END IF;
    
    -- Build validation result
    validation_result := jsonb_build_object(
        'is_valid', is_valid,
        'missing_fields', missing_fields,
        'profile_completeness', CASE 
            WHEN is_valid THEN 100
            ELSE (100 - (array_length(missing_fields, 1) * 50))
        END
    );
    
    RETURN validation_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;