import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { useProtectedRoute } from '../hooks/useProtectedRoute';
import '../styles/UserProfile.css'

function UserProfile() {
  const [userData, setUserData] = useState({
    email: '',
    name: '',
    age: '',
    experience_level: 'beginner',
    preferred_units: 'LB',
    height: '',
    weight: '',
    goals: [],
    available_equipment: [],
    injuries: []
  });
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  // Use protected route hook
  const { isAuthorized, isChecking } = useProtectedRoute();
  
  // Use auth hook
  const {
    user,
    userProfile,
    loading,
    updateProfile,
    updatePassword,
    updateEmail,
    error: authError,
    clearError
  } = useAuth();

  // Load user profile data
  useEffect(() => {
    if (userProfile) {
      setUserData({
        email: user?.email || '',
        name: userProfile.name || '',
        age: userProfile.age || '',
        experience_level: userProfile.experience_level || 'beginner',
        preferred_units: userProfile.preferred_units || 'LB',
        height: userProfile.height || '',
        weight: userProfile.weight || '',
        goals: userProfile.goals || [],
        available_equipment: userProfile.available_equipment || [],
        injuries: userProfile.injuries || []
      });
    } else if (user) {
      setUserData(prev => ({
        ...prev,
        email: user.email || ''
      }));
    }
  }, [user, userProfile]);

  // Clear errors when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      // Handle array fields (goals, equipment, injuries)
      setUserData(prev => {
        const currentArray = prev[name] || [];
        if (checked) {
          return { ...prev, [name]: [...currentArray, value] };
        } else {
          return { ...prev, [name]: currentArray.filter(item => item !== value) };
        }
      });
    } else {
      setUserData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleArrayInput = (name, value) => {
    if (value.trim()) {
      setUserData(prev => ({
        ...prev,
        [name]: [...(prev[name] || []), value.trim()]
      }));
    }
  };

  const removeArrayItem = (name, index) => {
    setUserData(prev => ({
      ...prev,
      [name]: prev[name].filter((_, i) => i !== index)
    }));
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsUpdating(true);
    clearError();

    try {
      // Prepare profile data
      const profileData = {
        name: userData.name,
        age: userData.age ? Number(userData.age) : null,
        experience_level: userData.experience_level,
        preferred_units: userData.preferred_units,
        height: userData.height ? Number(userData.height) : null,
        weight: userData.weight ? Number(userData.weight) : null,
        goals: userData.goals,
        available_equipment: userData.available_equipment,
        injuries: userData.injuries
      };

      // Update profile
      await updateProfile(profileData);

      // Update email if changed
      if (userData.email !== user?.email) {
        await updateEmail(userData.email);
      }

      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setPasswordUpdating(true);
    clearError();

    try {
      await updatePassword(newPassword);
      setSuccess('Password updated successfully!');
      setNewPassword('');
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setPasswordUpdating(false);
    }
  };

  // Show loading while checking authorization
  if (isChecking) {
    return (
      <Container fluid className="soft-container profile-container">
        <Row className="justify-content-center">
          <Col md={8}>
            <div className="text-center py-4">
              <Spinner animation="border" className="spinner-blue" />
              <p className="soft-text mt-2">Loading...</p>
            </div>
          </Col>
        </Row>
      </Container>
    );
  }

  // Don't render if not authorized (will be redirected)
  if (!isAuthorized) {
    return null;
  }

  const displayError = error || authError?.message;
  const isLoading = loading || isUpdating || passwordUpdating;

  return (
    <Container fluid className="soft-container profile-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <div className="soft-card profile-card shadow border-0">
            <h1 className="soft-title profile-title text-center">User Profile</h1>
            {loading ? (
              <div className="text-center py-4">
                <Spinner animation="border" className="spinner-blue" />
                <p className="soft-text mt-2">Loading profile...</p>
              </div>
            ) : (
              <>
                {displayError && <Alert variant="danger" className="soft-alert profile-alert">{displayError}</Alert>}
                {success && <Alert variant="success" className="soft-alert profile-alert">{success}</Alert>}

                <Form onSubmit={handleProfileUpdate}>
                  <Row>
                    <Col md={6}>
                      <Form.Group controlId="formEmail" className="profile-form-group">
                        <Form.Label className="soft-label profile-label">Email</Form.Label>
                        <Form.Control
                          type="email"
                          name="email"
                          value={userData.email}
                          onChange={handleChange}
                          placeholder="Enter email"
                          className="soft-input profile-input"
                          disabled={isUpdating}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formName" className="profile-form-group">
                        <Form.Label className="soft-label profile-label">Name *</Form.Label>
                        <Form.Control
                          type="text"
                          name="name"
                          value={userData.name}
                          onChange={handleChange}
                          placeholder="Enter your full name"
                          className="soft-input profile-input"
                          required
                          disabled={isUpdating}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={4}>
                      <Form.Group controlId="formAge" className="profile-form-group">
                        <Form.Label className="soft-label profile-label">Age</Form.Label>
                        <Form.Control
                          type="number"
                          name="age"
                          value={userData.age}
                          onChange={handleChange}
                          placeholder="Age"
                          min="13"
                          max="120"
                          className="soft-input profile-input"
                          disabled={isUpdating}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group controlId="formExperienceLevel" className="profile-form-group">
                        <Form.Label className="soft-label profile-label">Experience Level *</Form.Label>
                        <Form.Select
                          name="experience_level"
                          value={userData.experience_level}
                          onChange={handleChange}
                          className="soft-input profile-input"
                          required
                          disabled={isUpdating}
                        >
                          <option value="beginner">Beginner</option>
                          <option value="intermediate">Intermediate</option>
                          <option value="advanced">Advanced</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group controlId="formPreferredUnits" className="profile-form-group">
                        <Form.Label className="soft-label profile-label">Preferred Units</Form.Label>
                        <Form.Select
                          name="preferred_units"
                          value={userData.preferred_units}
                          onChange={handleChange}
                          className="soft-input profile-input"
                          disabled={isUpdating}
                        >
                          <option value="LB">Pounds (LB)</option>
                          <option value="KG">Kilograms (KG)</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Row>
                    <Col md={6}>
                      <Form.Group controlId="formHeight" className="profile-form-group">
                        <Form.Label className="soft-label profile-label">
                          Height ({userData.preferred_units === 'KG' ? 'cm' : 'inches'})
                        </Form.Label>
                        <Form.Control
                          type="number"
                          name="height"
                          value={userData.height}
                          onChange={handleChange}
                          placeholder={userData.preferred_units === 'KG' ? 'Height in cm' : 'Height in inches'}
                          min="0"
                          className="soft-input profile-input"
                          disabled={isUpdating}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formWeight" className="profile-form-group">
                        <Form.Label className="soft-label profile-label">
                          Weight ({userData.preferred_units})
                        </Form.Label>
                        <Form.Control
                          type="number"
                          name="weight"
                          value={userData.weight}
                          onChange={handleChange}
                          placeholder={`Weight in ${userData.preferred_units}`}
                          min="0"
                          step="0.1"
                          className="soft-input profile-input"
                          disabled={isUpdating}
                        />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Button 
                    type="submit" 
                    className="soft-button profile-button gradient"
                    disabled={isUpdating}
                  >
                    {isUpdating ? 'Updating...' : 'Update Profile'}
                  </Button>
                </Form>

                <h3 className="soft-title password-section-title">Change Password</h3>
                <Form onSubmit={handlePasswordUpdate}>
                  <Form.Group controlId="formNewPassword" className="profile-form-group">
                    <Form.Label className="soft-label profile-label">New Password</Form.Label>
                    <Form.Control
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                      minLength={6}
                      required
                      className="soft-input profile-input"
                      disabled={passwordUpdating}
                    />
                    <Form.Text className="text-muted">
                      Password must be at least 6 characters long.
                    </Form.Text>
                  </Form.Group>

                  <Button 
                    type="submit" 
                    className="soft-button profile-button gradient"
                    disabled={passwordUpdating || !newPassword}
                  >
                    {passwordUpdating ? 'Updating...' : 'Update Password'}
                  </Button>
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