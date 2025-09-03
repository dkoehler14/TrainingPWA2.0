/**
 * Role-based Route Protection Hook
 * 
 * This hook provides utilities for protecting routes and components based on user roles.
 * It integrates with the authentication system to provide role-based access control.
 */

import { useAuth, useRoles } from './useAuth';

/**
 * Hook for role-based route protection
 * @param {string|Array<string>} requiredRoles - Required role(s) for access
 * @param {Object} options - Additional options
 * @returns {Object} Protection state and utilities
 */
export function useRoleProtection(requiredRoles, options = {}) {
  const { user, userProfile, loading, isAuthenticated } = useAuth();
  const { userRoles, hasRole, hasAnyRole } = useRoles();

  const {
    requireAuthentication = true,
    requireCompleteProfile = true,
    fallbackRole = null
  } = options;

  // Normalize required roles to array
  const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  // Check if user meets authentication requirements
  const isAuthenticationValid = !requireAuthentication || isAuthenticated;
  const isProfileValid = !requireCompleteProfile || !!userProfile;

  // Check role access
  const hasRequiredRole = rolesArray.length === 0 || hasAnyRole(rolesArray);
  const hasFallbackAccess = fallbackRole ? hasRole(fallbackRole) : false;

  // Determine access status
  const hasAccess = isAuthenticationValid && isProfileValid && (hasRequiredRole || hasFallbackAccess);
  const isLoading = loading;
  const needsAuthentication = requireAuthentication && !isAuthenticated;
  const needsProfile = requireCompleteProfile && isAuthenticated && !userProfile;
  const needsRole = isAuthenticated && isProfileValid && !hasRequiredRole && !hasFallbackAccess;

  // Debug logging
  console.log('🛡️ useRoleProtection Debug:', {
    requiredRoles: rolesArray,
    options,
    checks: {
      isAuthenticated,
      userProfile: userProfile ? { id: userProfile.id, roles: userProfile.roles, name: userProfile.name } : null,
      userRoles,
      isAuthenticationValid,
      isProfileValid,
      hasRequiredRole,
      hasFallbackAccess,
      hasAccess,
      isLoading,
      needsAuthentication,
      needsProfile,
      needsRole
    },
    user: user ? { id: user.id, email: user.email } : null
  });

  // Get specific denial reason
  const getDenialReason = () => {
    if (needsAuthentication) return 'authentication_required';
    if (needsProfile) return 'profile_incomplete';
    if (needsRole) return 'insufficient_role';
    return null;
  };

  return {
    hasAccess,
    isLoading,
    needsAuthentication,
    needsProfile,
    needsRole,
    denialReason: getDenialReason(),
    userRoles,
    requiredRoles: rolesArray,
    user,
    userProfile
  };
}

/**
 * Hook for admin-only access
 * @param {Object} options - Additional options
 * @returns {Object} Admin protection state
 */
export function useAdminProtection(options = {}) {
  return useRoleProtection('admin', options);
}

/**
 * Hook for coach-only access
 * @param {Object} options - Additional options
 * @returns {Object} Coach protection state
 */
export function useCoachProtection(options = {}) {
  return useRoleProtection('coach', options);
}

/**
 * Hook for coach or admin access
 * @param {Object} options - Additional options
 * @returns {Object} Coach/Admin protection state
 */
export function useCoachOrAdminProtection(options = {}) {
  return useRoleProtection(['coach', 'admin'], options);
}

/**
 * Hook for checking if user can access client data
 * @param {string} clientId - Client user ID
 * @returns {Object} Client access state
 */
export function useClientAccessProtection(clientId) {
  const { user } = useAuth();
  const { isAdmin, isCoach } = useRoles();
  
  // User can access their own data
  const isOwner = user?.id === clientId;
  
  // Admins can access any client data
  const hasAdminAccess = isAdmin();
  
  // Coaches need to be checked against relationships (this would need additional logic)
  const hasCoachAccess = isCoach(); // Simplified - would need relationship check
  
  const hasAccess = isOwner || hasAdminAccess || hasCoachAccess;
  
  return {
    hasAccess,
    isOwner,
    hasAdminAccess,
    hasCoachAccess,
    clientId
  };
}

/**
 * Component wrapper for role-based protection
 * @param {Object} props - Component props
 * @returns {JSX.Element|null} Protected component or null
 */
export function RoleProtectedComponent({ 
  children, 
  requiredRoles, 
  fallbackComponent = null,
  loadingComponent = null,
  options = {} 
}) {
  const protection = useRoleProtection(requiredRoles, options);
  
  if (protection.isLoading) {
    return loadingComponent || <div>Loading...</div>;
  }
  
  if (!protection.hasAccess) {
    return fallbackComponent || null;
  }
  
  return children;
}

/**
 * Higher-order component for role-based protection
 * @param {React.Component} WrappedComponent - Component to protect
 * @param {string|Array<string>} requiredRoles - Required roles
 * @param {Object} options - Protection options
 * @returns {React.Component} Protected component
 */
export function withRoleProtection(WrappedComponent, requiredRoles, options = {}) {
  return function ProtectedComponent(props) {
    const protection = useRoleProtection(requiredRoles, options);
    
    if (protection.isLoading) {
      return options.loadingComponent || <div>Loading...</div>;
    }
    
    if (!protection.hasAccess) {
      return options.fallbackComponent || <div>Access Denied</div>;
    }
    
    return <WrappedComponent {...props} roleProtection={protection} />;
  };
}

export default {
  useRoleProtection,
  useAdminProtection,
  useCoachProtection,
  useCoachOrAdminProtection,
  useClientAccessProtection,
  RoleProtectedComponent,
  withRoleProtection
};