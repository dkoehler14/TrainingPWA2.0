import React from 'react'
import { Container, Row, Col, Card, Button } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { useAuth, useRoles } from '../hooks/useAuth'
import { useIsCoach } from '../hooks/useRoleChecking'
import ProgramMonitoringDashboard from '../components/ProgramMonitoringDashboard'
import ErrorMessage from '../components/ErrorMessage'

/**
 * Coach Analytics Page
 * Full analytics dashboard for coaches to monitor program effectiveness,
 * client progress, and coaching insights
 * Requirements: 4.2, 4.3, 5.5
 */
function CoachAnalytics() {
  const { user, userProfile } = useAuth()
  const { isCoach: isCoachRole } = useRoles()
  const { hasRole: isCoachVerified, isChecking: isVerifyingRole } = useIsCoach()

  // Show loading state while verifying role
  if (isVerifyingRole) {
    return (
      <Container fluid className="soft-container home-container py-4">
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="soft-text mt-2">Verifying coach access...</p>
        </div>
      </Container>
    )
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
                  You need coach privileges to access analytics. 
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
    )
  }

  return (
    <Container fluid className="soft-container home-container py-4">
      {/* Header */}
      <Row className="align-items-center mb-4 home-header-row">
        <Col>
          <h1 className="soft-title dashboard-greeting">
            📊 Program Analytics
          </h1>
          <p className="soft-text">
            Comprehensive insights into your coaching effectiveness and client progress
          </p>
        </Col>
        <Col xs="auto">
          <Button 
            as={Link} 
            to="/coach/dashboard" 
            variant="outline-primary"
          >
            ← Back to Dashboard
          </Button>
        </Col>
      </Row>

      {/* Full Program Monitoring Dashboard */}
      <ProgramMonitoringDashboard showFullAnalytics={true} />
    </Container>
  )
}

export default CoachAnalytics