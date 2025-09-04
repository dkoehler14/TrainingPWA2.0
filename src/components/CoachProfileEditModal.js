import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Alert, Spinner, Row, Col, Badge } from 'react-bootstrap';
import { getCoachProfile, updateCoachProfile } from '../services/coachService';

function CoachProfileEditModal({ show, onHide, userId, onProfileUpdated }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [profileData, setProfileData] = useState({
    specializations: [],
    certifications: [],
    bio: '',
    phone: '',
    website: '',
    client_limit: ''
  });

  const [newSpecialization, setNewSpecialization] = useState('');
  const [newCertification, setNewCertification] = useState('');

  // Load existing profile data when modal opens
  useEffect(() => {
    if (show && userId) {
      loadProfileData();
    }
  }, [show, userId]);

  const loadProfileData = async () => {
    try {
      setLoading(true);
      setError('');
      const profile = await getCoachProfile(userId);

      if (profile) {
        setProfileData({
          specializations: profile.specializations || [],
          certifications: profile.certifications || [],
          bio: profile.bio || '',
          phone: profile.phone || '',
          website: profile.website || '',
          client_limit: profile.client_limit || ''
        });
      } else {
        // No profile exists yet, use defaults
        setProfileData({
          specializations: [],
          certifications: [],
          bio: '',
          phone: '',
          website: '',
          client_limit: ''
        });
      }
    } catch (err) {
      console.error('Failed to load coach profile:', err);
      setError('Failed to load profile data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addSpecialization = () => {
    if (newSpecialization.trim() && !profileData.specializations.includes(newSpecialization.trim())) {
      setProfileData(prev => ({
        ...prev,
        specializations: [...prev.specializations, newSpecialization.trim()]
      }));
      setNewSpecialization('');
    }
  };

  const removeSpecialization = (index) => {
    setProfileData(prev => ({
      ...prev,
      specializations: prev.specializations.filter((_, i) => i !== index)
    }));
  };

  const addCertification = () => {
    if (newCertification.trim() && !profileData.certifications.includes(newCertification.trim())) {
      setProfileData(prev => ({
        ...prev,
        certifications: [...prev.certifications, newCertification.trim()]
      }));
      setNewCertification('');
    }
  };

  const removeCertification = (index) => {
    setProfileData(prev => ({
      ...prev,
      certifications: prev.certifications.filter((_, i) => i !== index)
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const updates = {
        specializations: profileData.specializations,
        certifications: profileData.certifications,
        bio: profileData.bio,
        phone: profileData.phone || null,
        website: profileData.website || null,
        client_limit: profileData.client_limit ? parseInt(profileData.client_limit) : null
      };

      await updateCoachProfile(userId, updates);

      setSuccess('Profile updated successfully!');

      // Notify parent component
      if (onProfileUpdated) {
        onProfileUpdated();
      }

      // Close modal after a short delay
      setTimeout(() => {
        onHide();
      }, 1500);

    } catch (err) {
      console.error('Failed to update coach profile:', err);
      setError(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setError('');
      setSuccess('');
      onHide();
    }
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Edit Coach Profile</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" className="spinner-blue" />
            <p className="soft-text mt-2">Loading your profile...</p>
          </div>
        ) : (
          <>
            {error && <Alert variant="danger">{error}</Alert>}
            {success && <Alert variant="success">{success}</Alert>}

            <Form>
              {/* Specializations */}
              <Form.Group className="mb-3">
                <Form.Label>Specializations</Form.Label>
                <Row>
                  <Col md={8}>
                    <Form.Control
                      type="text"
                      placeholder="Add a specialization (e.g., Strength Training)"
                      value={newSpecialization}
                      onChange={(e) => setNewSpecialization(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSpecialization())}
                    />
                  </Col>
                  <Col md={4}>
                    <Button
                      variant="outline-primary"
                      onClick={addSpecialization}
                      disabled={!newSpecialization.trim()}
                    >
                      Add
                    </Button>
                  </Col>
                </Row>
                <div className="mt-2">
                  {profileData.specializations.map((spec, index) => (
                    <Badge
                      key={index}
                      bg="primary"
                      className="me-2 mb-2"
                      style={{ cursor: 'pointer' }}
                      onClick={() => removeSpecialization(index)}
                    >
                      {spec} ×
                    </Badge>
                  ))}
                </div>
                <Form.Text className="text-muted">
                  Click on a specialization to remove it
                </Form.Text>
              </Form.Group>

              {/* Certifications */}
              <Form.Group className="mb-3">
                <Form.Label>Certifications</Form.Label>
                <Row>
                  <Col md={8}>
                    <Form.Control
                      type="text"
                      placeholder="Add a certification (e.g., NSCA-CSCS)"
                      value={newCertification}
                      onChange={(e) => setNewCertification(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCertification())}
                    />
                  </Col>
                  <Col md={4}>
                    <Button
                      variant="outline-primary"
                      onClick={addCertification}
                      disabled={!newCertification.trim()}
                    >
                      Add
                    </Button>
                  </Col>
                </Row>
                <div className="mt-2">
                  {profileData.certifications.map((cert, index) => (
                    <Badge
                      key={index}
                      bg="success"
                      className="me-2 mb-2"
                      style={{ cursor: 'pointer' }}
                      onClick={() => removeCertification(index)}
                    >
                      {cert} ×
                    </Badge>
                  ))}
                </div>
                <Form.Text className="text-muted">
                  Click on a certification to remove it
                </Form.Text>
              </Form.Group>

              {/* Bio */}
              <Form.Group className="mb-3">
                <Form.Label>Bio</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  placeholder="Tell clients about your coaching experience, philosophy, and what makes you unique..."
                  value={profileData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  maxLength={1000}
                />
                <Form.Text className="text-muted">
                  {profileData.bio.length}/1000 characters
                </Form.Text>
              </Form.Group>

              {/* Contact Information */}
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Phone</Form.Label>
                    <Form.Control
                      type="tel"
                      placeholder="Your phone number"
                      value={profileData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Website</Form.Label>
                    <Form.Control
                      type="url"
                      placeholder="https://yourwebsite.com"
                      value={profileData.website}
                      onChange={(e) => handleInputChange('website', e.target.value)}
                    />
                  </Form.Group>
                </Col>
              </Row>

              {/* Client Limit */}
              <Form.Group className="mb-3">
                <Form.Label>Maximum Client Limit (Optional)</Form.Label>
                <Form.Control
                  type="number"
                  placeholder="Maximum number of clients you can handle"
                  value={profileData.client_limit}
                  onChange={(e) => handleInputChange('client_limit', e.target.value)}
                  min="1"
                  max="100"
                />
                <Form.Text className="text-muted">
                  Leave empty for unlimited clients
                </Form.Text>
              </Form.Group>
            </Form>
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default CoachProfileEditModal;