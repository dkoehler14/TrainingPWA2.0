# Design Document

## Overview

This design implements admin-only restrictions for global exercise updates through a multi-layered approach involving database-level Row Level Security (RLS) policies, frontend UI controls, and proper role-based access control validation.

## Architecture

The solution uses a defense-in-depth approach with three layers:

1. **Database Layer**: RLS policies enforce admin role checking at the database level
2. **Service Layer**: Exercise service validates permissions before attempting updates
3. **UI Layer**: Frontend conditionally shows/hides edit controls based on user role and exercise type

## Components and Interfaces

### Database Schema Changes

**RLS Policy Update**: Modify the existing exercise update policy to check for admin role:

```sql
-- Updated policy that requires admin role for global exercise updates
CREATE POLICY "Admin only global exercise updates" ON exercises
    FOR UPDATE USING (
        created_by = auth.uid() OR 
        (
            is_global = true AND 
            EXISTS (
                SELECT 1 FROM user 
                WHERE id = auth.uid() 
                AND role = 'admin'
            )
        )
    );
```

### Frontend Components

**ExerciseGrid Component**: 
- Add logic to conditionally show edit buttons based on user role and exercise type
- Hide edit button for global exercises when user is not admin

**ExerciseOrganizer Component**:
- Pass user role information to child components
- Filter edit capabilities based on permissions

**ExerciseCreationModal Component**:
- Add validation to prevent non-admin users from editing global exercises
- Display appropriate error messages for unauthorized attempts

### Service Layer

**exerciseService.js**:
- Add permission validation before update attempts
- Provide clear error messages for unauthorized operations
- Implement role checking utilities

## Data Models

### User Role Validation

```javascript
// Role checking utility
const canEditGlobalExercise = (userRole, exercise) => {
  if (!exercise.isGlobal) return true; // Anyone can edit custom exercises
  return userRole === 'admin'; // Only admins can edit global exercises
};
```

### Permission Context

```javascript
// Permission context for UI components
const exercisePermissions = {
  canEdit: (exercise, userRole) => {
    return !exercise.isGlobal || userRole === 'admin';
  },
  canDelete: (exercise, userRole, userId) => {
    return exercise.createdBy === userId || 
           (exercise.isGlobal && userRole === 'admin');
  }
};
```

## Error Handling

### Database Level Errors
- RLS policy violations return "insufficient privileges" errors
- Service layer catches and translates these to user-friendly messages

### Frontend Error Messages
- "You don't have permission to edit global exercises"
- "Only administrators can modify global exercises"
- "Contact an administrator to request changes to global exercises"

### Graceful Degradation
- Non-admin users see global exercises as read-only
- Edit buttons are hidden rather than showing error on click
- Clear visual indicators distinguish editable vs read-only exercises

## Testing Strategy

### Unit Tests
- Test RLS policy behavior with admin and non-admin users
- Test UI component rendering with different user roles
- Test service layer permission validation

### Integration Tests
- Test complete edit flow for admin users on global exercises
- Test blocked edit attempts for non-admin users
- Test custom exercise editing remains unaffected

### Security Tests
- Attempt direct API calls to bypass frontend restrictions
- Verify database-level enforcement of permissions
- Test role verification accuracy

## Implementation Considerations

### Migration Strategy
1. Update RLS policy in new migration file
2. Update frontend components to check permissions
3. Add service layer validation
4. Deploy and test with existing users

### Backward Compatibility
- Existing custom exercises remain fully editable by their creators
- Admin users retain all current capabilities
- Non-admin users lose global exercise editing (security improvement)

### Performance Impact
- Role checking adds minimal database query overhead
- Frontend permission checks are lightweight
- Caching user role information reduces repeated queries