import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Table, Form, Modal, Alert, Spinner, Badge } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { searchUsers, promoteToCoach, demoteCoach, getAllCoaches } from '../services/userService';
import { getCoachProfile } from '../services/coachService';
import { validateCoachPromotion, validateCoachDemotion, validateCoachProfile } from '../utils/roleValidation';
import { useAuth } from '../hooks/useAuth';

function Admin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [coaches, setCoaches] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Coach promotion modal state
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [coachData, setCoachData] = useState({
    specializations: [],
    bio: ''
  });

  // Load coaches on component mount
  useEffect(() => {
    loadCoaches();
  }, []);

  const loadCoaches = async () => {
    try {
      setLoading(true);
      const coachList = await getAllCoaches();
      setCoaches(coachList);
    } catch (error) {
      console.error('Failed to load coaches:', error);
      setError('Failed to load coaches');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const results = await searchUsers(searchTerm);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePromoteUser = (user) => {
    setSelectedUser(user);
    setCoachData({ specializations: [], bio: '' });
    setShowPromoteModal(true);
  };

  const confirmPromotion = async () => {
    if (!selectedUser) return;

    try {
      setLoading(true);
      setError('');
      
      // Validate promotion
      const promotionValidation = await validateCoachPromotion(selectedUser, user);
      if (!promotionValidation.isValid) {
        setError(promotionValidation.errors.join(', '));
        return;
      }

      // Validate coach profile data
      const profileValidation = validateCoachProfile(coachData);
      if (!profileValidation.isValid) {
        setError(profileValidation.errors.join(', '));
        return;
      }

      // Show warnings if any
      const allWarnings = [...promotionValidation.warnings, ...profileValidation.warnings];
      if (allWarnings.length > 0) {
        const proceedWithWarnings = window.confirm(
          `Warnings:\n${allWarnings.join('\n')}\n\nDo you want to proceed?`
        );
        if (!proceedWithWarnings) {
          return;
        }
      }
      
      await promoteToCoach(selectedUser.id, coachData);
      
      setSuccess(`Successfully promoted ${selectedUser.name || selectedUser.email} to coach`);
      setShowPromoteModal(false);
      setSelectedUser(null);
      
      // Refresh coaches list
      await loadCoaches();
      
      // Clear search results to show updated status
      setSearchResults([]);
      setSearchTerm('');
      
    } catch (error) {
      console.error('Promotion failed:', error);
      setError(`Failed to promote user: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoteCoach = async (coachId, coachName) => {
    try {
      // Validate demotion
      const coach = { id: coachId, name: coachName };
      const demotionValidation = await validateCoachDemotion(coach, user);
      
      if (!demotionValidation.isValid) {
        setError(demotionValidation.errors.join(', '));
        return;
      }

      // Show confirmation with warnings
      const warningMessage = demotionValidation.warnings.length > 0 
        ? `\n\nWarnings:\n${demotionValidation.warnings.join('\n')}`
        : '';
      
      if (!window.confirm(`Are you sure you want to demote ${coachName}?${warningMessage}`)) {
        return;
      }

      setLoading(true);
      setError('');
      
      await demoteCoach(coachId);
      
      setSuccess(`Successfully demoted ${coachName} from coach role`);
      
      // Refresh coaches list
      await loadCoaches();
      
    } catch (error) {
      console.error('Demotion failed:', error);
      setError(`Failed to demote coach: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addSpecialization = () => {
    setCoachData(prev => ({
      ...prev,
      specializations: [...prev.specializations, '']
    }));
  };

  const updateSpecialization = (index, value) => {
    setCoachData(prev => ({
      ...prev,
      specializations: prev.specializations.map((spec, i) => i === index ? value : spec)
    }));
  };

  const removeSpecialization = (index) => {
    setCoachData(prev => ({
      ...prev,
      specializations: prev.specializations.filter((_, i) => i !== index)
    }));
  };

  return (
    <Container fluid className="soft-container home-container">
      <Row className="justify-content-center">
        <Col md={10}>
          <Card className="soft-card shadow border-0 p-4 mt-5">
            <h1 className="soft-title text-center mb-4">Admin Panel</h1>
            
            {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
            {success && <Alert variant="success" onClose={() => setSuccess('')} dismissible>{success}</Alert>}
            
            {/* Navigation Tabs */}
            <div className="mb-4">
              <Button 
                variant={activeTab === 'overview' ? 'primary' : 'outline-primary'}
                className="me-2 mb-2"
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </Button>
              <Button 
                variant={activeTab === 'coaches' ? 'primary' : 'outline-primary'}
                className="me-2 mb-2"
                onClick={() => setActiveTab('coaches')}
              >
                Manage Coaches
              </Button>
              <Button 
                variant={activeTab === 'promote' ? 'primary' : 'outline-primary'}
                className="me-2 mb-2"
                onClick={() => setActiveTab('promote')}
              >
                Promote Users
              </Button>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div>
                <p className="soft-text text-center">This page is only accessible to users with the <b>admin</b> role.</p>
                <div className="text-center mt-4">
                  <Button variant="primary" onClick={() => navigate('/create-program')} className="me-2">
                    Create Template Program
                  </Button>
                </div>
                
                <Row className="mt-4">
                  <Col md={6}>
                    <Card className="h-100">
                      <Card.Body>
                        <Card.Title>System Statistics</Card.Title>
                        <p><strong>Active Coaches:</strong> {coaches.filter(c => c.coach_profiles?.[0]?.is_active).length}</p>
                        <p><strong>Total Coaches:</strong> {coaches.length}</p>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={6}>
                    <Card className="h-100">
                      <Card.Body>
                        <Card.Title>Quick Actions</Card.Title>
                        <Button variant="outline-primary" size="sm" onClick={() => setActiveTab('promote')} className="me-2">
                          Promote User to Coach
                        </Button>
                        <Button variant="outline-secondary" size="sm" onClick={() => setActiveTab('coaches')}>
                          Manage Coaches
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </div>
            )}

            {/* Coaches Management Tab */}
            {activeTab === 'coaches' && (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h4>Current Coaches</h4>
                  <Button variant="primary" onClick={() => setActiveTab('promote')}>
                    Promote New Coach
                  </Button>
                </div>
                
                {loading ? (
                  <div className="text-center">
                    <Spinner animation="border" />
                  </div>
                ) : (
                  <Table responsive striped>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Specializations</th>
                        <th>Joined</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coaches.map(coach => (
                        <tr key={coach.id}>
                          <td>{coach.name || 'N/A'}</td>
                          <td>{coach.email}</td>
                          <td>
                            <Badge bg={coach.coach_profiles?.[0]?.is_active ? 'success' : 'secondary'}>
                              {coach.coach_profiles?.[0]?.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td>
                            {coach.coach_profiles?.[0]?.specializations?.length > 0 
                              ? coach.coach_profiles[0].specializations.join(', ')
                              : 'None specified'
                            }
                          </td>
                          <td>{new Date(coach.created_at).toLocaleDateString()}</td>
                          <td>
                            <Button 
                              variant="outline-danger" 
                              size="sm"
                              onClick={() => handleDemoteCoach(coach.id, coach.name || coach.email)}
                              disabled={loading}
                            >
                              Demote
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {coaches.length === 0 && (
                        <tr>
                          <td colSpan="6" className="text-center">No coaches found</td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                )}
              </div>
            )}

            {/* Promote Users Tab */}
            {activeTab === 'promote' && (
              <div>
                <h4 className="mb-3">Promote Users to Coach</h4>
                
                <Row className="mb-3">
                  <Col md={8}>
                    <Form.Control
                      type="text"
                      placeholder="Search users by name or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                  </Col>
                  <Col md={4}>
                    <Button variant="primary" onClick={handleSearch} disabled={loading}>
                      {loading ? <Spinner animation="border" size="sm" /> : 'Search'}
                    </Button>
                  </Col>
                </Row>

                {searchResults.length > 0 && (
                  <Table responsive striped>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Experience Level</th>
                        <th>Joined</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map(user => (
                        <tr key={user.id}>
                          <td>{user.name || 'N/A'}</td>
                          <td>{user.email}</td>
                          <td>
                            <Badge bg="info">
                              {user.experience_level || 'Not specified'}
                            </Badge>
                          </td>
                          <td>{new Date(user.created_at).toLocaleDateString()}</td>
                          <td>
                            <Button 
                              variant="success" 
                              size="sm"
                              onClick={() => handlePromoteUser(user)}
                              disabled={loading}
                            >
                              Promote to Coach
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Coach Promotion Modal */}
      <Modal show={showPromoteModal} onHide={() => setShowPromoteModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Promote User to Coach</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedUser && (
            <div>
              <p><strong>User:</strong> {selectedUser.name || selectedUser.email}</p>
              <p><strong>Email:</strong> {selectedUser.email}</p>
              
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Coach Bio</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Enter coach bio and qualifications..."
                    value={coachData.bio}
                    onChange={(e) => setCoachData(prev => ({ ...prev, bio: e.target.value }))}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Specializations</Form.Label>
                  {coachData.specializations.map((spec, index) => (
                    <div key={index} className="d-flex mb-2">
                      <Form.Control
                        type="text"
                        placeholder="e.g., Strength Training, Weight Loss, etc."
                        value={spec}
                        onChange={(e) => updateSpecialization(index, e.target.value)}
                      />
                      <Button 
                        variant="outline-danger" 
                        className="ms-2"
                        onClick={() => removeSpecialization(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline-primary" onClick={addSpecialization}>
                    Add Specialization
                  </Button>
                </Form.Group>
              </Form>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPromoteModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={confirmPromotion}
            disabled={loading}
          >
            {loading ? <Spinner animation="border" size="sm" /> : 'Promote to Coach'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default Admin; 