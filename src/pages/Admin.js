import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';

function Admin() {
  return (
    <Container fluid className="soft-container home-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <Card className="soft-card shadow border-0 p-4 mt-5">
            <h1 className="soft-title text-center mb-4">Admin Panel</h1>
            <p className="soft-text text-center">This page is only accessible to users with the <b>admin</b> role.</p>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default Admin; 