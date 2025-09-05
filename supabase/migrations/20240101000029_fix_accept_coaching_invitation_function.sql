-- Fix accept_coaching_invitation function to work with email-only invitations
-- This addresses the missing invitation_method field issue

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