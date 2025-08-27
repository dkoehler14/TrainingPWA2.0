import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { updatePassword, error: authError, clearError } = useAuth();

  // Check for token in URL parameters
  useEffect(() => {
    const token = searchParams.get('token');
    const type = searchParams.get('type');

    if (!token || type !== 'recovery') {
      setError('Invalid or expired reset link. Please request a new password reset.');
    }
  }, [searchParams]);

  // Clear errors when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    clearError();

    // Validate passwords
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await updatePassword(password);
      setSuccess('Password updated successfully! You will be redirected to the login page.');
      setTimeout(() => {
        navigate('/auth');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const displayError = error || authError?.message;

  return (
    <Container className="mt-5">
      <Row className="justify-content-center">
        <Col md={6}>
          <h1 className="text-center mb-4">Reset Your Password</h1>

          {displayError && <Alert variant="danger">{displayError}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}

          <Form onSubmit={handlePasswordReset}>
            <Form.Group controlId="formNewPassword" className="mb-3">
              <Form.Label>New Password</Form.Label>
              <Form.Control
                type="password"
                value={password}
                className="soft-input"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                minLength={8}
                required
                disabled={loading}
              />
              <Form.Text className="text-muted">
                Password must be at least 8 characters long.
              </Form.Text>
            </Form.Group>

            <Form.Group controlId="formConfirmPassword" className="mb-3">
              <Form.Label>Confirm New Password</Form.Label>
              <Form.Control
                type="password"
                value={confirmPassword}
                className="soft-input"
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                minLength={8}
                required
                disabled={loading}
              />
            </Form.Group>

            <Button
              variant="primary"
              type="submit"
              className="soft-button w-100 mb-3"
              disabled={loading || !password || !confirmPassword}
            >
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Updating Password...
                </>
              ) : (
                'Update Password'
              )}
            </Button>
          </Form>

          <div className="text-center">
            <Button
              variant="link"
              onClick={() => navigate('/auth')}
              disabled={loading}
              className="p-0"
            >
              Back to Sign In
            </Button>
          </div>
        </Col>
      </Row>
    </Container>
  );
}

export default ResetPassword;