import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Alert } from 'react-bootstrap';
import { useNavigate, useLocation } from 'react-router-dom';
import Modal from 'react-bootstrap/Modal';
import { useAuth } from '../hooks/useAuth';
import { useGuestRoute } from '../hooks/useProtectedRoute';

function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [localError, setLocalError] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const {
    signUp,
    signIn,
    signInWithGoogle,
    resetPassword,
    error: authError,
    clearError,
    loading
  } = useAuth();

  // Protect this route for guests only
  const { isGuestAllowed, isChecking } = useGuestRoute();

  // Get redirect destination
  const from = location.state?.from || '/';

  // Clear errors when switching between sign in/up
  useEffect(() => {
    setLocalError('');
    clearError();
  }, [isSignUp, clearError]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLocalError('');
    clearError();
    setAuthLoading(true);

    try {
      if (isSignUp) {
        const result = await signUp(email, password, { name });

        if (result.needsConfirmation) {
          setLocalError('');
          setResetSuccess('Please check your email to confirm your account before signing in.');
          setIsSignUp(false); // Switch to sign in mode
        } else {
          // User is signed up and confirmed, redirect
          navigate(from);
        }
      } else {
        await signIn(email, password);
        navigate(from);
      }
    } catch (err) {
      setLocalError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setResetSuccess('');
    setResetLoading(true);

    try {
      await resetPassword(resetEmail);
      setResetSuccess('Password reset email sent! Please check your inbox.');
    } catch (err) {
      setLocalError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError('');
    clearError();
    setAuthLoading(true);

    try {
      await signInWithGoogle();
      // Navigation will be handled by the auth context
      navigate(from);
    } catch (err) {
      setLocalError(err.message || 'Google sign in failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Show loading while checking guest route
  if (isChecking) {
    return (
      <Container className="mt-5">
        <Row className="justify-content-center">
          <Col md={6} className="text-center">
            <div>Loading...</div>
          </Col>
        </Row>
      </Container>
    );
  }

  // Don't render if not allowed (will be redirected)
  if (!isGuestAllowed) {
    return null;
  }

  const displayError = localError || authError?.message;
  const isLoading = loading || authLoading;

  return (
    <Container className="mt-5">
      <Row className="justify-content-center">
        <Col md={6}>
          <h1 className="text-center mb-4">{isSignUp ? 'Sign Up' : 'Sign In'}</h1>

          <Button
            variant="light"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-100 mb-3 d-flex align-items-center justify-content-center"
            style={{ border: '1px solid #ccc', fontWeight: 500 }}
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google"
              style={{ width: 22, height: 22, marginRight: 8 }}
            />
            {isLoading ? 'Signing in...' : 'Sign in with Google'}
          </Button>

          <div className="text-center mb-3 text-muted">
            <small>or</small>
          </div>

          {displayError && <Alert variant="danger">{displayError}</Alert>}
          {resetSuccess && <Alert variant="success">{resetSuccess}</Alert>}

          <Form onSubmit={handleAuth}>
            {isSignUp && (
              <Form.Group controlId="formName" className="mb-3">
                <Form.Label>Full Name</Form.Label>
                <Form.Control
                  type="text"
                  value={name}
                  className="soft-input"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required={isSignUp}
                />
              </Form.Group>
            )}

            <Form.Group controlId="formEmail" className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={email}
                className="soft-input"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email"
                required
              />
            </Form.Group>

            <Form.Group controlId="formPassword" className="mb-3">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                value={password}
                className="soft-input"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                minLength={6}
                required
              />
              {isSignUp && (
                <Form.Text className="text-muted">
                  Password must be at least 6 characters long.
                </Form.Text>
              )}
            </Form.Group>

            <Button
              variant="primary"
              type="submit"
              className="soft-button w-100 mb-3"
              disabled={isLoading}
            >
              {isLoading ? 'Please wait...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            </Button>
          </Form>

          <div className="text-center">
            <Button
              variant="link"
              onClick={() => setIsSignUp(!isSignUp)}
              disabled={isLoading}
              className="p-0"
            >
              {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
            </Button>
          </div>

          {!isSignUp && (
            <div className="text-center mt-2">
              <Button
                variant="link"
                className="p-0"
                style={{ fontSize: '0.95rem' }}
                onClick={() => {
                  setShowResetModal(true);
                  setResetEmail(email);
                  setResetSuccess('');
                  setLocalError('');
                }}
                disabled={isLoading}
              >
                Forgot Password?
              </Button>
            </div>
          )}
          {/* Password Reset Modal */}
          <Modal
            show={showResetModal}
            onHide={() => {
              setShowResetModal(false);
              setResetSuccess('');
              setLocalError('');
            }}
            centered
          >
            <Modal.Header closeButton>
              <Modal.Title>Reset Password</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {resetSuccess ? (
                <div>
                  <Alert variant="success">{resetSuccess}</Alert>
                  <Button
                    variant="primary"
                    onClick={() => setShowResetModal(false)}
                    className="soft-button"
                  >
                    Close
                  </Button>
                </div>
              ) : (
                <Form onSubmit={handlePasswordReset}>
                  <Form.Group controlId="resetEmail" className="mb-3">
                    <Form.Label>Email</Form.Label>
                    <Form.Control
                      type="email"
                      value={resetEmail}
                      className="soft-input"
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                    />
                    <Form.Text className="text-muted">
                      We'll send you a link to reset your password.
                    </Form.Text>
                  </Form.Group>

                  {localError && <Alert variant="danger">{localError}</Alert>}

                  <div className="d-flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setShowResetModal(false)}
                      disabled={resetLoading}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      type="submit"
                      className="soft-button"
                      disabled={resetLoading || !resetEmail}
                    >
                      {resetLoading ? 'Sending...' : 'Send Reset Email'}
                    </Button>
                  </div>
                </Form>
              )}
            </Modal.Body>
          </Modal>
        </Col>
      </Row>
    </Container>
  );
}

export default Auth;