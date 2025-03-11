import React from 'react';
import { Nav, Navbar, Button, Container } from 'react-bootstrap';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import '../styles/Navbar.css';

function NavBar({ user }) {
  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <Navbar expand="lg" className="navbar mb-4">
      <Container fluid className="soft-container">
        <Navbar.Brand href="/" className="navbar-brand">Workout Tracker</Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" className="navbar-toggler" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <Nav.Link href="/" className="nav-link">Home</Nav.Link>
            {user && <Nav.Link href="/log-workout" className="nav-link">Current Workout</Nav.Link>}
            <Nav.Link href="/programs" className="nav-link">Programs</Nav.Link>
            {user && <Nav.Link href="/progress-tracker" className="nav-link">Progress</Nav.Link>}
            <Nav.Link href="/exercises" className="nav-link">Exercises</Nav.Link>
            <Nav.Link href="/create-program" className="nav-link">Create Program</Nav.Link>
            {user && <Nav.Link href="/profile" className="nav-link">Profile</Nav.Link>}
            
          </Nav>
          <Nav>
            {user ? (
              <Button variant="outline-danger" onClick={handleLogout} className="soft-button soft-logout-button">Logout</Button>
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