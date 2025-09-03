-- Add email tracking fields to client_invitations table
ALTER TABLE client_invitations 
ADD COLUMN email_sent BOOLEAN DEFAULT false,
ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN email_error TEXT;

-- Add index for email tracking
CREATE INDEX idx_client_invitations_email_sent ON client_invitations(email_sent);

-- Add comment for documentation
COMMENT ON COLUMN client_invitations.email_sent IS 'Whether the invitation email was successfully sent';
COMMENT ON COLUMN client_invitations.email_sent_at IS 'Timestamp when the invitation email was sent';
COMMENT ON COLUMN client_invitations.email_error IS 'Error message if email sending failed';