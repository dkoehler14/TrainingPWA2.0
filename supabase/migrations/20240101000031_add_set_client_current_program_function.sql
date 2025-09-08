-- Add RPC function to allow clients to set coach-assigned programs as current
-- This function bypasses RLS restrictions for the specific use case of setting current programs

CREATE OR REPLACE FUNCTION set_client_current_program(p_program_id UUID, p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    program_record RECORD;
    result JSON;
BEGIN
    -- Verify the program exists and is assigned to the user
    SELECT * INTO program_record
    FROM programs
    WHERE id = p_program_id
    AND assigned_to_client = p_user_id
    AND coach_assigned = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Program not found or not assigned to user';
    END IF;

    -- Unset any existing current programs for this user (both coach-assigned and regular programs)
    UPDATE programs
    SET is_current = false,
        updated_at = NOW()
    WHERE (assigned_to_client = p_user_id AND coach_assigned = true)
       OR (user_id = p_user_id AND coach_assigned = false)
    AND is_current = true;

    -- Set the new program as current
    UPDATE programs
    SET is_current = true,
        updated_at = NOW()
    WHERE id = p_program_id;

    -- Return success result
    result := json_build_object(
        'success', true,
        'program_id', p_program_id,
        'user_id', p_user_id,
        'message', 'Program set as current successfully'
    );

    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION set_client_current_program(UUID, UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION set_client_current_program(UUID, UUID) IS
'Allows clients to set coach-assigned programs as their current program, bypassing RLS restrictions for this specific operation.';