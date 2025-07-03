import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Alert } from 'react-bootstrap';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import Modal from 'react-bootstrap/Modal';
import useFirebaseError from '../hooks/useFirebaseError';

function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const { error: resetError, setError: setResetError, isLoading: resetLoading } = useFirebaseError();
  const navigate = useNavigate();

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        // Create user document in Firestore
        await setDoc(doc(db, "users", user.uid), {
          email: user.email,
          createdAt: new Date(),
          role: "user"
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setResetSuccess('');
    setResetError(null);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSuccess('Password reset email sent! Please check your inbox.');
    } catch (err) {
      setResetError(err);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      // Check if user doc exists, if not, create it
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await userDocRef.get?.() || (await import('firebase/firestore')).getDoc(userDocRef); // fallback for modular
      if (!userDocSnap.exists?.() && !(userDocSnap && userDocSnap.exists)) {
        await setDoc(userDocRef, {
          email: user.email,
          createdAt: new Date(),
          role: 'user',
        });
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Container className="mt-5">
      <Row className="justify-content-center">
        <Col md={6}>
          <h1 className="text-center mb-4">{isSignUp ? 'Sign Up' : 'Sign In'}</h1>
          <Button
            variant="light"
            onClick={handleGoogleSignIn}
            className="w-100 mb-3 d-flex align-items-center justify-content-center"
            style={{ border: '1px solid #ccc', fontWeight: 500 }}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: 22, height: 22, marginRight: 8 }} />
            Sign in with Google
          </Button>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleAuth}>
            <Form.Group controlId="formEmail">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={email}
                className="soft-input"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email"
              />
            </Form.Group>

            <Form.Group controlId="formPassword">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                value={password}
                className="soft-input"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
              />
            </Form.Group>

            <Button variant="primary" type="submit" className="soft-button mt-3">
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </Button>
            <Button
              variant="link"
              onClick={() => setIsSignUp(!isSignUp)}
              className="mt-3"
            >
              {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
            </Button>
            {!isSignUp && (
              <Button
                variant="link"
                className="mt-2 p-0"
                style={{ fontSize: '0.95rem' }}
                onClick={() => { setShowResetModal(true); setResetEmail(email); setResetSuccess(''); setResetError(null); }}
              >
                Forgot Password?
              </Button>
            )}
          </Form>
          {/* Password Reset Modal */}
          <Modal show={showResetModal} onHide={() => setShowResetModal(false)} centered>
            <Modal.Header closeButton>
              <Modal.Title>Reset Password</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {resetSuccess ? (
                <Alert variant="success">{resetSuccess}</Alert>
              ) : (
                <Form onSubmit={handlePasswordReset}>
                  <Form.Group controlId="resetEmail">
                    <Form.Label>Email</Form.Label>
                    <Form.Control
                      type="email"
                      value={resetEmail}
                      className="soft-input"
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                    />
                  </Form.Group>
                  {resetError && <Alert variant="danger" className="mt-3">{resetError}</Alert>}
                  <Button
                    variant="primary"
                    type="submit"
                    className="soft-button mt-3"
                    disabled={resetLoading}
                  >
                    {resetLoading ? 'Sending...' : 'Send Reset Email'}
                  </Button>
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