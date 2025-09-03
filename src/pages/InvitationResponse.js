import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Container, 
  Card, 
  Button, 
  Alert, 
  Spinner, 
  Badge,
  Row,
  Col
} from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { acceptInvitation, declineInvitation } from '../services/coachService';
import { supabase } from '../config/supabase';

/**
 * InvitationResponse Page
 * 
 * Handles coach invitation acceptance/decline for both email and username invitations.
 * Displays invitation details and allows user to respond.
 */
function InvitationResponse() {
  const { invitationCode } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  
  // State
  const [invitation, setInvitation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load invitation details
  useEffect(() => {
    const loadInvitation = async () => {
      if (!invitationCode) {
        setError('Invalid invitation link');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError('');

        const { data, error: fetchError } = await supabase
          .from('client_invitations')
          .select('*')
          .eq('invitation_code', invitationCode)
          .single();

        if (fetchError || !data) {
          setError('Invitation not found or invalid');
          return;
        }

        // Check if invitation is still valid
        if (data.status !== 'pending') {
          if (data.status === 'accepted') {
            setError('This invitation has already been accepted');
          } else if (data.status === 'declined') {
            setError('This invitation has been declined');
          } else if (data.status === 'expired') {
            setError('This invitation has expired');
          }
          return;
        }

        // Check if invitation has expired
        if (new Date(data.expires_at) < new Date()) {
          setError('This invitation has expired');
          return;
        }

        setInvitation(data);

        // Mark invitation as viewed
        await supabase
          .from('client_invitations')
          .update({ 
            viewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', data.id);

      } catch (err) {
        console.error('Failed to load invitation:', err);
        setError('Failed to load invitation details');
      } finally {
        setIsLoading(false);
      }
    };

    loadInvitation();
  }, [invitationCode]);

  // Handle invitation acceptance
  const handleAccept = async () => {
    if (!user) {
      // Redirect to login with return URL
      navigate(`/auth?returnTo=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    if (!invitation) return;

    try {
      setIsProcessing(true);
      setError('');

      await acceptInvitation(invitation.id);
      
      setSuccess('Invitation accepted successfully! You are now connected with your coach.');
      
      // Redirect to coach dashboard after a delay
      setTimeout(() => {
        navigate('/my-coach');
      }, 2000);

    } catch (err) {
      console.error('Failed to accept invitation:', err);
      
      if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
        setError('You are already connected with this coach or have a pending invitation.');
      } else if (err.message?.includes('expired')) {
        setError('This invitation has expired. Please ask your coach to send a new one.');
      } else {
        setError(err.message || 'Failed to accept invitation. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle invitation decline
  const handleDecline = async () => {
    if (!invitation) return;

    try {
      setIsProcessing(true);
      setError('');

      await declineInvitation(invitation.id);
      
      setSuccess('Invitation declined. The coach has been notified.');
      
      // Redirect to home after a delay
      setTimeout(() => {
        navigate('/');
      }, 2000);

    } catch (err) {
      console.error('Failed to decline invitation:', err);
      setError(err.message || 'Failed to decline invitation. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Format expiration date
  const formatExpirationDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calculate time remaining
  const getTimeRemaining = (expiresAt) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffMs = expiry - now;
    
    if (diffMs <= 0) return 'Expired';
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} remaining`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} remaining`;
    } else {
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${diffMins} minute${diffMins > 1 ? 's' : ''} remaining`;
    }
  };

  if (authLoading || isLoading) {
    return (
      <Container className="py-5">
        <Row className="justify-content-center">
          <Col md={8} lg={6}>
            <Card className="text-center">
              <Card.Body className="py-5">
                <Spinner animation="border" />
                <div className="mt-3">Loading invitation...</div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  if (error && !invitation) {
    return (
      <Container className="py-5">
        <Row className="justify-content-center">
          <Col md={8} lg={6}>
            <Card>
              <Card.Body className="text-center py-5">
                <div className="mb-4" style={{ fontSize: '4rem' }}>❌</div>
                <h3 className="mb-3">Invalid Invitation</h3>
                <Alert variant="danger">{error}</Alert>
                <Button variant="primary" onClick={() => navigate('/')}>
                  Go to Home
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  if (success) {
    return (
      <Container className="py-5">
        <Row className="justify-content-center">
          <Col md={8} lg={6}>
            <Card>
              <Card.Body className="text-center py-5">
                <div className="mb-4" style={{ fontSize: '4rem' }}>✅</div>
                <h3 className="mb-3">Success!</h3>
                <Alert variant="success">{success}</Alert>
                <div className="text-muted">Redirecting...</div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <Card>
            <Card.Header className="text-center bg-primary text-white">
              <h3 className="mb-0">🏋️ Coaching Invitation</h3>
            </Card.Header>
            
            <Card.Body>
              {error && (
                <Alert variant="danger" className="mb-4">
                  {error}
                </Alert>
              )}

              <div className="text-center mb-4">
                <h4 className="mb-3">
                  <strong>{invitation?.coach_name}</strong> has invited you to be their client!
                </h4>
                <p className="text-muted">
                  Join FitTrack Pro as a coached client to get personalized workout programs and expert guidance.
                </p>
              </div>

              {invitation?.message && (
                <Card className="mb-4 bg-light">
                  <Card.Body>
                    <h6 className="mb-2">Personal Message:</h6>
                    <p className="mb-0 fst-italic">
                      "{invitation.message}"
                    </p>
                  </Card.Body>
                </Card>
              )}

              <div className="mb-4">
                <h6 className="mb-3">What you'll get as a coached client:</h6>
                <ul className="list-unstyled">
                  <li className="mb-2">📋 <strong>Personalized Programs:</strong> Custom workout plans designed for your goals</li>
                  <li className="mb-2">📊 <strong>Progress Tracking:</strong> Your coach can monitor your performance and progress</li>
                  <li className="mb-2">💡 <strong>Expert Insights:</strong> Receive coaching tips and recommendations</li>
                  <li className="mb-2">🎯 <strong>Goal Achievement:</strong> Structured approach to reaching your fitness goals</li>
                </ul>
              </div>

              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <strong>Coach:</strong> {invitation?.coach_name}
                  </div>
                  <Badge bg="info">
                    {getTimeRemaining(invitation?.expires_at)}
                  </Badge>
                </div>
                <small className="text-muted">
                  Expires: {formatExpirationDate(invitation?.expires_at)}
                </small>
              </div>

              {!user && (
                <Alert variant="info" className="mb-4">
                  <strong>Note:</strong> You'll need to sign in or create an account to accept this invitation.
                </Alert>
              )}

              <div className="d-grid gap-2">
                <Button
                  variant="success"
                  size="lg"
                  onClick={handleAccept}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      {user ? 'Accepting...' : 'Redirecting to Sign In...'}
                    </>
                  ) : (
                    <>
                      ✅ Accept Invitation
                    </>
                  )}
                </Button>
                
                <Button
                  variant="outline-secondary"
                  onClick={handleDecline}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Declining...
                    </>
                  ) : (
                    'Decline'
                  )}
                </Button>
              </div>

              <div className="text-center mt-4">
                <small className="text-muted">
                  By accepting, you agree to share your workout data with your coach according to your privacy settings.
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default InvitationResponse;