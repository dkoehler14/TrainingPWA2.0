import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvitationEmailData {
  invitation: {
    id: string;
    coach_id: string;
    coach_email: string;
    coach_name: string;
    target_email: string;
    invitation_code: string;
    message?: string;
    expires_at: string;
    created_at: string;
  };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body
    const { invitation }: InvitationEmailData = await req.json();

    if (!invitation || !invitation.target_email) {
      return new Response(
        JSON.stringify({ error: 'Invalid invitation data' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Generate invitation URL
    const baseUrl = Deno.env.get('SITE_URL') || 'http://localhost:3000';
    const invitationUrl = `${baseUrl}/invitation/${invitation.invitation_code}`;

    // Prepare email content
    const emailSubject = `🏋️ Coaching Invitation from ${invitation.coach_name}`;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Coaching Invitation</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 30px; 
              text-align: center; 
              border-radius: 10px 10px 0 0; 
            }
            .content { 
              background: #f8f9fa; 
              padding: 30px; 
              border-radius: 0 0 10px 10px; 
            }
            .message-box { 
              background: white; 
              padding: 20px; 
              border-radius: 8px; 
              margin: 20px 0; 
              border-left: 4px solid #667eea; 
            }
            .cta-button { 
              display: inline-block; 
              background: #28a745; 
              color: white; 
              padding: 15px 30px; 
              text-decoration: none; 
              border-radius: 8px; 
              font-weight: bold; 
              margin: 20px 0; 
            }
            .footer { 
              text-align: center; 
              color: #666; 
              font-size: 14px; 
              margin-top: 30px; 
            }
            .expiry-notice { 
              background: #fff3cd; 
              border: 1px solid #ffeaa7; 
              padding: 15px; 
              border-radius: 8px; 
              margin: 20px 0; 
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🏋️ FitTrack Pro</h1>
            <h2>You've been invited to join as a client!</h2>
          </div>
          
          <div class="content">
            <p><strong>${invitation.coach_name}</strong> has invited you to be their client on FitTrack Pro.</p>
            
            <p>As their client, you'll get:</p>
            <ul>
              <li>📋 Personalized workout programs designed just for you</li>
              <li>📊 Progress tracking and analytics</li>
              <li>💡 Expert coaching insights and recommendations</li>
              <li>🎯 Goal-oriented training plans</li>
            </ul>

            ${invitation.message ? `
              <div class="message-box">
                <h3>Personal Message from ${invitation.coach_name}:</h3>
                <p style="font-style: italic;">${invitation.message.replace(/\n/g, '<br>')}</p>
              </div>
            ` : ''}

            <div style="text-align: center;">
              <a href="${invitationUrl}" class="cta-button">
                Accept Invitation
              </a>
            </div>

            <div class="expiry-notice">
              <strong>⏰ Important:</strong> This invitation expires on ${new Date(invitation.expires_at).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}. Please respond before then to start your coaching journey!
            </div>

            <p>If you don't have a FitTrack Pro account yet, you'll be able to create one when you accept the invitation.</p>
          </div>

          <div class="footer">
            <p>This invitation was sent by ${invitation.coach_name} (${invitation.coach_email})</p>
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            <p>© ${new Date().getFullYear()} FitTrack Pro - Your Fitness Journey Starts Here</p>
          </div>
        </body>
      </html>
    `;

    const emailText = `
FitTrack Pro - Coaching Invitation

${invitation.coach_name} has invited you to be their client on FitTrack Pro.

${invitation.message ? `Personal Message:\n${invitation.message}\n\n` : ''}

As their client, you'll get:
- Personalized workout programs designed just for you
- Progress tracking and analytics  
- Expert coaching insights and recommendations
- Goal-oriented training plans

Accept your invitation: ${invitationUrl}

This invitation expires on ${new Date(invitation.expires_at).toLocaleDateString()}.

If you don't have a FitTrack Pro account yet, you'll be able to create one when you accept the invitation.

This invitation was sent by ${invitation.coach_name} (${invitation.coach_email})
If you didn't expect this invitation, you can safely ignore this email.
    `;

    // Send email using Supabase Auth (which uses SMTP)
    const { error: emailError } = await supabaseClient.auth.admin.inviteUserByEmail(
      invitation.target_email,
      {
        data: {
          invitation_type: 'coaching',
          invitation_id: invitation.id,
          coach_name: invitation.coach_name,
          invitation_code: invitation.invitation_code,
        },
        redirectTo: invitationUrl,
      }
    );

    // If the built-in email fails, we could implement a custom SMTP solution here
    // For now, we'll log the email content for development
    if (emailError) {
      console.error('Supabase email error:', emailError);
      
      // In development, log the email content
      if (Deno.env.get('ENVIRONMENT') === 'development') {
        console.log('Email would be sent to:', invitation.target_email);
        console.log('Subject:', emailSubject);
        console.log('HTML Content:', emailHtml);
      }
      
      // Don't fail the function - the invitation is still created
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Invitation created, but email delivery may have failed',
          invitation_url: invitationUrl 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Update invitation with email sent status
    await supabaseClient
      .from('client_invitations')
      .update({ 
        email_sent: true,
        email_sent_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Invitation email sent successfully',
        invitation_url: invitationUrl 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error sending invitation email:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to send invitation email',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});