import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import '../styles/Home.css';

function Home() {
  const tiles = [
    { title: 'Programs', path: '/programs', description: 'View your programs' },
    { title: 'Log Workout', path: '/log-workout', description: 'Track your workout weights' },
    { title: 'Profile', path: '/profile', description: 'Manage your profile' },
    { title: 'Create Program', path: '/create-program', description: 'Design a fitness program' },
    { title: 'Exercises', path: '/exercises', description: 'View and add exercises' },
  ];

  return (
    <Container fluid className="soft-container home-container">
      <Row className="justify-content-center">
        <Col md={10}>
          <h1 className="soft-title home-title text-center">Welcome to Exercise Tracker</h1>
          <Row xs={1} sm={2} md={3} lg={4} className="tile-row">
            {tiles.map((tile, index) => (
              <Col key={index}>
                <Card className="soft-card tile-card shadow border-0">
                  <Card.Body className="text-center">
                    <Card.Title className="soft-title tile-title">{tile.title}</Card.Title>
                    <Card.Text className="soft-text tile-text">{tile.description}</Card.Text>
                    <Button as={Link} to={tile.path} className="soft-button tile-button gradient">
                      Go
                    </Button>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        </Col>
      </Row>
    </Container>
  );
}

export default Home;