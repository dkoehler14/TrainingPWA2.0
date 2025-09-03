/**
 * MyCoach Page Component
 * 
 * Client-side interface for viewing coach information, assigned programs,
 * coaching insights, and managing data sharing preferences.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 9.1
 */

import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Row, 
  Col, 
  Card, 
  Button, 
  Badge, 
  Spinner, 
  Alert,
  Modal,
  Form,
  Tabs,
  Tab,
  Table,
  OverlayTrigger,
  Tooltip,
  Accordion
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useClientCoach } from '../hooks/useClientCoach';
import { useRealtimeInsights } from '../hooks/useRealtimeInsights';
import ErrorMessage from '../components/ErrorMessage';
import '../styles/Home.css';
import '../styles/MyCoach.css';

function MyCoach() {
  const { user, userProfile } = useAuth();
  const {
    loading,
    error,
    hasActiveCoach,
    coachRelationship,
    coachProfile,
    assignedPrograms,
    coachInsights,
    unreadInsightsCount,
    markInsightAsViewed,
    addInsightResponse,
    terminateCoachingRelationship,
    refreshCoachData
  } = useClientCoach();

  // Real-time insights with enhanced notifications
  const {
    insights: realtimeInsights,
    unreadCount: realtimeUnreadCount,
    isConnected: insightsConnected,
    markAsViewed: realtimeMarkAsViewed,
    addResponse: realtimeAddResponse
  } = useRealtimeInsights({
    enableNotifications: true,
    onNewInsight: (insight) => {
      console.log('New insight received:', insight);
      // Refresh coach data to sync with existing hook
      refreshCoachData();
    }
  });

  // Use real-time data if available, otherwise fall back to useClientCoach data
  const displayInsights = realtimeInsights.length > 0 ? realtimeInsights : coachInsights;
  const displayUnreadCount = realtimeUnreadCount > 0 ? realtimeUnreadCount : unreadInsightsCount;

  // UI state
  const [activeTab, setActiveTab] = useState('overview');
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [showInsightModal, setShowInsightModal] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState(null);
  const [insightResponse, setInsightResponse] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  // Auto-switch to insights tab if there are unread insights
  useEffect(() => {
    if (displayUnreadCount > 0 && activeTab === 'overview') {
      // Don't auto-switch immediately, let user see the overview first
      const timer = setTimeout(() => {
        if (displayUnreadCount > 0) {
          setActiveTab('insights');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [displayUnreadCount, activeTab]);

  // Handle insight viewing
  const handleViewInsight = async (insight) => {
    setSelectedInsight(insight);
    setInsightResponse(insight.client_response || '');
    setShowInsightModal(true);

    // Mark as viewed if not already viewed
    if (!insight.client_viewed) {
      try {
        // Use real-time hook if available, otherwise fall back to useClientCoach
        if (realtimeMarkAsViewed) {
          await realtimeMarkAsViewed(insight.id);
        } else {
          await markInsightAsViewed(insight.id);
        }
      } catch (err) {
        console.error('Failed to mark insight as viewed:', err);
      }
    }
  };

  // Handle insight response
  const handleInsightResponse = async () => {
    if (!selectedInsight || !insightResponse.trim()) return;

    try {
      setActionLoading('insight-response');
      
      // Use real-time hook if available, otherwise fall back to useClientCoach
      let success;
      if (realtimeAddResponse) {
        success = await realtimeAddResponse(selectedInsight.id, insightResponse.trim());
      } else {
        success = await addInsightResponse(selectedInsight.id, insightResponse.trim());
      }
      
      if (success) {
        setSuccessMessage('Your response has been sent to your coach!');
        setShowInsightModal(false);
        setSelectedInsight(null);
        setInsightResponse('');
      }
    } catch (err) {
      console.error('Failed to send insight response:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle relationship termination
  const handleTerminateRelationship = async () => {
    try {
      setActionLoading('terminate');
      const success = await terminateCoachingRelationship();
      
      if (success) {
        setSuccessMessage('Coaching relationship has been terminated.');
        setShowTerminateModal(false);
      }
    } catch (err) {
      console.error('Failed to terminate relationship:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Format date with time
  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  // Get insight type badge variant
  const getInsightBadgeVariant = (type) => {
    switch (type) {
      case 'recommendation': return 'primary';
      case 'observation': return 'info';
      case 'goal_update': return 'success';
      case 'program_adjustment': return 'warning';
      default: return 'secondary';
    }
  };

  // Get insight priority color
  const getInsightPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'danger';
      case 'medium': return 'warning';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  // Show loading state
  if (loading) {
    return (
      <Container fluid className="soft-container home-container py-4">
        <div className="text-center py-5">
          <Spinner animation="border" className="spinner-blue" />
          <p className="soft-text mt-2">Loading your coach information...</p>
        </div>
      </Container>
    );
  }

  // Show error state
  if (error) {
    return (
      <Container fluid className="soft-container home-container py-4">
        <ErrorMessage message={error} />
      </Container>
    );
  }

  // Show no coach state
  if (!hasActiveCoach) {
    return (
      <Container fluid className="soft-container home-container py-4">
        <Row className="justify-content-center">
          <Col md={8}>
            <Card className="soft-card text-center">
              <Card.Body className="py-5">
                <div className="mb-4" style={{ fontSize: '4rem', opacity: 0.5 }}>
                  🏋️‍♂️
                </div>
                <h3 className="soft-title mb-3">No Active Coach</h3>
                <p className="soft-text mb-4">
                  You don't currently have an active coaching relationship. 
                  When a coach invites you, you'll be able to view their profile, 
                  assigned programs, and coaching insights here.
                </p>
                <div className="d-flex gap-3 justify-content-center">
                  <Button as={Link} to="/programs" variant="primary">
                    Browse Programs
                  </Button>
                  <Button as={Link} to="/progress-coach" variant="outline-primary">
                    AI Coach
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container fluid className="soft-container home-container py-4">
      {/* Header */}
      <Row className="align-items-center mb-4 home-header-row">
        <Col>
          <h1 className="soft-title">
            🏋️‍♂️ My Coach
            {displayUnreadCount > 0 && (
              <Badge bg="danger" className="ms-2">
                {displayUnreadCount} new
              </Badge>
            )}
            {insightsConnected && (
              <Badge bg="success" className="ms-2">
                Live
              </Badge>
            )}
          </h1>
          <p className="soft-text">
            Your personalized coaching experience with {coachRelationship?.coach?.name}
          </p>
        </Col>
      </Row>

      {/* Success Message */}
      {successMessage && (
        <Alert variant="success" dismissible onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      {/* Main Content Tabs */}
      <Tabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k)}
        className="mb-4"
      >
        {/* Overview Tab */}
        <Tab eventKey="overview" title="Overview">
          <Row className="g-4">
            {/* Coach Profile Card */}
            <Col lg={4}>
              <Card className="soft-card h-100">
                <Card.Body>
                  <div className="text-center mb-4">
                    <div className="mb-3" style={{ fontSize: '3rem' }}>
                      👨‍💼
                    </div>
                    <h4 className="soft-title">{coachRelationship?.coach?.name}</h4>
                    <p className="soft-text">{coachRelationship?.coach?.email}</p>
                  </div>

                  {coachProfile && (
                    <>
                      {coachProfile.specializations?.length > 0 && (
                        <div className="mb-3">
                          <h6 className="soft-title mb-2">Specializations</h6>
                          <div className="d-flex flex-wrap gap-1">
                            {coachProfile.specializations.map((spec, index) => (
                              <Badge key={index} bg="primary" className="mb-1">
                                {spec}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {coachProfile.certifications?.length > 0 && (
                        <div className="mb-3">
                          <h6 className="soft-title mb-2">Certifications</h6>
                          <div className="d-flex flex-wrap gap-1">
                            {coachProfile.certifications.map((cert, index) => (
                              <Badge key={index} bg="success" className="mb-1">
                                {cert}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {coachProfile.bio && (
                        <div className="mb-3">
                          <h6 className="soft-title mb-2">About</h6>
                          <p className="soft-text">{coachProfile.bio}</p>
                        </div>
                      )}

                      {(coachProfile.phone || coachProfile.website) && (
                        <div className="mb-3">
                          <h6 className="soft-title mb-2">Contact</h6>
                          {coachProfile.phone && (
                            <p className="soft-text mb-1">
                              📞 {coachProfile.phone}
                            </p>
                          )}
                          {coachProfile.website && (
                            <p className="soft-text mb-1">
                              🌐 <a href={coachProfile.website} target="_blank" rel="noopener noreferrer">
                                {coachProfile.website}
                              </a>
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <div className="mt-4 pt-3 border-top">
                    <small className="soft-text">
                      Coaching since {formatDate(coachRelationship?.accepted_at || coachRelationship?.created_at)}
                    </small>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            {/* Quick Stats and Actions */}
            <Col lg={8}>
              {/* Stats Row */}
              <Row className="g-3 mb-4">
                <Col md={4}>
                  <Card className="soft-card text-center">
                    <Card.Body className="py-3">
                      <h3 className="text-primary mb-1">{assignedPrograms.length}</h3>
                      <small className="text-muted">Assigned Programs</small>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={4}>
                  <Card className="soft-card text-center">
                    <Card.Body className="py-3">
                      <h3 className="text-info mb-1">{displayInsights.length}</h3>
                      <small className="text-muted">Total Insights</small>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={4}>
                  <Card className="soft-card text-center">
                    <Card.Body className="py-3">
                      <h3 className="text-warning mb-1">{displayUnreadCount}</h3>
                      <small className="text-muted">Unread Insights</small>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Recent Insights */}
              <Card className="soft-card mb-4">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="soft-title mb-0">Recent Insights</h5>
                    {displayInsights.length > 0 && (
                      <Button 
                        variant="outline-primary" 
                        size="sm"
                        onClick={() => setActiveTab('insights')}
                      >
                        View All
                      </Button>
                    )}
                  </div>

                  {displayInsights.length > 0 ? (
                    <div>
                      {displayInsights.slice(0, 3).map(insight => (
                        <div key={insight.id} className="d-flex justify-content-between align-items-start mb-3 pb-3 border-bottom">
                          <div className="flex-grow-1">
                            <div className="d-flex align-items-center gap-2 mb-1">
                              <Badge bg={getInsightBadgeVariant(insight.type)}>
                                {insight.type.replace('_', ' ')}
                              </Badge>
                              <Badge bg={getInsightPriorityColor(insight.priority)} className="ms-1">
                                {insight.priority}
                              </Badge>
                              {!insight.client_viewed && (
                                <Badge bg="danger">New</Badge>
                              )}
                            </div>
                            <h6 className="mb-1">{insight.title}</h6>
                            <p className="soft-text mb-1">
                              {insight.content.length > 100 
                                ? `${insight.content.substring(0, 100)}...`
                                : insight.content
                              }
                            </p>
                            <small className="text-muted">
                              {formatDateTime(insight.created_at)}
                            </small>
                          </div>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => handleViewInsight(insight)}
                          >
                            View
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="soft-text">No insights yet from your coach.</p>
                    </div>
                  )}
                </Card.Body>
              </Card>

              {/* Quick Actions */}
              <Card className="soft-card">
                <Card.Body>
                  <h5 className="soft-title mb-3">Quick Actions</h5>
                  <div className="d-grid gap-2">
                    <Button 
                      variant="outline-primary"
                      onClick={() => setActiveTab('programs')}
                      disabled={assignedPrograms.length === 0}
                    >
                      📋 View Assigned Programs ({assignedPrograms.length})
                    </Button>
                    <Button 
                      variant="outline-info"
                      onClick={() => setActiveTab('insights')}
                      disabled={displayInsights.length === 0}
                    >
                      💡 View Coaching Insights ({displayInsights.length})
                    </Button>
                    <Button 
                      variant="outline-secondary"
                      onClick={() => setActiveTab('privacy')}
                    >
                      🔒 Data Sharing Settings
                    </Button>
                    <Button 
                      variant="outline-danger"
                      onClick={() => setShowTerminateModal(true)}
                    >
                      ❌ End Coaching Relationship
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>

        {/* Assigned Programs Tab */}
        <Tab eventKey="programs" title={`Programs (${assignedPrograms.length})`}>
          <Card className="soft-card">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h5 className="soft-title mb-0">Coach-Assigned Programs</h5>
                <Badge bg="info">{assignedPrograms.length} programs</Badge>
              </div>

              {assignedPrograms.length > 0 ? (
                <Row className="g-4">
                  {assignedPrograms.map(program => (
                    <Col md={6} lg={4} key={program.id}>
                      <Card className="h-100 border">
                        <Card.Body>
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <h6 className="mb-0">{program.name}</h6>
                            <Badge bg="success">Coach</Badge>
                          </div>
                          
                          {program.description && (
                            <p className="soft-text small mb-2">
                              {program.description.length > 100 
                                ? `${program.description.substring(0, 100)}...`
                                : program.description
                              }
                            </p>
                          )}

                          <div className="mb-3">
                            <small className="text-muted d-block">
                              📅 {program.duration} weeks • {program.days_per_week} days/week
                            </small>
                            {program.program_difficulty && (
                              <small className="text-muted d-block">
                                🎯 {program.program_difficulty}
                              </small>
                            )}
                            <small className="text-muted d-block">
                              Assigned {formatDate(program.assigned_at)}
                            </small>
                          </div>

                          {program.coach_notes && (
                            <div className="mb-3">
                              <small className="text-muted">Coach Notes:</small>
                              <p className="small mb-0 fst-italic">
                                "{program.coach_notes}"
                              </p>
                            </div>
                          )}

                          {program.client_goals?.length > 0 && (
                            <div className="mb-3">
                              <small className="text-muted d-block mb-1">Goals:</small>
                              <div className="d-flex flex-wrap gap-1">
                                {program.client_goals.map((goal, index) => (
                                  <Badge key={index} bg="outline-secondary" className="small">
                                    {goal}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="d-flex gap-2">
                            <Button 
                              as={Link} 
                              to={`/programs?programId=${program.id}`}
                              variant="primary" 
                              size="sm"
                              className="flex-grow-1"
                            >
                              View Program
                            </Button>
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  ))}
                </Row>
              ) : (
                <div className="text-center py-5">
                  <div className="mb-3" style={{ fontSize: '3rem', opacity: 0.5 }}>
                    📋
                  </div>
                  <h5 className="soft-title">No Assigned Programs</h5>
                  <p className="soft-text">
                    Your coach hasn't assigned any programs yet. 
                    They'll appear here when your coach creates personalized programs for you.
                  </p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>

        {/* Coaching Insights Tab */}
        <Tab eventKey="insights" title={
          <span>
            Insights ({displayInsights.length})
            {displayUnreadCount > 0 && (
              <Badge bg="danger" className="ms-1">{displayUnreadCount}</Badge>
            )}
            {insightsConnected && (
              <span className="ms-1 text-success" title="Real-time updates active">●</span>
            )}
          </span>
        }>
          <Card className="soft-card">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h5 className="soft-title mb-0">Coaching Insights</h5>
                <div className="d-flex gap-2">
                  <Badge bg="info">{displayInsights.length} total</Badge>
                  {displayUnreadCount > 0 && (
                    <Badge bg="danger">{displayUnreadCount} unread</Badge>
                  )}
                  {insightsConnected && (
                    <Badge bg="success">Live Updates</Badge>
                  )}
                </div>
              </div>

              {displayInsights.length > 0 ? (
                <Accordion>
                  {displayInsights.map((insight, index) => (
                    <Accordion.Item eventKey={insight.id} key={insight.id}>
                      <Accordion.Header>
                        <div className="d-flex justify-content-between align-items-center w-100 me-3">
                          <div className="d-flex align-items-center gap-2">
                            <Badge bg={getInsightBadgeVariant(insight.type)}>
                              {insight.type.replace('_', ' ')}
                            </Badge>
                            <Badge bg={getInsightPriorityColor(insight.priority)}>
                              {insight.priority}
                            </Badge>
                            {!insight.client_viewed && (
                              <Badge bg="danger">New</Badge>
                            )}
                            <span className="fw-semibold">{insight.title}</span>
                          </div>
                          <small className="text-muted">
                            {formatDate(insight.created_at)}
                          </small>
                        </div>
                      </Accordion.Header>
                      <Accordion.Body>
                        <div className="mb-3">
                          <p className="mb-3">{insight.content}</p>
                          
                          {insight.tags?.length > 0 && (
                            <div className="mb-3">
                              <small className="text-muted d-block mb-1">Tags:</small>
                              <div className="d-flex flex-wrap gap-1">
                                {insight.tags.map((tag, tagIndex) => (
                                  <Badge key={tagIndex} bg="secondary" className="small">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {insight.ai_generated && (
                            <div className="mb-3">
                              <Badge bg="info" className="me-2">AI Generated</Badge>
                              {insight.ai_confidence && (
                                <small className="text-muted">
                                  Confidence: {Math.round(insight.ai_confidence * 100)}%
                                </small>
                              )}
                            </div>
                          )}

                          <div className="d-flex justify-content-between align-items-center">
                            <small className="text-muted">
                              Created {formatDateTime(insight.created_at)}
                              {insight.client_viewed_at && (
                                <span> • Viewed {formatDateTime(insight.client_viewed_at)}</span>
                              )}
                            </small>
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => handleViewInsight(insight)}
                            >
                              {insight.client_response ? 'View Response' : 'Respond'}
                            </Button>
                          </div>
                        </div>
                      </Accordion.Body>
                    </Accordion.Item>
                  ))}
                </Accordion>
              ) : (
                <div className="text-center py-5">
                  <div className="mb-3" style={{ fontSize: '3rem', opacity: 0.5 }}>
                    💡
                  </div>
                  <h5 className="soft-title">No Insights Yet</h5>
                  <p className="soft-text">
                    Your coach will share personalized insights, recommendations, 
                    and feedback based on your workout progress. Check back regularly!
                  </p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>

        {/* Data Sharing & Privacy Tab */}
        <Tab eventKey="privacy" title="Privacy Settings">
          <Card className="soft-card">
            <Card.Body>
              <h5 className="soft-title mb-4">Data Sharing Controls</h5>
              
              <Alert variant="info" className="mb-4">
                <Alert.Heading>🔒 Your Privacy Matters</Alert.Heading>
                <p className="mb-0">
                  Control what data your coach can access. Changes take effect immediately 
                  and your coach will be notified of any restrictions.
                </p>
              </Alert>

              <div className="mb-4">
                <h6 className="mb-3">Current Permissions</h6>
                <p className="soft-text mb-3">
                  Your coach <strong>{coachRelationship?.coach?.name}</strong> currently has 
                  access to the following data:
                </p>
                
                <div className="d-grid gap-3">
                  <div className="d-flex justify-content-between align-items-center p-3 border rounded">
                    <div>
                      <h6 className="mb-1">Workout Logs</h6>
                      <small className="text-muted">
                        Exercise history, sets, reps, weights, and workout notes
                      </small>
                    </div>
                    <Badge bg="success">Enabled</Badge>
                  </div>
                  
                  <div className="d-flex justify-content-between align-items-center p-3 border rounded">
                    <div>
                      <h6 className="mb-1">Progress Analytics</h6>
                      <small className="text-muted">
                        Strength progression, volume trends, and performance metrics
                      </small>
                    </div>
                    <Badge bg="success">Enabled</Badge>
                  </div>
                  
                  <div className="d-flex justify-content-between align-items-center p-3 border rounded">
                    <div>
                      <h6 className="mb-1">Program Access</h6>
                      <small className="text-muted">
                        View and modify your workout programs
                      </small>
                    </div>
                    <Badge bg="success">Enabled</Badge>
                  </div>
                </div>
              </div>

              <Alert variant="warning">
                <Alert.Heading>⚠️ Coming Soon</Alert.Heading>
                <p className="mb-0">
                  Granular privacy controls are currently in development. 
                  For now, your coach has access to all necessary data to provide 
                  effective coaching. Contact support if you have privacy concerns.
                </p>
              </Alert>

              <div className="mt-4 pt-3 border-top">
                <h6 className="mb-2">Data Usage Information</h6>
                <ul className="soft-text small">
                  <li>Your coach can only see data while your coaching relationship is active</li>
                  <li>Historical data remains accessible to provide context for coaching decisions</li>
                  <li>Your coach cannot modify your personal information or account settings</li>
                  <li>All data access is logged and can be audited upon request</li>
                </ul>
              </div>
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>

      {/* Insight Detail Modal */}
      <Modal show={showInsightModal} onHide={() => setShowInsightModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {selectedInsight?.title}
            <div className="mt-1">
              <Badge bg={getInsightBadgeVariant(selectedInsight?.type)} className="me-2">
                {selectedInsight?.type?.replace('_', ' ')}
              </Badge>
              <Badge bg={getInsightPriorityColor(selectedInsight?.priority)}>
                {selectedInsight?.priority}
              </Badge>
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedInsight && (
            <>
              <div className="mb-4">
                <p>{selectedInsight.content}</p>
                
                {selectedInsight.tags?.length > 0 && (
                  <div className="mb-3">
                    <small className="text-muted d-block mb-1">Tags:</small>
                    <div className="d-flex flex-wrap gap-1">
                      {selectedInsight.tags.map((tag, index) => (
                        <Badge key={index} bg="secondary" className="small">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <small className="text-muted">
                  Created {formatDateTime(selectedInsight.created_at)} by {coachRelationship?.coach?.name}
                </small>
              </div>

              <div className="mb-3">
                <Form.Label>Your Response</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  value={insightResponse}
                  onChange={(e) => setInsightResponse(e.target.value)}
                  placeholder="Share your thoughts, questions, or feedback with your coach..."
                />
              </div>

              {selectedInsight.client_response && (
                <Alert variant="info">
                  <small className="text-muted d-block mb-1">Previous Response:</small>
                  <p className="mb-0">{selectedInsight.client_response}</p>
                </Alert>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowInsightModal(false)}>
            Close
          </Button>
          <Button 
            variant="primary" 
            onClick={handleInsightResponse}
            disabled={!insightResponse.trim() || actionLoading === 'insight-response'}
          >
            {actionLoading === 'insight-response' ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Sending...
              </>
            ) : (
              'Send Response'
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Terminate Relationship Modal */}
      <Modal show={showTerminateModal} onHide={() => setShowTerminateModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>End Coaching Relationship</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="warning">
            <Alert.Heading>⚠️ Are you sure?</Alert.Heading>
            <p>
              This will end your coaching relationship with <strong>{coachRelationship?.coach?.name}</strong>. 
              They will no longer be able to:
            </p>
            <ul>
              <li>View your workout data and progress</li>
              <li>Assign new programs to you</li>
              <li>Send coaching insights</li>
              <li>Access your analytics</li>
            </ul>
            <p className="mb-0">
              <strong>Note:</strong> Programs already assigned to you will remain available, 
              but your coach won't be able to modify them.
            </p>
          </Alert>
          <p className="soft-text">
            This action cannot be undone. You would need a new invitation to restore the relationship.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowTerminateModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="danger" 
            onClick={handleTerminateRelationship}
            disabled={actionLoading === 'terminate'}
          >
            {actionLoading === 'terminate' ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Ending...
              </>
            ) : (
              'End Relationship'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default MyCoach;