/**
 * Coach Dashboard Page
 * 
 * Main dashboard for coaches to manage their clients, view statistics,
 * and access coaching tools.
 */

import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { useAuth, useRoles } from '../hooks/useAuth';

function CoachDashboard() {
  const { user, userProfile } = useAuth();
  const { isCoach } = useRoles();

  // This is a placeholder implementation
  // The full dashboard will be implemented in later tasks
  
  return (
    <Container fluid className="soft-container home-container">
      <Row className="justify-content-center">
        <Col md={10}>
          <Card className="soft-card shadow border-0 p-4 mt-5">
            <h1 className="soft-title text-center mb-4">Coach Dashboard</h1>
            <p className="soft-text text-center">
              Welcome, Coach {userProfile?.name || user?.email}!
            </p>
            
            <Row className="mt-4">
              <Col md={4}>
                <Card className="h-100">
                  <Card.Body className="text-center">
                    <Card.Title>Client Management</Card.Title>
                    <Card.Text>
                      Manage your coaching relationships and client roster.
                    </Card.Text>
                    <Button variant="primary" disabled>
                      Coming Soon
                    </Button>
                  </Card.Body>
                </Card>
              </Col>
              
              <Col md={4}>
                <Card className="h-100">
                  <Card.Body className="text-center">
                    <Card.Title>Invite Clients</Card.Title>
                    <Card.Text>
                      Send invitations to new clients to start coaching relationships.
                    </Card.Text>
                    <Button variant="primary" disabled>
                      Coming Soon
                    </Button>
                  </Card.Body>
                </Card>
              </Col>
              
              <Col md={4}>
                <Card className="h-100">
                  <Card.Body className="text-center">
                    <Card.Title>Coaching Insights</Card.Title>
                    <Card.Text>
                      Create and manage insights and recommendations for your clients.
                    </Card.Text>
                    <Button variant="primary" disabled>
                      Coming Soon
                    </Button>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
            
            <div className="text-center mt-4">
              <p className="text-muted">
                <small>
                  This dashboard is currently under development. 
                  Full coaching features will be available soon.
                </small>
              </p>
            </div>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default CoachDashboard;