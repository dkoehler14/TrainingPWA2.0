# Implementation Plan

- [x] 1. Update database RLS policy for admin-only global exercise updates
  - Create new migration file to replace current permissive policy
  - Update RLS policy to check user_profiles.role = 'admin' for global exercise updates
  - Test policy with admin and non-admin users
  - _Requirements: 1.1, 1.2, 3.1, 3.2_

- [x] 2. Add permission checking utilities to exercise service
  - Create canEditGlobalExercise utility function in exerciseService.js
  - Add role-based validation before updateExercise calls
  - Implement user-friendly error messages for permission denials
  - _Requirements: 1.1, 1.2, 2.1_

- [x] 3. Update ExerciseGrid component to conditionally show edit buttons
  - Add userRole prop to ExerciseGrid component
  - Hide edit button for global exercises when user is not admin
  - Add visual indicators to distinguish editable vs read-only exercises
  - _Requirements: 2.2, 2.3_

- [x] 4. Update ExerciseOrganizer component to pass role information
  - Modify ExerciseOrganizer to accept and pass userRole prop
  - Update component to filter edit capabilities based on permissions
  - Ensure role information flows to child components
  - _Requirements: 2.2, 2.3_

- [x] 5. Enhance ExerciseCreationModal with permission validation
  - Add client-side validation to prevent unauthorized edit attempts
  - Display appropriate error messages for non-admin users
  - Implement graceful handling of permission-denied scenarios
  - _Requirements: 2.1, 2.2_

- [x] 6. Update Exercises page to provide user role context
  - Pass user role information to ExerciseOrganizer component
  - Ensure proper role data is available throughout component tree
  - Handle cases where user role is not yet loaded
  - _Requirements: 2.2, 2.3_

- [ ] 7. Test the complete admin-only restriction implementation
  - Write unit tests for permission checking utilities
  - Test RLS policy enforcement with different user roles
  - Verify UI correctly hides/shows edit controls based on permissions
  - Test error handling for unauthorized edit attempts
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 3.3_