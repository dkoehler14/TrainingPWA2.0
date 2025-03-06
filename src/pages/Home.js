import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import '../styles/Home.css';

// Consider creating a separate JSON or config file for tiles
const TILES = [
  { 
    title: 'Current Workout', 
    path: '/log-workout', 
    description: 'Log your workout',
    icon: 'fitness-icon' // Optional: add icon classes
  },
  { 
    title: 'Programs', 
    path: '/programs', 
    description: 'View your programs',
    icon: 'program-icon'
  },
  { 
    title: 'Progress', 
    path: '/progress-tracker', 
    description: 'View your progress',
    icon: 'progress-icon'
  },
  { 
    title: 'Create Program', 
    path: '/create-program', 
    description: 'Design your next program',
    icon: 'create-icon'
  },
  { 
    title: 'Profile', 
    path: '/profile', 
    description: 'Manage your profile',
    icon: 'profile-icon'
  },
  { 
    title: 'Exercises', 
    path: '/exercises', 
    description: 'View and add exercises',
    icon: 'exercise-icon'
  }
];

function Home() {
  return (
    <Container fluid className="soft-container home-container">
      <Row className="justify-content-center">
        <Col md={10}>
          <h1 className="soft-title home-title text-center mb-4">Welcome to Exercise Tracker</h1>
          <Row xs={1} sm={2} md={3} lg={4} className="tile-row g-3">
            {TILES.map((tile) => (
              <Col key={tile.path}>
                <Card 
                  className="soft-card tile-card shadow border-0 h-100" 
                  data-testid={`tile-${tile.title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Card.Body className="text-center d-flex flex-column">
                    {/* Optional: Add icon support */}
                    {tile.icon && <div className={`tile-icon ${tile.icon} mb-2`}></div>}
                    
                    <Card.Title className="soft-title tile-title mb-2">
                      {tile.title}
                    </Card.Title>
                    
                    <Card.Text className="soft-text tile-text flex-grow-1">
                      {tile.description}
                    </Card.Text>
                    
                    <Button 
                      as={Link} 
                      to={tile.path} 
                      className="soft-button tile-button gradient mt-auto"
                      aria-label={`Navigate to ${tile.title}`}
                    >
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