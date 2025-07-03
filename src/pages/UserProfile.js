import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, GoogleAuthProvider, linkWithPopup } from 'firebase/auth';
import '../styles/UserProfile.css'

function UserProfile() {
  const [userData, setUserData] = useState({
    email: '',
    name: '',
    age: '',
    heightFeet: '',
    heightInches: '',
    weightLbs: ''
  });
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [heightErrors, setHeightErrors] = useState({ feet: '', inches: '' });
  const user = auth.currentUser;
  const [isLoading, setIsLoading] = useState(true);
  const [googleLinked, setGoogleLinked] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        setIsLoading(true);
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData({
            email: user.email,
            name: data.name || '',
            age: data.age || '',
            heightFeet: data.heightFeet || '',
            heightInches: data.heightInches || '',
            weightLbs: data.weightLbs || ''
          });
        } else {
          setUserData({ email: user.email });
        }
      }
      setIsLoading(false);
    };
    fetchUserData();
  }, [user]);

  useEffect(() => {
    const checkGoogleLinked = () => {
      if (user) {
        setGoogleLinked(user.providerData.some((provider) => provider.providerId === 'google.com'));
      }
    };
    checkGoogleLinked();
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData(prev => ({ ...prev, [name]: value }));
    validateHeight(name, value);
  };

  const validateHeight = (field, value) => {
    const numValue = Number(value);
    let errors = { ...heightErrors };

    if (field === 'heightFeet') {
      if (numValue < 0) {
        errors.feet = 'Feet must be 0 or greater';
      } else if (numValue > 8) {
        errors.feet = 'Feet must be 8 or less';
      } else {
        errors.feet = '';
      }
    }

    if (field === 'heightInches') {
      if (numValue < 0) {
        errors.inches = 'Inches must be 0 or greater';
      } else if (numValue > 11) {
        errors.inches = 'Inches must be 11 or less';
      } else {
        errors.inches = '';
      }
    }

    setHeightErrors(errors);
  };

  const isHeightValid = () => {
    return !heightErrors.feet && !heightErrors.inches && userData.heightFeet !== '' && userData.heightInches !== '';
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isHeightValid()) {
      setError('Please fix height errors before updating.');
      return;
    }

    try {
      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, {
        email: userData.email,
        name: userData.name,
        age: Number(userData.age) || null,
        heightFeet: Number(userData.heightFeet),
        heightInches: Number(userData.heightInches),
        weightLbs: Number(userData.weightLbs) || null,
        createdAt: userData.createdAt || new Date()
      }, { merge: true });

      if (userData.email !== user.email) {
        await updateEmail(user, userData.email);
      }

      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      await updatePassword(user, newPassword);
      setSuccess('Password updated successfully!');
      setNewPassword('');
      setCurrentPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLinkGoogle = async () => {
    setError('');
    setSuccess('');
    setLinking(true);
    try {
      const provider = new GoogleAuthProvider();
      await linkWithPopup(user, provider);
      setGoogleLinked(true);
      setSuccess('Google account linked successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <Container fluid className="soft-container profile-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <div className="soft-card profile-card shadow border-0">
            <h1 className="soft-title profile-title text-center">User Profile</h1>
            {isLoading ? (
              <div className="text-center py-4">
                <Spinner animation="border" className="spinner-blue" />
                <p className="soft-text mt-2">Loading...</p>
              </div>
            ) : (
              <>
                {error && <Alert variant="danger" className="soft-alert profile-alert">{error}</Alert>}
                {success && <Alert variant="success" className="soft-alert profile-alert">{success}</Alert>}

                <div className="mb-4">
                  {googleLinked ? (
                    <Alert variant="info" className="soft-alert profile-alert mb-0">
                      Google account is already linked to your profile.
                    </Alert>
                  ) : (
                    <Button
                      variant="outline-primary"
                      onClick={handleLinkGoogle}
                      disabled={linking}
                      className="mb-2"
                    >
                      {linking ? 'Linking...' : 'Link Google Account'}
                    </Button>
                  )}
                </div>

                <Form onSubmit={handleProfileUpdate}>
                  <Form.Group controlId="formEmail" className="profile-form-group">
                    <Form.Label className="soft-label profile-label">Email</Form.Label>
                    <Form.Control
                      type="email"
                      name="email"
                      value={userData.email}
                      onChange={handleChange}
                      placeholder="Enter email"
                      className="soft-input profile-input"
                    />
                  </Form.Group>

                  <Form.Group controlId="formName" className="profile-form-group">
                    <Form.Label className="soft-label profile-label">Name</Form.Label>
                    <Form.Control
                      type="text"
                      name="name"
                      value={userData.name}
                      onChange={handleChange}
                      placeholder="Enter your name"
                      className="soft-input profile-input"
                    />
                  </Form.Group>

                  <Form.Group controlId="formAge" className="profile-form-group">
                    <Form.Label className="soft-label profile-label">Age</Form.Label>
                    <Form.Control
                      type="number"
                      name="age"
                      value={userData.age}
                      onChange={handleChange}
                      placeholder="Enter your age"
                      className="soft-input profile-input"
                    />
                  </Form.Group>

                  <Row>
                    <Col md={6}>
                      <Form.Group controlId="formHeightFeet" className="profile-form-group">
                        <Form.Label className="soft-label profile-label">Height (feet)</Form.Label>
                        <Form.Control
                          type="number"
                          name="heightFeet"
                          value={userData.heightFeet}
                          onChange={handleChange}
                          placeholder="Feet"
                          min="0"
                          max="8"
                          isInvalid={!!heightErrors.feet}
                          required
                          className="soft-input profile-input"
                        />
                        <Form.Control.Feedback type="invalid">{heightErrors.feet}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formHeightInches" className="profile-form-group">
                        <Form.Label className="soft-label profile-label">Height (inches)</Form.Label>
                        <Form.Control
                          type="number"
                          name="heightInches"
                          value={userData.heightInches}
                          onChange={handleChange}
                          placeholder="Inches"
                          min="0"
                          max="11"
                          isInvalid={!!heightErrors.inches}
                          required
                          className="soft-input profile-input"
                        />
                        <Form.Control.Feedback type="invalid">{heightErrors.inches}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group controlId="formWeightLbs" className="profile-form-group">
                    <Form.Label className="soft-label profile-label">Weight (lbs)</Form.Label>
                    <Form.Control
                      type="number"
                      name="weightLbs"
                      value={userData.weightLbs}
                      onChange={handleChange}
                      placeholder="Enter your weight in lbs"
                      className="soft-input profile-input"
                    />
                  </Form.Group>

                  <Button type="submit" className="soft-button profile-button gradient">Update Profile</Button>
                </Form>

                <h3 className="soft-title password-section-title">Change Password</h3>
                <Form onSubmit={handlePasswordUpdate}>
                  <Form.Group controlId="formCurrentPassword" className="profile-form-group">
                    <Form.Label className="soft-label profile-label">Current Password</Form.Label>
                    <Form.Control
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      required
                      className="soft-input profile-input"
                    />
                  </Form.Group>

                  <Form.Group controlId="formNewPassword" className="profile-form-group">
                    <Form.Label className="soft-label profile-label">New Password</Form.Label>
                    <Form.Control
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                      required
                      className="soft-input profile-input"
                    />
                  </Form.Group>

                  <Button type="submit" className="soft-button profile-button gradient">Update Password</Button>
                </Form>
              </>
            )}
          </div>
        </Col>
      </Row>
    </Container>
  );
}

export default UserProfile;