/**
 * Coach Dashboard Page
 * 
 * Main dashboard for coaches to manage their clients, view statistics,
 * and access coaching tools. Provides client overview, recent activity,
 * and quick action buttons for coaching tasks.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Spinner, Badge, Table, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth, useRoles } from '../hooks/useAuth';
import { useIsCoach } from '../hooks/useRoleChecking';
import { 
  getCoachClients, 
  getCoachInvitations, 
  getCoachProfile,
  getClientDetails
} from '../services/coachService';
import { useCoachAnalyticsDashboard } from '../hooks/useProgramMonitoring';
import { useRealtimeCoachDashboard } from '../hooks/useRealtimeCoaching';
import ProgramMonitoringDashboard from '../components/ProgramMonitoringDashboard';
import RealtimeActivityFeed from '../components/RealtimeActivityFeed';
import RealtimeStatusIndicator from '../components/RealtimeStatusIndicator';
import ErrorMessage from '../components/ErrorMessage';
import CoachProfileEditModal from '../components/CoachProfileEditModal';
import InviteClientModal from '../components/InviteClientModal';
import ClientDetailModal from '../components/ClientDetailModal';
import '../styles/Home.css';
import '../styles/CoachDashboard.css';
import '../styles/RealtimeComponents.css';

function CoachDashboard() {
  const { user, userProfile } = useAuth();
  const { isCoach: isCoachRole } = useRoles();
  const { hasRole: isCoachVerified, isChecking: isVerifyingRole } = useIsCoach();
  
  // Program monitoring hook
  const {
    getSummaryStats,
    getTopPerformingPrograms,
    getClientsNeedingAttention,
    getCoachingInsights,
    loading: monitoringLoading
  } = useCoachAnalyticsDashboard('90d');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    clients: [],
    invitations: [],
    coachProfile: null,
    stats: {
      activeClients: 0,
      pendingInvitations: 0,
      totalInsights: 0,
      thisWeekActivity: 0
    }
  });

  // Load dashboard data function (extracted for reuse)
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load coach profile
      const coachProfile = await getCoachProfile(user.id);

      // Load clients
      const clients = await getCoachClients(user.id);

      // Load pending invitations
      const invitations = await getCoachInvitations(user.id, 'pending');

      // Calculate stats
      const stats = {
        activeClients: clients.length,
        pendingInvitations: invitations.length,
        totalInsights: 0, // Will be implemented when insights are added
        thisWeekActivity: calculateWeeklyActivity(clients)
      };

      setDashboardData({
        clients,
        invitations,
        coachProfile,
        stats
      });

    } catch (err) {
      console.error('Failed to load coach dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Memoize client IDs to prevent unnecessary re-renders
  const clientIds = useMemo(() =>
    dashboardData.clients.map(c => c.client_id),
    [dashboardData.clients]
  );

  // Memoize callback functions to prevent unnecessary re-renders
  const handleInvitationAccepted = useCallback((invitation) => {
    console.log('✅ Real-time: Invitation accepted', invitation);
    // Refresh dashboard data to show new client
    loadDashboardData();
  }, [loadDashboardData]);

  const handleInvitationDeclined = useCallback((invitation) => {
    console.log('❌ Real-time: Invitation declined', invitation);
  }, []);

  const handleWorkoutCompleted = useCallback((workout) => {
    console.log('🏋️ Real-time: Client completed workout', workout);
    // Update activity stats
    setDashboardData(prev => ({
      ...prev,
      stats: {
        ...prev.stats,
        thisWeekActivity: prev.stats.thisWeekActivity + 1
      }
    }));
  }, []);

  const handleClientActivity = useCallback((activity) => {
    console.log('👥 Real-time: Client activity', activity);
  }, []);

  // Real-time coaching updates
  const {
    isConnected: realtimeConnected,
    connectionStatus: realtimeStatus,
    error: realtimeError,
    invitations: realtimeInvitations,
    clientActivity: realtimeActivity,
    relationships: realtimeRelationships
  } = useRealtimeCoachDashboard(
    clientIds,
    {
      onInvitationAccepted: handleInvitationAccepted,
      onInvitationDeclined: handleInvitationDeclined,
      onWorkoutCompleted: handleWorkoutCompleted,
      onClientActivity: handleClientActivity
    }
  );



  // Load dashboard data
  useEffect(() => {
    if (!user || isVerifyingRole) return;

    // Only load data if user is verified as coach
    if (!isCoachRole && !isCoachVerified) {
      setLoading(false);
      return;
    }

    loadDashboardData();
  }, [user, isCoachRole, isCoachVerified, isVerifyingRole, loadDashboardData]);

  // Handle client detail view
  const handleViewClient = async (relationship) => {
    try {
      setActionLoading(`view-${relationship.id}`);
      const clientDetails = await getClientDetails(user.id, relationship.client_id);
      setSelectedClient({ ...clientDetails, relationship });
      setShowClientModal(true);
    } catch (err) {
      console.error('Failed to load client details:', err);
      setError('Failed to load client details. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Calculate weekly activity from clients
  const calculateWeeklyActivity = (clients) => {
    // This is a placeholder calculation
    // In a real implementation, this would analyze client workout logs from the past week
    return clients.length * 2; // Assume 2 activities per client per week on average
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Show loading state
  if (loading || isVerifyingRole) {
    return (
      <Container fluid className="soft-container home-container py-4">
        <div className="text-center py-5">
          <Spinner animation="border" className="spinner-blue" />
          <p className="soft-text mt-2">Loading your coaching dashboard...</p>
        </div>
      </Container>
    );
  }

  // Show error if not a coach
  if (!isCoachRole && !isCoachVerified) {
    return (
      <Container fluid className="soft-container home-container py-4">
        <Row className="justify-content-center">
          <Col md={8}>
            <Card className="soft-card text-center">
              <Card.Body>
                <h3 className="soft-title">Access Denied</h3>
                <p className="soft-text">
                  You need coach privileges to access this dashboard. 
                  Please contact an administrator if you believe this is an error.
                </p>
                <Button as={Link} to="/" variant="primary">
                  Return to Home
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
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

  return (
    <Container fluid className="soft-container home-container py-4">
      {/* Header */}
      <Row className="align-items-center mb-4 home-header-row">
        <Col>
          <h1 className="soft-title dashboard-greeting">
            🎯 Coach Dashboard
          </h1>
          <div className="d-flex align-items-center">
            <p className="soft-text mb-0 me-3">
              Welcome back, Coach {userProfile?.name || user?.email}!
            </p>
            <RealtimeStatusIndicator
              isConnected={realtimeConnected}
              error={realtimeError}
              connectionStatus={realtimeStatus}
              compact={true}
              showDetails={true}
            />
          </div>
        </Col>
        <Col xs="auto">
          <Button
            onClick={() => setShowInviteModal(true)}
            className="soft-button gradient cta-button"
          >
            📧 Invite Client
          </Button>
        </Col>
      </Row>

      {/* Real-time Status Alert */}
      {realtimeError && (
        <Row className="mb-3">
          <Col>
            <Alert variant="warning" dismissible>
              <Alert.Heading>Real-time Updates Unavailable</Alert.Heading>
              <p className="mb-0">
                Live updates are currently unavailable. You may need to refresh manually to see the latest changes.
              </p>
            </Alert>
          </Col>
        </Row>
      )}

      {/* Key Metrics */}
      <Row className="g-4 mb-4">
        <Col md={3}>
          <Card className="soft-card metric-card h-100">
            <Card.Body>
              <Card.Title className="metric-title">Active Clients</Card.Title>
              <Card.Text className="metric-value">{dashboardData.stats.activeClients}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="soft-card metric-card h-100">
            <Card.Body>
              <Card.Title className="metric-title">Pending Invitations</Card.Title>
              <Card.Text className="metric-value">{dashboardData.stats.pendingInvitations}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="soft-card metric-card h-100">
            <Card.Body>
              <Card.Title className="metric-title">This Week's Activity</Card.Title>
              <Card.Text className="metric-value">{dashboardData.stats.thisWeekActivity}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="soft-card metric-card h-100">
            <Card.Body>
              <Card.Title className="metric-title">Total Insights</Card.Title>
              <Card.Text className="metric-value">{dashboardData.stats.totalInsights}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Main Dashboard */}
      <Row className="g-4">
        {/* Left Column - Client Overview */}
        <Col lg={8}>
          <Card className="soft-card widget-card mb-4">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <Card.Title className="widget-title">Active Clients</Card.Title>
                <Button 
                  variant="outline-primary" 
                  size="sm"
                  as={Link}
                  to="/coach/clients"
                >
                  Manage All
                </Button>
              </div>
              
              {dashboardData.clients.length > 0 ? (
                <Table responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Experience</th>
                      <th>Joined</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.clients.slice(0, 5).map(relationship => (
                      <tr key={relationship.id}>
                        <td>
                          <div>
                            <strong>{relationship.client?.name || 'N/A'}</strong>
                            <br />
                            <small className="soft-text">{relationship.client?.email}</small>
                          </div>
                        </td>
                        <td>
                          <Badge bg="info">
                            {relationship.client?.experience_level || 'Not specified'}
                          </Badge>
                        </td>
                        <td>{formatDate(relationship.accepted_at || relationship.created_at)}</td>
                        <td>
                          <Badge bg="success">Active</Badge>
                        </td>
                        <td>
                          <Button 
                            variant="outline-primary" 
                            size="sm"
                            onClick={() => handleViewClient(relationship)}
                            disabled={actionLoading === `view-${relationship.id}`}
                          >
                            {actionLoading === `view-${relationship.id}` ? <Spinner as="span" animation="border" size="sm" /> : 'View'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="text-center py-4">
                  <p className="soft-text">No active clients yet.</p>
                  <Button
                    onClick={() => setShowInviteModal(true)}
                    variant="primary"
                  >
                    Send Your First Invitation
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Recent Activity */}
          <RealtimeActivityFeed
            activities={realtimeActivity}
            isConnected={realtimeConnected}
            error={realtimeError}
            maxItems={5}
            showHeader={true}
            compact={false}
          />
        </Col>

        {/* Right Column - Quick Actions & Pending Items */}
        <Col lg={4}>
          {/* Quick Actions */}
          <Card className="soft-card widget-card mb-4">
            <Card.Body>
              <Card.Title className="widget-title">Quick Actions</Card.Title>
              <div className="d-grid gap-2">
                <Button
                  onClick={() => setShowInviteModal(true)}
                  variant="outline-primary"
                >
                  📧 Invite New Client
                </Button>
                <Button 
                  as={Link} 
                  to="/create-program" 
                  variant="outline-primary"
                >
                  📋 Create Program
                </Button>
                <Button 
                  variant="outline-primary"
                  disabled // Will be enabled when insights are implemented
                >
                  💡 Create Insight
                </Button>
                <Button 
                  variant="outline-primary"
                  as={Link}
                  to="/coach/clients"
                >
                  👥 Manage Clients
                </Button>
              </div>
            </Card.Body>
          </Card>

          {/* Pending Invitations */}
          {dashboardData.invitations.length > 0 && (
            <Card className="soft-card widget-card mb-4">
              <Card.Body>
                <Card.Title className="widget-title">Pending Invitations</Card.Title>
                {dashboardData.invitations.slice(0, 3).map(invitation => (
                  <div key={invitation.id} className="recent-activity-item">
                    <div>
                      <strong>{invitation.target_email || 'Username invitation'}</strong>
                      <br />
                      <small className="soft-text">
                        Sent {formatDate(invitation.created_at)}
                      </small>
                    </div>
                    <Badge bg="warning">Pending</Badge>
                  </div>
                ))}
                {dashboardData.invitations.length > 3 && (
                  <div className="text-center mt-2">
                    <Button 
                      variant="outline-secondary" 
                      size="sm"
                      disabled // Will be enabled when invitation management is implemented
                    >
                      View All ({dashboardData.invitations.length})
                    </Button>
                  </div>
                )}
              </Card.Body>
            </Card>
          )}

          {/* Coach Profile Summary */}
          {dashboardData.coachProfile && (
            <Card className="soft-card widget-card">
              <Card.Body>
                <Card.Title className="widget-title">Your Profile</Card.Title>
                <div className="mb-3">
                  {dashboardData.coachProfile.specializations?.length > 0 && (
                    <div className="mb-2">
                      <strong>Specializations:</strong>
                      <br />
                      {dashboardData.coachProfile.specializations.map((spec, index) => (
                        <Badge key={index} bg="secondary" className="me-1 mb-1">
                          {spec}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {dashboardData.coachProfile.bio && (
                    <div>
                      <strong>Bio:</strong>
                      <p className="soft-text mt-1">
                        {dashboardData.coachProfile.bio.length > 100 
                          ? `${dashboardData.coachProfile.bio.substring(0, 100)}...`
                          : dashboardData.coachProfile.bio
                        }
                      </p>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => setShowEditModal(true)}
                >
                  Edit Profile
                </Button>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>

      {/* Program Monitoring Section */}
      <Row className="g-4 mt-4">
        <Col>
          <Card className="soft-card widget-card">
            <Card.Header>
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">📊 Program Monitoring</h5>
                <Button 
                  as={Link} 
                  to="/coach/analytics" 
                  variant="outline-primary" 
                  size="sm"
                >
                  View Full Analytics
                </Button>
              </div>
            </Card.Header>
            <Card.Body>
              {monitoringLoading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" size="sm" />
                  <p className="mt-2 mb-0">Loading program analytics...</p>
                </div>
              ) : (
                <>
                  {/* Summary Stats */}
                  {getSummaryStats() && (
                    <Row className="g-3 mb-4">
                      <Col md={2}>
                        <div className="text-center">
                          <h4 className="text-primary mb-0">
                            {getSummaryStats().overallCompletionRate}%
                          </h4>
                          <small className="text-muted">Avg Completion</small>
                        </div>
                      </Col>
                      <Col md={2}>
                        <div className="text-center">
                          <h4 className="text-success mb-0">
                            {getSummaryStats().activePrograms}
                          </h4>
                          <small className="text-muted">Active Programs</small>
                        </div>
                      </Col>
                      <Col md={2}>
                        <div className="text-center">
                          <h4 className="text-info mb-0">
                            {getSummaryStats().clientRetentionRate}%
                          </h4>
                          <small className="text-muted">Client Retention</small>
                        </div>
                      </Col>
                      <Col md={3}>
                        <div className="text-center">
                          <h4 className="text-warning mb-0">
                            {getClientsNeedingAttention().length}
                          </h4>
                          <small className="text-muted">Clients Need Attention</small>
                        </div>
                      </Col>
                      <Col md={3}>
                        <div className="text-center">
                          <h4 className="text-secondary mb-0">
                            {getSummaryStats().highPerformingPrograms}
                          </h4>
                          <small className="text-muted">High Performing</small>
                        </div>
                      </Col>
                    </Row>
                  )}

                  <Row>
                    {/* Top Performing Programs */}
                    <Col md={6}>
                      <h6 className="mb-3">🏆 Top Performing Programs</h6>
                      {getTopPerformingPrograms(3).length > 0 ? (
                        <div className="list-group list-group-flush">
                          {getTopPerformingPrograms(3).map((program, index) => (
                            <div key={program.id} className="list-group-item border-0 px-0">
                              <div className="d-flex justify-content-between align-items-center">
                                <div>
                                  <strong>{program.name}</strong>
                                  <br />
                                  <small className="text-muted">
                                    {program.clientName} • {program.completionRate}% complete
                                  </small>
                                </div>
                                <Badge bg={program.isActive ? 'success' : 'secondary'}>
                                  {program.effectivenessScore}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted">No program data available yet.</p>
                      )}
                    </Col>

                    {/* Clients Needing Attention */}
                    <Col md={6}>
                      <h6 className="mb-3">⚠️ Clients Needing Attention</h6>
                      {getClientsNeedingAttention().length > 0 ? (
                        <div className="list-group list-group-flush">
                          {getClientsNeedingAttention().slice(0, 3).map((client, index) => (
                            <div key={index} className="list-group-item border-0 px-0">
                              <div className="d-flex justify-content-between align-items-center">
                                <div>
                                  <strong>{client.name}</strong>
                                  <br />
                                  <small className="text-muted">
                                    {client.averageCompletionRate}% avg completion • 
                                    Last active: {client.lastActivity ? 
                                      Math.floor((Date.now() - client.lastActivity) / (1000 * 60 * 60 * 24)) + 'd ago' : 
                                      'Never'
                                    }
                                  </small>
                                </div>
                                <Badge bg="warning">
                                  {client.engagementScore}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted">All clients are performing well! 🎉</p>
                      )}
                    </Col>
                  </Row>

                  {/* Coaching Insights */}
                  {getCoachingInsights().length > 0 && (
                    <div className="mt-4">
                      <h6 className="mb-3">💡 Coaching Insights</h6>
                      {getCoachingInsights().slice(0, 2).map((insight, index) => (
                        <div 
                          key={index} 
                          className={`alert alert-${
                            insight.type === 'success' ? 'success' :
                            insight.type === 'improvement' ? 'warning' :
                            insight.type === 'attention' ? 'danger' : 'info'
                          } mb-2`}
                        >
                          <strong>{insight.title}</strong>
                          <br />
                          <small>{insight.message}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Coach Profile Edit Modal */}
        <CoachProfileEditModal
          show={showEditModal}
          onHide={() => setShowEditModal(false)}
          userId={user?.id}
          onProfileUpdated={loadDashboardData}
        />
  
        {/* Invite Client Modal */}
        <InviteClientModal
          show={showInviteModal}
          onHide={() => setShowInviteModal(false)}
          onInvitationSent={loadDashboardData}
        />

        {/* Client Detail Modal */}
        <ClientDetailModal
          show={showClientModal}
          onHide={() => setShowClientModal(false)}
          client={selectedClient}
        />
    </Container>
  );
}

export default CoachDashboard;