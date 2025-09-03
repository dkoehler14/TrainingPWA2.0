/**
 * Protected Route Component
 * 
 * This component provides role-based route protection with loading states
 * and appropriate redirects for unauthorized access.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { Spinner, Container, Row, Col, Alert } from 'react-bootstrap';
import { useRoleProtection } from '../hooks/useRoleProtection';

/**
 * Protected Route Component
 * @param {Object} props - Component props
 * @param {React.Component} props.children - Child components to render if authorized
 * @param {string|Array<string>} props.requiredRoles - Required role(s) for access
 * @param {string} props.redirectTo - Path to redirect to if unauthorized (default: '/')
 * @param {boolean} props.requireAuth - Whether authentication is required (default: true)
 * @param {boolean} props.requireProfile - Whether complete profile is required (default: true)
 * @param {React.Component} props.loadingComponent - Custom loading component
 * @param {React.Component} props.unauthorizedComponent - Custom unauthorized component
 * @returns {JSX.Element} Protected route content
 */
function ProtectedRoute({
  children,
  requiredRoles,
  redirectTo = '/',
  requireAuth = true,
  requireProfile = true,
  loadingComponent = null,
  unauthorizedComponent = null
}) {
  const protection = useRoleProtection(requiredRoles, {
    requireAuthentication: requireAuth,
    requireCompleteProfile: requireProfile
  });

  // Debug logging
  console.log('🔒 ProtectedRoute Debug:', {
    requiredRoles,
    redirectTo,
    protection: {
      hasAccess: protection.hasAccess,
      isLoading: protection.isLoading,
      needsAuthentication: protection.needsAuthentication,
      needsProfile: protection.needsProfile,
      needsRole: protection.needsRole,
      userRoles: protection.userRoles,
      requiredRoles: protection.requiredRoles,
      user: protection.user ? { id: protection.user.id, email: protection.user.email } : null,
      userProfile: protection.userProfile ? { id: protection.userProfile.id, roles: protection.userProfile.roles } : null
    }
  });

  // Show loading state
  if (protection.isLoading) {
    console.log('🔄 ProtectedRoute: Showing loading state');
    return loadingComponent || (
      <Container fluid className="d-flex justify-content-center align-items-center" style={{ minHeight: '50vh' }}>
        <div className="text-center">
          <Spinner animation="border" className="spinner-blue" />
          <p className="soft-text mt-2">Loading...</p>
        </div>
      </Container>
    );
  }

  // Handle different denial reasons
  if (!protection.hasAccess) {
    console.log('❌ ProtectedRoute: Access denied, reason:', {
      needsAuthentication: protection.needsAuthentication,
      needsProfile: protection.needsProfile,
      needsRole: protection.needsRole,
      redirectTo
    });

    // Redirect to auth if not authenticated
    if (protection.needsAuthentication) {
      console.log('🔐 ProtectedRoute: Redirecting to /auth');
      return <Navigate to="/auth" replace />;
    }

    // Show unauthorized message for role issues
    if (protection.needsRole) {
      console.log('🚫 ProtectedRoute: Showing unauthorized message for role issue');
      return unauthorizedComponent || (
        <Container fluid className="soft-container">
          <Row className="justify-content-center">
            <Col md={8}>
              <Alert variant="warning" className="text-center mt-5">
                <Alert.Heading>Access Denied</Alert.Heading>
                <p>
                  You don't have the required permissions to access this page.
                  Required role(s): <strong>{protection.requiredRoles.join(', ')}</strong>
                </p>
                <p>
                  Your current role(s): <strong>{protection.userRoles.join(', ')}</strong>
                </p>
              </Alert>
            </Col>
          </Row>
        </Container>
      );
    }

    // Default redirect for other cases
    console.log('🏠 ProtectedRoute: Default redirect to', redirectTo);
    return <Navigate to={redirectTo} replace />;
  }

  // Render protected content
  console.log('✅ ProtectedRoute: Access granted, rendering content');
  return children;
}

/**
 * Admin-only Protected Route
 */
export function AdminRoute({ children, ...props }) {
  return (
    <ProtectedRoute requiredRoles="admin" {...props}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * Coach-only Protected Route
 */
export function CoachRoute({ children, ...props }) {
  return (
    <ProtectedRoute requiredRoles="coach" {...props}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * Coach or Admin Protected Route
 */
export function CoachOrAdminRoute({ children, ...props }) {
  return (
    <ProtectedRoute requiredRoles={['coach', 'admin']} {...props}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * Multiple Role Protected Route
 */
export function MultiRoleRoute({ children, roles, ...props }) {
  return (
    <ProtectedRoute requiredRoles={roles} {...props}>
      {children}
    </ProtectedRoute>
  );
}

export default ProtectedRoute;