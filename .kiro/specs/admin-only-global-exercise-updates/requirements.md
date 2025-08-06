# Requirements Document

## Introduction

This feature restricts the ability to update global exercises to only users with admin role privileges. Currently, any authenticated user can update global exercises, which poses a security risk and could lead to unauthorized modifications of system-wide exercise data.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want only admin users to be able to edit global exercises, so that the integrity of the global exercise database is maintained.

#### Acceptance Criteria

1. WHEN a non-admin user attempts to edit a global exercise THEN the system SHALL prevent the update operation
2. WHEN an admin user attempts to edit a global exercise THEN the system SHALL allow the update operation
3. WHEN a user attempts to edit their own custom exercise THEN the system SHALL allow the update operation regardless of admin status

### Requirement 2

**User Story:** As a regular user, I want to see appropriate feedback when I cannot edit a global exercise, so that I understand why the action is restricted.

#### Acceptance Criteria

1. WHEN a non-admin user clicks edit on a global exercise THEN the system SHALL display an appropriate error message
2. WHEN a non-admin user sees global exercises THEN the edit button SHALL be hidden or disabled for global exercises
3. WHEN an admin user sees global exercises THEN the edit button SHALL be visible and functional

### Requirement 3

**User Story:** As a developer, I want the database-level security to enforce admin-only global exercise updates, so that the restriction cannot be bypassed through API manipulation.

#### Acceptance Criteria

1. WHEN the database RLS policy is evaluated for global exercise updates THEN it SHALL check the user's admin role status
2. WHEN a non-admin user attempts to update a global exercise via direct API call THEN the database SHALL reject the operation
3. WHEN the users table is queried for role verification THEN it SHALL return accurate role information for the authenticated user