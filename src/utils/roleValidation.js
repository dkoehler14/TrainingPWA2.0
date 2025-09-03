/**
 * Role Validation Utilities
 * 
 * This module provides utilities for validating user roles and permissions
 * throughout the application.
 */

import { hasAdminRole, hasCoachRole } from '../services/permissionService';

/**
 * Validate if user can be promoted to coach
 * @param {Object} user - User object
 * @param {Object} currentUser - Current user performing the action
 * @returns {Promise<Object>} Validation result
 */
export const validateCoachPromotion = async (user, currentUser) => {
  const validation = {
    isValid: false,
    errors: [],
    warnings: []
  };

  try {
    // Check if current user has admin role
    const isAdmin = await hasAdminRole(currentUser.id);
    if (!isAdmin) {
      validation.errors.push('Only administrators can promote users to coach role');
      return validation;
    }

    // Check if target user exists
    if (!user || !user.id) {
      validation.errors.push('Invalid user selected for promotion');
      return validation;
    }

    // Check if user is already a coach
    const isAlreadyCoach = await hasCoachRole(user.id);
    if (isAlreadyCoach) {
      validation.errors.push('User is already a coach');
      return validation;
    }

    // Check if user is trying to promote themselves
    if (user.id === currentUser.id) {
      validation.warnings.push('You are promoting yourself to coach role');
    }

    // All validations passed
    validation.isValid = true;
    
  } catch (error) {
    console.error('Error validating coach promotion:', error);
    validation.errors.push('Failed to validate promotion permissions');
  }

  return validation;
};

/**
 * Validate if user can be demoted from coach
 * @param {Object} coach - Coach user object
 * @param {Object} currentUser - Current user performing the action
 * @returns {Promise<Object>} Validation result
 */
export const validateCoachDemotion = async (coach, currentUser) => {
  const validation = {
    isValid: false,
    errors: [],
    warnings: []
  };

  try {
    // Check if current user has admin role
    const isAdmin = await hasAdminRole(currentUser.id);
    if (!isAdmin) {
      validation.errors.push('Only administrators can demote coaches');
      return validation;
    }

    // Check if target user exists
    if (!coach || !coach.id) {
      validation.errors.push('Invalid coach selected for demotion');
      return validation;
    }

    // Check if user is actually a coach
    const isCoach = await hasCoachRole(coach.id);
    if (!isCoach) {
      validation.errors.push('User is not currently a coach');
      return validation;
    }

    // Check if user is trying to demote themselves
    if (coach.id === currentUser.id) {
      validation.warnings.push('You are demoting yourself from coach role');
    }

    // Warning about active relationships (would need to check relationships)
    validation.warnings.push('Demotion will deactivate all active coaching relationships');

    // All validations passed
    validation.isValid = true;
    
  } catch (error) {
    console.error('Error validating coach demotion:', error);
    validation.errors.push('Failed to validate demotion permissions');
  }

  return validation;
};

/**
 * Validate coach profile data
 * @param {Object} coachData - Coach profile data
 * @returns {Object} Validation result
 */
export const validateCoachProfile = (coachData) => {
  const validation = {
    isValid: false,
    errors: [],
    warnings: []
  };

  // Validate specializations
  if (coachData.specializations) {
    if (!Array.isArray(coachData.specializations)) {
      validation.errors.push('Specializations must be an array');
    } else {
      // Filter out empty specializations
      const validSpecializations = coachData.specializations.filter(spec => 
        spec && typeof spec === 'string' && spec.trim().length > 0
      );
      
      if (validSpecializations.length !== coachData.specializations.length) {
        validation.warnings.push('Empty specializations will be removed');
      }

      // Check for reasonable length
      validSpecializations.forEach(spec => {
        if (spec.length > 100) {
          validation.warnings.push(`Specialization "${spec.substring(0, 30)}..." is very long`);
        }
      });
    }
  }

  // Validate bio
  if (coachData.bio) {
    if (typeof coachData.bio !== 'string') {
      validation.errors.push('Bio must be a string');
    } else if (coachData.bio.length > 1000) {
      validation.errors.push('Bio must be less than 1000 characters');
    } else if (coachData.bio.length < 10) {
      validation.warnings.push('Bio is very short - consider adding more information');
    }
  }

  // If no errors, validation passes
  validation.isValid = validation.errors.length === 0;

  return validation;
};

/**
 * Validate role assignment
 * @param {string} userId - User ID
 * @param {string} role - Role to assign
 * @param {Object} currentUser - Current user performing the action
 * @returns {Promise<Object>} Validation result
 */
export const validateRoleAssignment = async (userId, role, currentUser) => {
  const validation = {
    isValid: false,
    errors: [],
    warnings: []
  };

  try {
    // Check if current user has admin role
    const isAdmin = await hasAdminRole(currentUser.id);
    if (!isAdmin) {
      validation.errors.push('Only administrators can assign roles');
      return validation;
    }

    // Validate role
    const validRoles = ['user', 'coach', 'admin', 'moderator'];
    if (!validRoles.includes(role)) {
      validation.errors.push(`Invalid role: ${role}. Valid roles are: ${validRoles.join(', ')}`);
      return validation;
    }

    // Check if user exists
    if (!userId) {
      validation.errors.push('User ID is required');
      return validation;
    }

    // Warning for admin role assignment
    if (role === 'admin') {
      validation.warnings.push('Admin role grants full system access');
    }

    // All validations passed
    validation.isValid = true;
    
  } catch (error) {
    console.error('Error validating role assignment:', error);
    validation.errors.push('Failed to validate role assignment permissions');
  }

  return validation;
};

/**
 * Check if user has permission to perform action
 * @param {Object} user - User object
 * @param {string} action - Action to perform
 * @param {Object} context - Additional context
 * @returns {Promise<boolean>} True if user has permission
 */
export const hasPermissionForAction = async (user, action, context = {}) => {
  if (!user || !user.id) {
    return false;
  }

  try {
    switch (action) {
      case 'promote_to_coach':
      case 'demote_coach':
      case 'manage_coaches':
        return await hasAdminRole(user.id);
      
      case 'access_coach_dashboard':
      case 'manage_clients':
      case 'send_invitations':
        return await hasCoachRole(user.id);
      
      case 'access_admin_panel':
        return await hasAdminRole(user.id);
      
      default:
        console.warn(`Unknown action for permission check: ${action}`);
        return false;
    }
  } catch (error) {
    console.error('Error checking permission for action:', error);
    return false;
  }
};

export default {
  validateCoachPromotion,
  validateCoachDemotion,
  validateCoachProfile,
  validateRoleAssignment,
  hasPermissionForAction
};