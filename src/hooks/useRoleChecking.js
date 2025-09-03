/**
 * Advanced Role Checking Hooks
 * 
 * This module provides hooks for checking user roles and permissions with database verification.
 * 
 * ⚠️  WARNING: These hooks perform async database operations and should be used sparingly.
 * 
 * WHEN TO USE:
 * - Security-critical operations (admin actions, sensitive data access)
 * - One-time permission verification
 * - Components that need comprehensive permission objects
 * 
 * FOR NAVIGATION AND UI: Use useSimpleRoleCheck.js instead to avoid performance issues.
 */

import { useState, useEffect } from 'react';
import { useAuth, useRoles } from './useAuth';
import { hasAdminRole, hasCoachRole } from '../services/permissionService';

/**
 * Hook for checking if current user has specific role
 * @param {string} role - Role to check
 * @returns {Object} Role checking state
 */
export function useHasRole(role) {
  const { user, isAuthenticated } = useAuth();
  const { userRoles } = useRoles();
  const [isChecking, setIsChecking] = useState(false); // Start as false
  const [hasRoleResult, setHasRoleResult] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Don't check roles if not authenticated
    if (!isAuthenticated || !user) {
      setHasRoleResult(false);
      setIsChecking(false);
      return;
    }

    const checkRole = async () => {

      try {
        setIsChecking(true);
        setError(null);

        // Use local role checking first (faster)
        const localResult = userRoles.includes(role);
        setHasRoleResult(localResult);

        // For critical roles, also verify with database
        if (role === 'admin' || role === 'coach') {
          let dbResult = false;

          if (role === 'admin') {
            dbResult = await hasAdminRole(user.id);
          } else if (role === 'coach') {
            dbResult = await hasCoachRole(user.id);
          }

          // Update if database result differs
          if (dbResult !== localResult) {
            setHasRoleResult(dbResult);
          }
        }

      } catch (err) {
        console.error(`Error checking role ${role}:`, err);
        setError(err);
        // Fallback to local checking on error
        setHasRoleResult(userRoles.includes(role));
      } finally {
        setIsChecking(false);
      }
    };

    checkRole();
  }, [isAuthenticated, user?.id, role, userRoles]); // Include isAuthenticated

  return {
    hasRole: hasRoleResult,
    isChecking,
    error
  };
}

/**
 * Hook for checking if current user is admin
 * @returns {Object} Admin checking state
 */
export function useIsAdmin() {
  return useHasRole('admin');
}

/**
 * Hook for checking if current user is coach
 * @returns {Object} Coach checking state
 */
export function useIsCoach() {
  return useHasRole('coach');
}

/**
 * Hook for checking multiple roles
 * @param {Array<string>} roles - Roles to check
 * @returns {Object} Multiple role checking state
 */
export function useHasAnyRole(roles) {
  const { user, isAuthenticated } = useAuth();
  const { userRoles } = useRoles();
  const [isChecking, setIsChecking] = useState(false); // Start as false
  const [hasAnyRoleResult, setHasAnyRoleResult] = useState(false);
  const [roleResults, setRoleResults] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    // Don't check roles if not authenticated
    if (!isAuthenticated || !user || !roles || roles.length === 0) {
      setHasAnyRoleResult(false);
      setRoleResults({});
      setIsChecking(false);
      return;
    }

    const checkRoles = async () => {

      try {
        setIsChecking(true);
        setError(null);

        // Use local role checking first
        const localResult = roles.some(role => userRoles.includes(role));
        setHasAnyRoleResult(localResult);

        // Check individual roles
        const results = {};
        for (const role of roles) {
          results[role] = false;

          // For critical roles, verify with database
          if (role === 'admin') {
            results[role] = await hasAdminRole(user.id);
          } else if (role === 'coach') {
            results[role] = await hasCoachRole(user.id);
          } else {
            // Use local checking for other roles
            results[role] = userRoles.includes(role);
          }
        }

        setRoleResults(results);
        setHasAnyRoleResult(Object.values(results).some(Boolean));

      } catch (err) {
        console.error('Error checking multiple roles:', err);
        setError(err);
        // Fallback to local checking
        setHasAnyRoleResult(roles.some(role => userRoles.includes(role)));
      } finally {
        setIsChecking(false);
      }
    };

    checkRoles();
  }, [isAuthenticated, user?.id, roles, userRoles]); // Include isAuthenticated

  return {
    hasAnyRole: hasAnyRoleResult,
    roleResults,
    isChecking,
    error
  };
}

/**
 * Hook for comprehensive role and permission checking
 * Use this only when you need database-verified permissions
 * For simple navigation, use useSimpleRoleCheck instead
 * @param {boolean} skipDatabaseCheck - Skip database verification (default: false)
 * @returns {Object} Comprehensive role state
 */
export function useRolePermissions(skipDatabaseCheck = false) {
  const { user, userProfile, isAuthenticated } = useAuth();
  const { userRoles } = useRoles();
  const [permissions, setPermissions] = useState({
    canAccessAdminPanel: false,
    canManageCoaches: false,
    canAccessCoachDashboard: false,
    canManageClients: false,
    canSendInvitations: false,
    canCreatePrograms: false,
    canViewAnalytics: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    // Don't do anything if user is not authenticated
    if (!isAuthenticated || !user) {
      setPermissions({
        canAccessAdminPanel: false,
        canManageCoaches: false,
        canAccessCoachDashboard: false,
        canManageClients: false,
        canSendInvitations: false,
        canCreatePrograms: false,
        canViewAnalytics: false
      });
      setIsLoading(false);
      setHasInitialized(true);
      return;
    }

    // Only run once per user to prevent infinite loops
    if (hasInitialized) {
      return;
    }

    const calculatePermissions = async () => {
      try {
        setIsLoading(true);

        let isAdminUser, isCoachUser;

        if (skipDatabaseCheck) {
          // Use local role checking only
          isAdminUser = userRoles.includes('admin');
          isCoachUser = userRoles.includes('coach');
        } else {
          // Verify with database
          isAdminUser = await hasAdminRole(user.id);
          isCoachUser = await hasCoachRole(user.id);
        }

        const newPermissions = {
          // Admin permissions
          canAccessAdminPanel: isAdminUser,
          canManageCoaches: isAdminUser,

          // Coach permissions
          canAccessCoachDashboard: isCoachUser,
          canManageClients: isCoachUser,
          canSendInvitations: isCoachUser,

          // General user permissions
          canCreatePrograms: true,
          canViewAnalytics: true,

          // Enhanced permissions for admins
          canViewAllData: isAdminUser,
          canModifySystemSettings: isAdminUser
        };

        setPermissions(newPermissions);

      } catch (error) {
        console.error('Error calculating permissions:', error);
        // Fallback to local role checking from userRoles array
        const hasAdminRole = userRoles.includes('admin');
        const hasCoachRole = userRoles.includes('coach');

        setPermissions({
          canAccessAdminPanel: hasAdminRole,
          canManageCoaches: hasAdminRole,
          canAccessCoachDashboard: hasCoachRole,
          canManageClients: hasCoachRole,
          canSendInvitations: hasCoachRole,
          canCreatePrograms: true,
          canViewAnalytics: true
        });
      } finally {
        setIsLoading(false);
        setHasInitialized(true);
      }
    };

    calculatePermissions();
  }, [isAuthenticated, user?.id]); // Minimal dependencies

  // Reset initialization when user changes
  useEffect(() => {
    setHasInitialized(false);
  }, [user?.id]);

  return {
    permissions,
    isLoading,
    userRoles,
    user,
    userProfile
  };
}

/**
 * Hook for navigation-specific role checking
 * @returns {Object} Navigation permissions
 */
export function useNavigationPermissions() {
  const { permissions, isLoading } = useRolePermissions();

  return {
    showAdminNav: permissions.canAccessAdminPanel,
    showCoachNav: permissions.canAccessCoachDashboard,
    showCreateProgram: permissions.canCreatePrograms,
    showAnalytics: permissions.canViewAnalytics,
    isLoading
  };
}

export default {
  useHasRole,
  useIsAdmin,
  useIsCoach,
  useHasAnyRole,
  useRolePermissions,
  useNavigationPermissions
};