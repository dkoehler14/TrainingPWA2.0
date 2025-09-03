/**
 * Role-Based Component Wrapper
 * 
 * This component provides role-based rendering with support for loading states,
 * fallback components, and flexible role checking.
 */

import React from 'react';
import { Spinner } from 'react-bootstrap';
import { useHasRole, useHasAnyRole, useRolePermissions } from '../hooks/useRoleChecking';

/**
 * Component that renders children only if user has required role
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Children to render if authorized
 * @param {string|Array<string>} props.requiredRole - Required role(s)
 * @param {React.ReactNode} props.fallback - Component to render if unauthorized
 * @param {React.ReactNode} props.loading - Component to render while checking
 * @param {boolean} props.requireAll - Whether all roles are required (default: false)
 * @returns {JSX.Element|null} Rendered component or fallback
 */
export function RoleBasedComponent({ 
  children, 
  requiredRole, 
  fallback = null, 
  loading = null,
  requireAll = false 
}) {
  // Handle single role
  const singleRoleCheck = useHasRole(typeof requiredRole === 'string' ? requiredRole : null);
  
  // Handle multiple roles
  const multipleRoleCheck = useHasAnyRole(Array.isArray(requiredRole) ? requiredRole : null);
  
  // Determine which check to use
  const roleCheck = Array.isArray(requiredRole) ? multipleRoleCheck : singleRoleCheck;
  
  // Show loading state
  if (roleCheck.isChecking) {
    return loading || <Spinner animation="border" size="sm" />;
  }
  
  // Check role access
  const hasAccess = Array.isArray(requiredRole) 
    ? (requireAll 
        ? Object.values(multipleRoleCheck.roleResults).every(Boolean)
        : multipleRoleCheck.hasAnyRole)
    : singleRoleCheck.hasRole;
  
  // Render children if authorized, fallback otherwise
  return hasAccess ? children : fallback;
}

/**
 * Component for admin-only content
 */
export function AdminOnly({ children, fallback = null, loading = null }) {
  return (
    <RoleBasedComponent 
      requiredRole="admin" 
      fallback={fallback} 
      loading={loading}
    >
      {children}
    </RoleBasedComponent>
  );
}

/**
 * Component for coach-only content
 */
export function CoachOnly({ children, fallback = null, loading = null }) {
  return (
    <RoleBasedComponent 
      requiredRole="coach" 
      fallback={fallback} 
      loading={loading}
    >
      {children}
    </RoleBasedComponent>
  );
}

/**
 * Component for coach or admin content
 */
export function CoachOrAdmin({ children, fallback = null, loading = null }) {
  return (
    <RoleBasedComponent 
      requiredRole={['coach', 'admin']} 
      fallback={fallback} 
      loading={loading}
    >
      {children}
    </RoleBasedComponent>
  );
}

/**
 * Component that shows different content based on user role
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.adminContent - Content for admin users
 * @param {React.ReactNode} props.coachContent - Content for coach users
 * @param {React.ReactNode} props.userContent - Content for regular users
 * @param {React.ReactNode} props.defaultContent - Default content
 * @param {React.ReactNode} props.loading - Loading component
 * @returns {JSX.Element} Role-appropriate content
 */
export function RoleBasedContent({ 
  adminContent = null,
  coachContent = null, 
  userContent = null,
  defaultContent = null,
  loading = null
}) {
  const { permissions, isLoading } = useRolePermissions();
  
  if (isLoading) {
    return loading || <Spinner animation="border" size="sm" />;
  }
  
  // Show content based on highest role
  if (permissions.canAccessAdminPanel && adminContent) {
    return adminContent;
  }
  
  if (permissions.canAccessCoachDashboard && coachContent) {
    return coachContent;
  }
  
  if (userContent) {
    return userContent;
  }
  
  return defaultContent;
}

/**
 * Navigation item wrapper with role checking
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Navigation item content
 * @param {string|Array<string>} props.requiredRole - Required role(s)
 * @param {boolean} props.isReady - Whether auth is ready
 * @returns {JSX.Element|null} Navigation item or null
 */
export function RoleBasedNavItem({ children, requiredRole, isReady = true }) {
  if (!isReady) {
    return null;
  }
  
  return (
    <RoleBasedComponent requiredRole={requiredRole}>
      {children}
    </RoleBasedComponent>
  );
}

/**
 * Button wrapper with role-based enabling/disabling
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Button content
 * @param {string|Array<string>} props.requiredRole - Required role(s)
 * @param {boolean} props.hideIfUnauthorized - Hide button if unauthorized
 * @param {string} props.unauthorizedTooltip - Tooltip for unauthorized state
 * @param {Object} props.buttonProps - Additional button props
 * @returns {JSX.Element} Role-aware button
 */
export function RoleBasedButton({ 
  children, 
  requiredRole, 
  hideIfUnauthorized = false,
  unauthorizedTooltip = "You don't have permission for this action",
  ...buttonProps 
}) {
  const roleCheck = useHasRole(typeof requiredRole === 'string' ? requiredRole : null);
  const multiRoleCheck = useHasAnyRole(Array.isArray(requiredRole) ? requiredRole : null);
  
  const check = Array.isArray(requiredRole) ? multiRoleCheck : roleCheck;
  
  if (check.isChecking) {
    return (
      <button {...buttonProps} disabled>
        <Spinner animation="border" size="sm" />
      </button>
    );
  }
  
  const hasAccess = Array.isArray(requiredRole) ? multiRoleCheck.hasAnyRole : roleCheck.hasRole;
  
  if (!hasAccess && hideIfUnauthorized) {
    return null;
  }
  
  return (
    <button 
      {...buttonProps} 
      disabled={!hasAccess || buttonProps.disabled}
      title={!hasAccess ? unauthorizedTooltip : buttonProps.title}
    >
      {children}
    </button>
  );
}

export default {
  RoleBasedComponent,
  AdminOnly,
  CoachOnly,
  CoachOrAdmin,
  RoleBasedContent,
  RoleBasedNavItem,
  RoleBasedButton
};