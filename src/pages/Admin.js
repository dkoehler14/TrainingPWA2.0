import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Table, Form, Modal, Alert, Spinner, Badge, ProgressBar, Tabs, Tab } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { searchUsers, promoteToCoach, demoteCoach, getAllCoaches } from '../services/userService';
import { getCoachProfile } from '../services/coachService';
import { validateCoachPromotion, validateCoachDemotion, validateCoachProfile } from '../utils/roleValidation';
import { useAuth } from '../hooks/useAuth';
import { 
  getCoachSystemStatistics, 
  getCoachActivityData, 
  getCoachClientRelationshipOversight,
  getSystemAlerts,
  getCoachPerformanceMetrics,
  toggleCoachSuspension,
  cleanupExpiredInvitations
} from '../services/adminCoachService';
import '../styles/AdminCoachManagement.css';

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

  // New state for enhanced admin features
  const [systemStats, setSystemStats] = useState(null);
  const [coachActivityData, setCoachActivityData] = useState([]);
  const [relationshipData, setRelationshipData] = useState([]);
  const [systemAlerts, setSystemAlerts] = useState([]);
  const [performanceMetrics, setPerformanceMetrics] = useState(null);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState('');

  // Load coaches on component mount
  useEffect(() => {
    loadCoaches();
    loadSystemData();
  }, []);

  // Load system data for admin dashboard
  const loadSystemData = async () => {
    try {
      setLoading(true);
      
      // Load all admin data in parallel
      const [stats, activity, relationships, alerts, metrics] = await Promise.all([
        getCoachSystemStatistics(),
        getCoachActivityData(50),
        getCoachClientRelationshipOversight({ limit: 100 }),
        getSystemAlerts(),
        getCoachPerformanceMetrics()
      ]);

      setSystemStats(stats);
      setCoachActivityData(activity);
      setRelationshipData(relationships);
      setSystemAlerts(alerts);
      setPerformanceMetrics(metrics);
    } catch (error) {
      console.error('Failed to load system data:', error);
      setError('Failed to load system data');
    } finally {
      setLoading(false);
    }
  };

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

  // Handle coach suspension
  const handleSuspendCoach = (coach) => {
    setSelectedCoach(coach);
    setSuspensionReason('');
    setShowSuspendModal(true);
  };

  const confirmSuspension = async () => {
    if (!selectedCoach) return;

    try {
      setLoading(true);
      setError('');
      
      const isCurrentlySuspended = !selectedCoach.coach_profiles?.[0]?.is_active;
      
      await toggleCoachSuspension(
        selectedCoach.id, 
        !isCurrentlySuspended, 
        suspensionReason
      );
      
      setSuccess(
        `Successfully ${isCurrentlySuspended ? 'reactivated' : 'suspended'} ${selectedCoach.name || selectedCoach.email}`
      );
      setShowSuspendModal(false);
      setSelectedCoach(null);
      
      // Refresh data
      await loadCoaches();
      await loadSystemData();
      
    } catch (error) {
      console.error('Suspension action failed:', error);
      setError(`Failed to ${!selectedCoach.coach_profiles?.[0]?.is_active ? 'reactivate' : 'suspend'} coach: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Clean up expired invitations
  const handleCleanupInvitations = async () => {
    try {
      setLoading(true);
      setError('');
      
      const cleanedCount = await cleanupExpiredInvitations();
      setSuccess(`Cleaned up ${cleanedCount} expired invitations`);
      
      // Refresh alerts
      const alerts = await getSystemAlerts();
      setSystemAlerts(alerts);
      
    } catch (error) {
      console.error('Cleanup failed:', error);
      setError(`Failed to cleanup invitations: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Get activity score color
  const getActivityScoreColor = (score) => {
    if (score >= 10) return 'success';
    if (score >= 5) return 'warning';
    return 'danger';
  };

  // Get health score color
  const getHealthScoreColor = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'danger';
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Format relative time
  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    return `${Math.floor(diffInDays / 30)} months ago`;
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
            <Tabs activeKey={activeTab} onSelect={setActiveTab} className="mb-4">
              <Tab eventKey="overview" title="Overview">
                {/* Overview content will be here */}
              </Tab>
              <Tab eventKey="coaches" title="Manage Coaches">
                {/* Coaches content will be here */}
              </Tab>
              <Tab eventKey="activity" title="Coach Activity">
                {/* Activity monitoring content will be here */}
              </Tab>
              <Tab eventKey="relationships" title="Relationships">
                {/* Relationship oversight content will be here */}
              </Tab>
              <Tab eventKey="alerts" title={`Alerts ${systemAlerts.length > 0 ? `(${systemAlerts.length})` : ''}`}>
                {/* System alerts content will be here */}
              </Tab>
              <Tab eventKey="promote" title="Promote Users">
                {/* Promotion content will be here */}
              </Tab>
            </Tabs>

            {/* Tab Content */}
            {activeTab === 'overview' && (
              <div>
                <p className="soft-text text-center">This page is only accessible to users with the <b>admin</b> role.</p>
                
                {/* System Statistics Cards */}
                {systemStats && (
                  <Row className="mb-4">
                    <Col md={3}>
                      <Card className="admin-stats-card text-center">
                        <Card.Body>
                          <h3 className="text-primary">{systemStats.activeCoaches}</h3>
                          <p className="mb-0">Active Coaches</p>
                          <small className="text-muted">of {systemStats.totalCoaches} total</small>
                        </Card.Body>
                      </Card>
                    </Col>
                    <Col md={3}>
                      <Card className="admin-stats-card text-center">
                        <Card.Body>
                          <h3 className="text-success">{systemStats.activeRelationships}</h3>
                          <p className="mb-0">Active Relationships</p>
                          <small className="text-muted">of {systemStats.totalRelationships} total</small>
                        </Card.Body>
                      </Card>
                    </Col>
                    <Col md={3}>
                      <Card className="admin-stats-card text-center">
                        <Card.Body>
                          <h3 className="text-warning">{systemStats.pendingInvitations}</h3>
                          <p className="mb-0">Pending Invitations</p>
                          <small className="text-muted">awaiting response</small>
                        </Card.Body>
                      </Card>
                    </Col>
                    <Col md={3}>
                      <Card className="admin-stats-card text-center">
                        <Card.Body>
                          <h3 className="text-info">{systemStats.totalInsights}</h3>
                          <p className="mb-0">Coaching Insights</p>
                          <small className="text-muted">{systemStats.coachPrograms} programs assigned</small>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                )}

                {/* System Alerts Preview */}
                {systemAlerts.length > 0 && (
                  <Card className="mb-4">
                    <Card.Header className="d-flex justify-content-between align-items-center">
                      <h5 className="mb-0">System Alerts</h5>
                      <Button variant="outline-primary" size="sm" onClick={() => setActiveTab('alerts')}>
                        View All ({systemAlerts.length})
                      </Button>
                    </Card.Header>
                    <Card.Body>
                      {systemAlerts.slice(0, 3).map((alert, index) => (
                        <Alert key={index} variant={alert.type} className="system-alert mb-2">
                          <div className="alert-header">
                            <div>
                              <div className="alert-title">{alert.title}</div>
                              <div>{alert.message}</div>
                            </div>
                            <Badge bg={
                              alert.severity === 'high' ? 'danger' :
                              alert.severity === 'medium' ? 'warning' : 'info'
                            } className="severity-badge">
                              {alert.severity}
                            </Badge>
                          </div>
                        </Alert>
                      ))}
                    </Card.Body>
                  </Card>
                )}

                {/* Quick Actions */}
                <Row>
                  <Col md={6}>
                    <Card className="h-100">
                      <Card.Body>
                        <Card.Title>Quick Actions</Card.Title>
                        <div className="quick-actions-grid">
                          <Button variant="primary" onClick={() => navigate('/create-program')}>
                            Create Template Program
                          </Button>
                          <Button variant="outline-primary" onClick={() => setActiveTab('promote')}>
                            Promote User to Coach
                          </Button>
                          <Button variant="outline-secondary" onClick={() => setActiveTab('coaches')}>
                            Manage Coaches
                          </Button>
                          <Button variant="outline-warning" onClick={handleCleanupInvitations} disabled={loading}>
                            Cleanup Expired Invitations
                          </Button>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={6}>
                    <Card className="h-100">
                      <Card.Body>
                        <Card.Title>Recent Activity</Card.Title>
                        {coachActivityData.slice(0, 5).map((coach, index) => (
                          <div key={index} className="recent-activity-item">
                            <div className="recent-activity-info">
                              <strong>{coach.name || coach.email}</strong>
                              <small>
                                {coach.statistics.activeClients} clients, 
                                Activity Score: {coach.statistics.activityScore}
                              </small>
                            </div>
                            <Badge bg={getActivityScoreColor(coach.statistics.activityScore)} className="activity-score-badge">
                              {coach.statistics.activityScore}
                            </Badge>
                          </div>
                        ))}
                        {coachActivityData.length > 5 && (
                          <Button variant="link" size="sm" onClick={() => setActiveTab('activity')}>
                            View All Activity
                          </Button>
                        )}
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

            {/* Coach Activity Tab */}
            {activeTab === 'activity' && (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h4>Coach Activity Monitoring</h4>
                  <Button variant="outline-primary" onClick={loadSystemData} disabled={loading}>
                    {loading ? <Spinner animation="border" size="sm" /> : 'Refresh Data'}
                  </Button>
                </div>
                
                {loading ? (
                  <div className="text-center">
                    <Spinner animation="border" />
                  </div>
                ) : (
                  <Table responsive striped className="coach-activity-table">
                    <thead>
                      <tr>
                        <th>Coach</th>
                        <th>Status</th>
                        <th>Clients</th>
                        <th>Recent Activity</th>
                        <th>Activity Score</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coachActivityData.map(coach => (
                        <tr key={coach.id}>
                          <td className="coach-name-cell">
                            <div>
                              <strong>{coach.name || 'N/A'}</strong><br />
                              <small className="text-muted">{coach.email}</small>
                            </div>
                          </td>
                          <td>
                            <Badge bg={coach.coach_profiles?.[0]?.is_active ? 'success' : 'danger'} className="coach-status-badge">
                              {coach.coach_profiles?.[0]?.is_active ? 'Active' : 'Suspended'}
                            </Badge>
                          </td>
                          <td>
                            <div className="activity-metrics">
                              <strong>{coach.statistics.activeClients}</strong> active<br />
                              <small className="text-muted">{coach.statistics.totalClients} total</small>
                            </div>
                          </td>
                          <td>
                            <div className="activity-metrics">
                              {coach.statistics.recentInsights} insights<br />
                              {coach.statistics.recentPrograms} programs<br />
                              <span className="text-muted">last 30 days</span>
                            </div>
                          </td>
                          <td>
                            <div className="activity-score-container">
                              <Badge bg={getActivityScoreColor(coach.statistics.activityScore)} className="activity-score-badge">
                                {coach.statistics.activityScore}
                              </Badge>
                              <ProgressBar 
                                now={Math.min(100, coach.statistics.activityScore * 5)} 
                                className="activity-score-progress"
                                variant={getActivityScoreColor(coach.statistics.activityScore)}
                              />
                            </div>
                          </td>
                          <td>
                            <small>
                              {coach.last_login_at 
                                ? formatRelativeTime(coach.last_login_at)
                                : 'Never'
                              }
                            </small>
                          </td>
                          <td>
                            <Button 
                              variant={coach.coach_profiles?.[0]?.is_active ? 'outline-warning' : 'outline-success'}
                              size="sm"
                              onClick={() => handleSuspendCoach(coach)}
                              disabled={loading}
                            >
                              {coach.coach_profiles?.[0]?.is_active ? 'Suspend' : 'Reactivate'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {coachActivityData.length === 0 && (
                        <tr>
                          <td colSpan="7" className="text-center empty-state">No coach activity data found</td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                )}
              </div>
            )}

            {/* Relationships Oversight Tab */}
            {activeTab === 'relationships' && (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h4>Coach-Client Relationship Oversight</h4>
                  <Button variant="outline-primary" onClick={loadSystemData} disabled={loading}>
                    {loading ? <Spinner animation="border" size="sm" /> : 'Refresh Data'}
                  </Button>
                </div>
                
                {loading ? (
                  <div className="text-center">
                    <Spinner animation="border" />
                  </div>
                ) : (
                  <Table responsive striped className="relationship-table">
                    <thead>
                      <tr>
                        <th>Coach</th>
                        <th>Client</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Engagement</th>
                        <th>Health Score</th>
                        <th>Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relationshipData.map(relationship => (
                        <tr key={relationship.id}>
                          <td className="coach-name-cell">
                            <div>
                              <strong>{relationship.coach?.name || 'N/A'}</strong><br />
                              <small className="text-muted">{relationship.coach?.email}</small>
                            </div>
                          </td>
                          <td className="coach-name-cell">
                            <div>
                              <strong>{relationship.client?.name || 'N/A'}</strong><br />
                              <small className="text-muted">{relationship.client?.email}</small>
                            </div>
                          </td>
                          <td>
                            <Badge bg={
                              relationship.status === 'active' ? 'success' :
                              relationship.status === 'pending' ? 'warning' :
                              relationship.status === 'terminated' ? 'danger' : 'secondary'
                            } className="coach-status-badge">
                              {relationship.status}
                            </Badge>
                          </td>
                          <td>
                            <small>{relationship.metrics.daysSinceStart} days</small>
                          </td>
                          <td>
                            <div className="activity-metrics">
                              {relationship.metrics.insightCount} insights<br />
                              {relationship.metrics.programCount} programs
                            </div>
                          </td>
                          <td>
                            <div className="health-score-container">
                              <Badge bg={getHealthScoreColor(relationship.metrics.healthScore)} className="health-score-badge">
                                {relationship.metrics.healthScore}%
                              </Badge>
                              <ProgressBar 
                                now={relationship.metrics.healthScore} 
                                className="health-score-progress"
                                variant={getHealthScoreColor(relationship.metrics.healthScore)}
                              />
                            </div>
                          </td>
                          <td>
                            <small>{formatDate(relationship.created_at)}</small>
                          </td>
                        </tr>
                      ))}
                      {relationshipData.length === 0 && (
                        <tr>
                          <td colSpan="7" className="text-center empty-state">No relationship data found</td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                )}
              </div>
            )}

            {/* System Alerts Tab */}
            {activeTab === 'alerts' && (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h4>System Alerts</h4>
                  <div>
                    <Button variant="outline-warning" onClick={handleCleanupInvitations} disabled={loading} className="me-2">
                      Cleanup Expired Invitations
                    </Button>
                    <Button variant="outline-primary" onClick={loadSystemData} disabled={loading}>
                      {loading ? <Spinner animation="border" size="sm" /> : 'Refresh Alerts'}
                    </Button>
                  </div>
                </div>
                
                {systemAlerts.length === 0 ? (
                  <div className="empty-state">
                    <Alert variant="success">
                      <h5>All Clear!</h5>
                      <p>No system alerts at this time. The coaching system is running smoothly.</p>
                    </Alert>
                  </div>
                ) : (
                  <div>
                    {systemAlerts.map((alert, index) => (
                      <Alert key={index} variant={alert.type} className="system-alert mb-3">
                        <div className="alert-header">
                          <div>
                            <div className="alert-title">{alert.title}</div>
                            <p className="mb-1">{alert.message}</p>
                            <div className="alert-meta">
                              Category: {alert.category} | Severity: {alert.severity}
                              {alert.actionRequired && <span className="text-danger"> | Action Required</span>}
                            </div>
                          </div>
                          <Badge bg={
                            alert.severity === 'high' ? 'danger' :
                            alert.severity === 'medium' ? 'warning' : 'info'
                          } className="severity-badge">
                            {alert.severity}
                          </Badge>
                        </div>
                      </Alert>
                    ))}
                  </div>
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

      {/* Coach Suspension Modal */}
      <Modal show={showSuspendModal} onHide={() => setShowSuspendModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            {selectedCoach?.coach_profiles?.[0]?.is_active ? 'Suspend Coach' : 'Reactivate Coach'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedCoach && (
            <div>
              <p><strong>Coach:</strong> {selectedCoach.name || selectedCoach.email}</p>
              <p><strong>Email:</strong> {selectedCoach.email}</p>
              <p><strong>Current Status:</strong> {' '}
                <Badge bg={selectedCoach.coach_profiles?.[0]?.is_active ? 'success' : 'danger'}>
                  {selectedCoach.coach_profiles?.[0]?.is_active ? 'Active' : 'Suspended'}
                </Badge>
              </p>
              
              {selectedCoach.coach_profiles?.[0]?.is_active && (
                <Alert variant="warning">
                  <strong>Warning:</strong> Suspending this coach will deactivate all their active client relationships.
                </Alert>
              )}
              
              <Form.Group className="mb-3">
                <Form.Label>
                  {selectedCoach.coach_profiles?.[0]?.is_active ? 'Suspension Reason' : 'Reactivation Reason'}
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder={`Enter reason for ${selectedCoach.coach_profiles?.[0]?.is_active ? 'suspension' : 'reactivation'}...`}
                  value={suspensionReason}
                  onChange={(e) => setSuspensionReason(e.target.value)}
                  required
                />
              </Form.Group>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowSuspendModal(false)}>
            Cancel
          </Button>
          <Button 
            variant={selectedCoach?.coach_profiles?.[0]?.is_active ? 'warning' : 'success'}
            onClick={confirmSuspension}
            disabled={loading || !suspensionReason.trim()}
          >
            {loading ? <Spinner animation="border" size="sm" /> : 
             selectedCoach?.coach_profiles?.[0]?.is_active ? 'Suspend Coach' : 'Reactivate Coach'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default Admin; 