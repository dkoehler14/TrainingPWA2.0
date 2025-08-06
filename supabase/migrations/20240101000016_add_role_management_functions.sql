-- Add helper functions for role management

-- Function to add a role to a user
CREATE OR REPLACE FUNCTION add_user_role(user_id UUID, new_role TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE users 
    SET role = array_append(role, new_role)
    WHERE id = user_id 
    AND NOT (new_role = ANY(role));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove a role from a user
CREATE OR REPLACE FUNCTION remove_user_role(user_id UUID, old_role TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE users 
    SET role = array_remove(role, old_role)
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION user_has_role(user_id UUID, check_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users 
        WHERE id = user_id 
        AND check_role = ANY(role)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;