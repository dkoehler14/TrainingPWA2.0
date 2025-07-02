import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

function Admin() {
  const navigate = useNavigate();
  return (
    <Container fluid className="soft-container home-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <Card className="soft-card shadow border-0 p-4 mt-5">
            <h1 className="soft-title text-center mb-4">Admin Panel</h1>
            <p className="soft-text text-center">This page is only accessible to users with the <b>admin</b> role.</p>
            <div className="text-center mt-4">
              <Button variant="primary" onClick={() => navigate('/create-program')}>
                Create Template Program
              </Button>
            </div>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default Admin; 