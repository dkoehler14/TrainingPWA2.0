import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Form, 
  Button, 
  Alert, 
  InputGroup, 
  Tab, 
  Tabs,
  Card,
  Badge
} from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { sendInvitation } from '../services/coachService';

/**
 * InviteClientModal Component
 * 
 * Modal for coaches to invite new clients via email or username.
 * Supports custom invitation messages and comprehensive validation.
 * 
 * Requirements: 2.1, 2.2, 2.3
 */
function InviteClientModal({ show, onHide, onInvitationSent }) {
  const { user, userProfile } = useAuth();
  
  // Form state
  const [invitationMethod, setInvitationMethod] = useState('email');
  const [formData, setFormData] = useState({
    targetEmail: '',
    targetUsername: '',
    message: ''
  });
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  // Reset form when modal opens/closes
  useEffect(() => {
    if (show) {
      resetForm();
    }
  }, [show]);

  const resetForm = () => {
    setFormData({
      targetEmail: '',
      targetUsername: '',
      message: ''
    });
    setInvitationMethod('email');
    setError('');
    setValidationErrors({});
    setIsSubmitting(false);
  };

  // Validation functions
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateUsername = (username) => {
    // Username should be at least 3 characters, alphanumeric with underscores/hyphens
    const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
    return usernameRegex.test(username);
  };

  const validateForm = () => {
    const errors = {};

    if (invitationMethod === 'email') {
      if (!formData.targetEmail.trim()) {
        errors.targetEmail = 'Email address is required';
      } else if (!validateEmail(formData.targetEmail.trim())) {
        errors.targetEmail = 'Please enter a valid email address';
      }
    } else {
      if (!formData.targetUsername.trim()) {
        errors.targetUsername = 'Username is required';
      } else if (!validateUsername(formData.targetUsername.trim())) {
        errors.targetUsername = 'Username must be 3-30 characters, letters, numbers, underscores, or hyphens only';
      }
    }

    // Message validation (optional but with limits)
    if (formData.message && formData.message.length > 500) {
      errors.message = 'Message must be 500 characters or less';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (isSubmitting) return;

    // Validate form
    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      // Prepare invitation data
      const invitationData = {
        coachId: user.id,
        coachEmail: user.email,
        coachName: userProfile?.name || user.email,
        message: formData.message.trim() || null
      };

      // Add target based on method
      if (invitationMethod === 'email') {
        invitationData.targetEmail = formData.targetEmail.trim();
      } else {
        invitationData.targetUsername = formData.targetUsername.trim();
      }

      // Send invitation
      const result = await sendInvitation(invitationData);

      // Notify parent component
      if (onInvitationSent) {
        onInvitationSent(result);
      }

      // Close modal and reset form
      onHide();
      resetForm();

    } catch (err) {
      console.error('Failed to send invitation:', err);
      
      // Handle specific error cases
      if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
        setError('An invitation has already been sent to this recipient or they are already your client.');
      } else if (err.message?.includes('not found') && invitationMethod === 'username') {
        setError('Username not found. Please check the username and try again.');
      } else if (err.message?.includes('invalid email')) {
        setError('The email address appears to be invalid. Please check and try again.');
      } else if (err.message?.includes('limit exceeded')) {
        setError('You have reached your client invitation limit. Please contact support for assistance.');
      } else {
        setError(err.message || 'Failed to send invitation. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const getDefaultMessage = () => {
    const coachName = userProfile?.name || 'Your coach';
    return `Hi! I'd like to invite you to be my client on FitTrack Pro. As your coach, I'll be able to create personalized workout programs for you and help track your progress. Looking forward to working with you!

- ${coachName}`;
  };

  const handleUseDefaultMessage = () => {
    setFormData(prev => ({
      ...prev,
      message: getDefaultMessage()
    }));
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          📧 Invite New Client
        </Modal.Title>
      </Modal.Header>
      
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && (
            <Alert variant="danger" dismissible onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {/* Invitation Method Selection */}
          <Card className="soft-card mb-4">
            <Card.Body>
              <h6 className="mb-3">How would you like to send the invitation?</h6>
              <Tabs
                activeKey={invitationMethod}
                onSelect={(k) => setInvitationMethod(k)}
                className="mb-3"
              >
                <Tab eventKey="email" title="📧 Email Address">
                  <div className="mt-3">
                    <Form.Group>
                      <Form.Label>Client's Email Address</Form.Label>
                      <InputGroup>
                        <InputGroup.Text>@</InputGroup.Text>
                        <Form.Control
                          type="email"
                          placeholder="client@example.com"
                          value={formData.targetEmail}
                          onChange={(e) => handleInputChange('targetEmail', e.target.value)}
                          isInvalid={!!validationErrors.targetEmail}
                          disabled={isSubmitting}
                          autoFocus={invitationMethod === 'email'}
                        />
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.targetEmail}
                        </Form.Control.Feedback>
                      </InputGroup>
                      <Form.Text className="text-muted">
                        An invitation email will be sent to this address with a link to accept your coaching invitation.
                      </Form.Text>
                    </Form.Group>
                  </div>
                </Tab>
                
                <Tab eventKey="username" title="👤 Username">
                  <div className="mt-3">
                    <Form.Group>
                      <Form.Label>Client's Username</Form.Label>
                      <InputGroup>
                        <InputGroup.Text>@</InputGroup.Text>
                        <Form.Control
                          type="text"
                          placeholder="username"
                          value={formData.targetUsername}
                          onChange={(e) => handleInputChange('targetUsername', e.target.value)}
                          isInvalid={!!validationErrors.targetUsername}
                          disabled={isSubmitting}
                          autoFocus={invitationMethod === 'username'}
                        />
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.targetUsername}
                        </Form.Control.Feedback>
                      </InputGroup>
                      <Form.Text className="text-muted">
                        An in-app notification will be sent to this user with your coaching invitation.
                      </Form.Text>
                    </Form.Group>
                  </div>
                </Tab>
              </Tabs>
            </Card.Body>
          </Card>

          {/* Custom Message */}
          <Card className="soft-card">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="mb-0">Personal Message (Optional)</h6>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={handleUseDefaultMessage}
                  disabled={isSubmitting}
                >
                  Use Default Message
                </Button>
              </div>
              
              <Form.Group>
                <Form.Control
                  as="textarea"
                  rows={6}
                  placeholder="Add a personal message to your invitation..."
                  value={formData.message}
                  onChange={(e) => handleInputChange('message', e.target.value)}
                  isInvalid={!!validationErrors.message}
                  disabled={isSubmitting}
                />
                <Form.Control.Feedback type="invalid">
                  {validationErrors.message}
                </Form.Control.Feedback>
                <div className="d-flex justify-content-between mt-2">
                  <Form.Text className="text-muted">
                    This message will be included with your invitation to help introduce yourself.
                  </Form.Text>
                  <Form.Text className={`${formData.message.length > 450 ? 'text-warning' : 'text-muted'}`}>
                    {formData.message.length}/500
                  </Form.Text>
                </div>
              </Form.Group>
            </Card.Body>
          </Card>

          {/* Preview Section */}
          {(formData.targetEmail || formData.targetUsername) && (
            <Card className="soft-card mt-4">
              <Card.Body>
                <h6 className="mb-3">Invitation Preview</h6>
                <div className="invitation-preview p-3 bg-light rounded">
                  <div className="mb-2">
                    <strong>To:</strong>{' '}
                    {invitationMethod === 'email' ? (
                      <Badge bg="primary">{formData.targetEmail}</Badge>
                    ) : (
                      <Badge bg="info">@{formData.targetUsername}</Badge>
                    )}
                  </div>
                  <div className="mb-2">
                    <strong>From:</strong> {userProfile?.name || user.email}
                  </div>
                  <div className="mb-2">
                    <strong>Method:</strong>{' '}
                    <Badge bg="secondary">
                      {invitationMethod === 'email' ? 'Email' : 'In-app notification'}
                    </Badge>
                  </div>
                  {formData.message && (
                    <div className="mt-3">
                      <strong>Message:</strong>
                      <div className="mt-2 p-2 bg-white rounded border">
                        {formData.message.split('\n').map((line, index) => (
                          <div key={index}>{line || <br />}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card.Body>
            </Card>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || (!formData.targetEmail && !formData.targetUsername)}
          >
            {isSubmitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Sending Invitation...
              </>
            ) : (
              <>
                📧 Send Invitation
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default InviteClientModal;