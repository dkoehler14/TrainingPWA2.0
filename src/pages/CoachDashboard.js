/**
 * Coach Dashboard Page
 * 
 * Main dashboard for coaches to manage their clients, view statistics,
 * and access coaching tools. Provides client overview, recent activity,
 * and quick action buttons for coaching tasks.
 */

import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Spinner, Badge, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth, useRoles } from '../hooks/useAuth';
import { useIsCoach } from '../hooks/useRoleChecking';
import { 
  getCoachClients, 
  getCoachInvitations, 
  getCoachProfile 
} from '../services/coachService';
import ErrorMessage from '../components/ErrorMessage';
import '../styles/Home.css';
import '../styles/CoachDashboard.css';

function CoachDashboard() {
  const { user, userProfile } = useAuth();
  const { isCoach: isCoachRole } = useRoles();
  const { hasRole: isCoachVerified, isChecking: isVerifyingRole } = useIsCoach();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  // Load dashboard data
  useEffect(() => {
    if (!user || isVerifyingRole) return;
    
    // Only load data if user is verified as coach
    if (!isCoachRole && !isCoachVerified) {
      setLoading(false);
      return;
    }

    const loadDashboardData = async () => {
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
    };

    loadDashboardData();
  }, [user, isCoachRole, isCoachVerified, isVerifyingRole]);

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
          <p className="soft-text">
            Welcome back, Coach {userProfile?.name || user?.email}!
          </p>
        </Col>
        <Col xs="auto">
          <Button 
            as={Link} 
            to="/coach/invite-client" 
            className="soft-button gradient cta-button"
            disabled // Will be enabled when invite modal is implemented
          >
            📧 Invite Client
          </Button>
        </Col>
      </Row>

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
                            disabled // Will be enabled when client details are implemented
                          >
                            View
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
                    variant="primary"
                    disabled // Will be enabled when invite modal is implemented
                  >
                    Send Your First Invitation
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Recent Activity */}
          <Card className="soft-card widget-card">
            <Card.Body>
              <Card.Title className="widget-title">Recent Activity</Card.Title>
              <div className="py-4 text-center">
                <p className="soft-text">Activity feed coming soon...</p>
                <small className="soft-text">
                  This will show client workout completions, program assignments, and insights.
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Right Column - Quick Actions & Pending Items */}
        <Col lg={4}>
          {/* Quick Actions */}
          <Card className="soft-card widget-card mb-4">
            <Card.Body>
              <Card.Title className="widget-title">Quick Actions</Card.Title>
              <div className="d-grid gap-2">
                <Button 
                  variant="outline-primary"
                  disabled // Will be enabled when invite modal is implemented
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
                  disabled // Will be enabled when profile editing is implemented
                >
                  Edit Profile
                </Button>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>
    </Container>
  );
}

export default CoachDashboard;