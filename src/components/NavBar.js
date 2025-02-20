import React from 'react';
import { Nav, Navbar, Button } from 'react-bootstrap';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

function NavBar({ user }) {
  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <Navbar bg="light" expand="lg">
      <Navbar.Brand href="/">Exercise Tracker</Navbar.Brand>
      <Navbar.Toggle aria-controls="basic-navbar-nav" />
      <Navbar.Collapse id="basic-navbar-nav">
        <Nav className="me-auto">
          <Nav.Link href="/">Home</Nav.Link>
          <Nav.Link href="/create-workout">Create Workout</Nav.Link>
          <Nav.Link href="/create-program">Create Program</Nav.Link>
          <Nav.Link href="/programs">Programs</Nav.Link>
        </Nav>
        <Nav>
          {user ? (
            <Button variant="outline-danger" onClick={handleLogout}>Logout</Button>
          ) : (
            <Nav.Link href="/auth">Sign In</Nav.Link>
          )}
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
}

export default NavBar;