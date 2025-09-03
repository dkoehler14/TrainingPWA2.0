/**
 * Simple Role Checking Hooks
 * 
 * These hooks provide basic role checking without complex async operations
 * that can cause infinite re-render loops.
 */

import { useAuth, useRoles } from './useAuth';

/**
 * Simple hook to check if user has a specific role
 * Uses only local state, no async operations
 */
export function useHasRole(role) {
    const { isAuthenticated } = useAuth();
    const { userRoles } = useRoles();

    if (!isAuthenticated) {
        return false;
    }

    return userRoles.includes(role);
}

/**
 * Simple hook to check if user is admin
 */
export function useIsAdmin() {
    return useHasRole('admin');
}

/**
 * Simple hook to check if user is coach
 */
export function useIsCoach() {
    return useHasRole('coach');
}

/**
 * Simple hook to check if user has any of the specified roles
 */
export function useHasAnyRole(roles) {
    const { isAuthenticated } = useAuth();
    const { userRoles } = useRoles();

    if (!isAuthenticated || !roles || roles.length === 0) {
        return false;
    }

    return roles.some(role => userRoles.includes(role));
}

/**
 * Simple navigation permissions hook
 * Returns basic permissions without async operations
 */
export function useSimpleNavigationPermissions() {
    const { user, isAuthenticated } = useAuth();
    const isAdmin = useIsAdmin();
    const isCoach = useIsCoach();

    return {
        showAdminNav: isAuthenticated && isAdmin,
        showCoachNav: isAuthenticated && isCoach,
        showCreateProgram: isAuthenticated,
        showAnalytics: isAuthenticated,
        isLoading: false // Never loading since we don't do async operations
    };
}

export default {
    useHasRole,
    useIsAdmin,
    useIsCoach,
    useHasAnyRole,
    useSimpleNavigationPermissions
};