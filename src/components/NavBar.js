import React, { useState, useRef } from 'react';
import { Nav, Navbar, Button, Container } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { useSimpleNavigationPermissions } from '../hooks/useSimpleRoleCheck';
import { useHasActiveCoach } from '../hooks/useClientCoach';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './NotificationBell';
import '../styles/NavBar.css';

function NavBar({ user, userRole, isReady }) {
  const { darkMode, toggleDarkMode } = useTheme();
  const { signOut } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const navbarToggleRef = useRef(null);

  // Use simple navigation permissions that don't cause infinite loops
  const { showAdminNav, showCoachNav, showCreateProgram, showAnalytics } = useSimpleNavigationPermissions();
  
  // Check if user has an active coach
  const { hasCoach, isChecking } = useHasActiveCoach();

  const handleLogout = async () => {
    try {
      // Close navbar on mobile devices before logging out
      if (expanded) {
        setExpanded(false);
      }
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <Navbar
      bg={darkMode ? 'dark' : 'light'}
      variant={darkMode ? 'dark' : 'light'}
      expand="lg"
      className="navbar mb-4"
      expanded={expanded}
      onToggle={setExpanded}
    >
      <Container fluid className="soft-container">
        <Navbar.Brand href="/" className="navbar-brand">Workout Tracker</Navbar.Brand>
        <Navbar.Toggle
          aria-controls="basic-navbar-nav"
          className="navbar-toggler"
          ref={navbarToggleRef}
        />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            {user && <Nav.Link href="/" className="nav-link">Home</Nav.Link>}
            {user && <Nav.Link href="/log-workout" className="nav-link">Current Workout</Nav.Link>}
            {user && <Nav.Link href="/quick-workout" className="nav-link">Quick Workout</Nav.Link>}

            {user && <Nav.Link href="/programs" className="nav-link">Programs</Nav.Link>}
            {user && showAnalytics && <Nav.Link href="/progress-tracker-3" className="nav-link">Analytics</Nav.Link>}
            {user && <Nav.Link href="/progress-coach" className="nav-link">Progress & AI Coach</Nav.Link>}
            {/* {user && <Nav.Link href="/analytics" className="nav-link">Analytics</Nav.Link>} */}
            {user && <Nav.Link href="/exercises" className="nav-link">Exercises</Nav.Link>}
            {user && showCreateProgram && <Nav.Link href="/create-program" className="nav-link">Create Program</Nav.Link>}
            {user && <Nav.Link href="/profile" className="nav-link">Profile</Nav.Link>}
            {user && hasCoach && !isChecking && <Nav.Link href="/my-coach" className="nav-link">My Coach</Nav.Link>}
            {isReady && showCoachNav && <Nav.Link href="/coach-dashboard" className="nav-link">Coach Dashboard</Nav.Link>}
            {isReady && showCoachNav && <Nav.Link href="/coach/clients" className="nav-link">Client Management</Nav.Link>}
            {isReady && showCoachNav && <Nav.Link href="/coach/insights" className="nav-link">Coaching Insights</Nav.Link>}
            {isReady && showAdminNav && <Nav.Link href="/admin" className="nav-link">Admin</Nav.Link>}
          </Nav>
          <Nav className="d-flex align-items-center">
            {user && <NotificationBell />}
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