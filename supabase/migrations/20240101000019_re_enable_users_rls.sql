-- Re-enable RLS on users table and fix the underlying permission issues
-- This migration addresses the root cause that led to temporarily disabling RLS

-- First, ensure the users table policies are correctly defined
-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;

-- Re-enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create improved RLS policies for users table
-- These policies are more explicit and should avoid the permission issues

-- Allow users to view their own profile
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Allow users to insert their own profile (for user registration)
CREATE POLICY "Users can insert their own profile" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow service role to access all user records (for admin operations)
-- This is needed for server-side operations and admin functions
CREATE POLICY "Service role can access all users" ON users
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Create a security definer function to safely check user roles
-- This function runs with elevated privileges to avoid RLS permission issues
CREATE OR REPLACE FUNCTION public.check_user_role(user_id UUID, role_name TEXT)
RETURNS BOOLEAN AS $
DECLARE
    has_role BOOLEAN := false;
BEGIN
    -- This function runs as SECURITY DEFINER, so it can read from users table
    SELECT (role_name = ANY(roles)) INTO has_role
    FROM users
    WHERE id = user_id;
    
    RETURN COALESCE(has_role, false);
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the exercise policy to use the security definer function
-- This should resolve the "permission denied for table users" error
DROP POLICY IF EXISTS "Admin only global exercise updates" ON exercises;

CREATE POLICY "Admin only global exercise updates" ON exercises
    FOR UPDATE USING (
        -- Users can always update their own exercises
        created_by = auth.uid() OR 
        -- Only admin users can update global exercises (using security definer function)
        (
            is_global = true AND 
            public.check_user_role(auth.uid(), 'admin')
        )
    );

-- Add comments for documentation
COMMENT ON POLICY "Users can view their own profile" ON users IS 
'Allows users to view only their own profile data';

COMMENT ON POLICY "Users can update their own profile" ON users IS 
'Allows users to update only their own profile data';

COMMENT ON POLICY "Users can insert their own profile" ON users IS 
'Allows users to create their own profile during registration';

COMMENT ON POLICY "Service role can access all users" ON users IS 
'Allows service role (server-side operations) to access all user records for admin functions';

COMMENT ON FUNCTION public.check_user_role IS 
'Security definer function to safely check user roles without RLS permission issues';

COMMENT ON POLICY "Admin only global exercise updates" ON exercises IS 
'Allows users to update their own exercises and restricts global exercise updates to admin users only (using security definer function)';

-- Create a function to validate the RLS setup
CREATE OR REPLACE FUNCTION public.validate_rls_setup()
RETURNS TABLE(
    table_name TEXT,
    rls_enabled BOOLEAN,
    policy_count INTEGER
) AS $
BEGIN
    RETURN QUERY
    SELECT 
        t.tablename::TEXT,
        t.rowsecurity,
        COUNT(p.policyname)::INTEGER
    FROM pg_tables t
    LEFT JOIN pg_policies p ON p.tablename = t.tablename
    WHERE t.schemaname = 'public'
    AND t.tablename IN ('users', 'exercises', 'programs', 'workout_logs', 'user_analytics')
    GROUP BY t.tablename, t.rowsecurity
    ORDER BY t.tablename;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for the validation function
COMMENT ON FUNCTION public.validate_rls_setup IS 
'Validates that RLS is properly enabled on all tables with appropriate policies';