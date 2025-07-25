import React from 'react';
import { Nav, Navbar, Button, Container } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import '../styles/NavBar.css';

function NavBar({ user, userRole }) {
  const { darkMode, toggleDarkMode } = useTheme();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <Navbar bg={darkMode ? 'dark' : 'light'} variant={darkMode ? 'dark' : 'light'} expand="lg" className="navbar mb-4">
      <Container fluid className="soft-container">
        <Navbar.Brand href="/" className="navbar-brand">Workout Tracker</Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" className="navbar-toggler" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <Nav.Link href="/" className="nav-link">Home</Nav.Link>
            {user && <Nav.Link href="/log-workout" className="nav-link">Current Workout</Nav.Link>}
            {user && <Nav.Link href="/quick-workout" className="nav-link">Quick Workout</Nav.Link>}

            <Nav.Link href="/programs" className="nav-link">Programs</Nav.Link>
            {user && <Nav.Link href="/progress-tracker" className="nav-link">Analytics</Nav.Link>}
            {user && <Nav.Link href="/progress-coach" className="nav-link">Progress & AI Coach</Nav.Link>}
            {/* {user && <Nav.Link href="/analytics" className="nav-link">Analytics</Nav.Link>} */}
            <Nav.Link href="/exercises" className="nav-link">Exercises</Nav.Link>
            <Nav.Link href="/create-program" className="nav-link">Create Program</Nav.Link>
            {user && <Nav.Link href="/profile" className="nav-link">Profile</Nav.Link>}
            {userRole === 'admin' && <Nav.Link href="/admin" className="nav-link">Admin</Nav.Link>}
          </Nav>
          <Nav className="d-flex align-items-center">
            <Button
              variant={darkMode ? 'light' : 'dark'}
              onClick={toggleDarkMode}
              className="me-2"
              style={{ marginBottom: 0 }}
            >
              {darkMode ? '☀️' : '🌙'}
            </Button>
            {user ? (
              <Button 
                variant="outline-danger" 
                onClick={handleLogout} 
                className="soft-button soft-logout-button"
              >
                Logout
              </Button>
            ) : (
              <Nav.Link href="/auth" className="nav-link">Sign In</Nav.Link>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default NavBar;