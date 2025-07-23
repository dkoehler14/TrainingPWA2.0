-- Enhance user authentication tables with additional features

-- Add last_login field to track user login activity
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- Add account_status for managing user account states
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(50) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deactivated'));

-- Add verification status for email verification tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Add multi-factor authentication status
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false;

-- Add user metadata for additional profile information
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create additional indexes for user authentication and filtering
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);

-- Create a view for active users (useful for analytics and reporting)
CREATE OR REPLACE VIEW active_users AS
SELECT * FROM users
WHERE account_status = 'active'
AND last_login > (NOW() - INTERVAL '30 days');

-- Enhance the handle_new_user function to set email_verified based on auth status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (
        auth_id, 
        email, 
        name,
        email_verified,
        metadata
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        NEW.email_confirmed_at IS NOT NULL,
        NEW.raw_user_meta_data
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the handle_user_update function to maintain email verification status
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.users
    SET 
        email = NEW.email,
        email_verified = NEW.email_confirmed_at IS NOT NULL,
        updated_at = NOW(),
        last_login = CASE 
            WHEN NEW.last_sign_in_at IS NOT NULL AND 
                 (OLD.last_sign_in_at IS NULL OR NEW.last_sign_in_at > OLD.last_sign_in_at)
            THEN NEW.last_sign_in_at
            ELSE users.last_login
        END
    WHERE auth_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add function to update last_login timestamp
CREATE OR REPLACE FUNCTION public.update_last_login()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.users
    SET last_login = NOW()
    WHERE auth_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update last_login when a new session is created
CREATE TRIGGER on_auth_session_created
    AFTER INSERT ON auth.sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_last_login();

-- Add additional RLS policies for user management

-- Allow users to view only active users (for social features)
CREATE POLICY "Users can view active users" ON users
    FOR SELECT USING (
        account_status = 'active' AND
        auth.uid() IS NOT NULL
    );

-- Allow admins to manage all users (placeholder - requires admin role implementation)
-- This would typically be expanded with proper admin role checking
CREATE POLICY "Admins can manage all users" ON users
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin'
        )
    );