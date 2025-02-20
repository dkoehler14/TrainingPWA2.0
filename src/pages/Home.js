import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';

function Home() {
  const tiles = [
    { title: 'Exercises', path: '/exercises', description: 'View and add exercises' },
    { title: 'Create Workout', path: '/create-workout', description: 'Build a new workout' },
    { title: 'Create Program', path: '/create-program', description: 'Design a fitness program' },
    { title: 'Programs', path: '/programs', description: 'View your programs' },
  ];

  return (
    <Container className="mt-5">
      <Row className="justify-content-center">
        <Col md={10}>
          <h1 className="text-center mb-4">Welcome to Exercise Tracker</h1>
          <Row xs={1} md={2} lg={4} className="g-4">
            {tiles.map((tile, index) => (
              <Col key={index}>
                <Card>
                  <Card.Body>
                    <Card.Title>{tile.title}</Card.Title>
                    <Card.Text>{tile.description}</Card.Text>
                    <Button as={Link} to={tile.path} variant="primary">
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