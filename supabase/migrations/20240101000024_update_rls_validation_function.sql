-- Update RLS validation function to include coach tables
-- This migration updates the validate_rls_setup function to check coach-related tables

CREATE OR REPLACE FUNCTION public.validate_rls_setup()
RETURNS TABLE(
    table_name TEXT,
    rls_enabled BOOLEAN,
    policy_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.tablename::TEXT,
        t.rowsecurity,
        COUNT(p.policyname)::INTEGER
    FROM pg_tables t
    LEFT JOIN pg_policies p ON p.tablename = t.tablename
    WHERE t.schemaname = 'public'
    AND t.tablename IN (
        'users', 
        'exercises', 
        'programs', 
        'workout_logs', 
        'user_analytics',
        'coach_profiles',
        'coach_client_relationships',
        'client_invitations',
        'coaching_insights'
    )
    GROUP BY t.tablename, t.rowsecurity
    ORDER BY t.tablename;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for the updated validation function
COMMENT ON FUNCTION public.validate_rls_setup IS 
'Validates that RLS is properly enabled on all tables including coach system tables with appropriate policies';