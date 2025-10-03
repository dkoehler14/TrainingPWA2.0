# Cache Invalidation Developer Guidelines

This document provides comprehensive guidelines for implementing cache invalidation in new features for the Training PWA application. Proper cache invalidation ensures data consistency across the application and prevents stale data from being served to users.

## Overview

The application uses a multi-layered caching system with Supabase as the primary data source. Cache invalidation is critical to maintain data integrity when data is modified. All data mutations must be followed by appropriate cache invalidation calls.

## When to Add Invalidation

### Always Invalidate After Data Mutations

Cache invalidation must be called immediately after any database write operation:

- **Create operations**: New records require invalidation of related caches
- **Update operations**: Modified records require invalidation of affected caches
- **Delete operations**: Removed records require invalidation of related caches
- **Bulk operations**: Multiple record changes require comprehensive invalidation

### Data Dependency Analysis

Before implementing invalidation, identify all cache keys that may be affected:

1. **Direct dependencies**: Caches containing the modified data
2. **Indirect dependencies**: Caches that aggregate or reference the modified data
3. **User-specific caches**: All caches scoped to affected users
4. **Global caches**: Application-wide caches that may include the data

### Timing Considerations

- **Immediate invalidation**: Always invalidate immediately after successful database operations
- **Batch operations**: Group related invalidations to minimize cache misses
- **Error handling**: Ensure invalidation occurs even if subsequent operations fail

## Which Invalidation Function to Use

### Primary Invalidation Functions

#### `invalidateUserCache(userId)`

**Purpose**: Invalidates all user-specific caches for comprehensive data refresh.

**When to use**:
- User profile updates
- User preference changes
- Major user data modifications
- Account-related changes

**Invalidates**:
- `workout_logs*` (all workout-related caches)
- `programs*` (all program-related caches)
- `user_analytics*` (all analytics caches)

**Example**:
```javascript
import { invalidateUserCache } from '../api/supabaseCache';

// After updating user profile
await updateUserProfile(userId, profileData);
invalidateUserCache(userId);
```

#### `invalidateWorkoutCache(userId)`

**Purpose**: Invalidates workout-specific caches for a user.

**When to use**:
- New workout completion
- Workout log updates or deletions
- Exercise changes within workouts
- Workout progress modifications

**Invalidates**:
- `workout_logs*` (all workout log caches)

**Example**:
```javascript
import { invalidateWorkoutCache } from '../api/supabaseCache';

// After completing a workout
await completeWorkout(workoutData);
invalidateWorkoutCache(userId);
```

#### `invalidateProgramCache(userId)`

**Purpose**: Invalidates program-related caches using tags for targeted invalidation.

**When to use**:
- Program creation, updates, or deletion
- Program assignment changes
- Exercise additions/removals from programs
- Program progress updates

**Invalidates**:
- All caches with `tags: ['programs']` and matching `userId`

**Example**:
```javascript
import { invalidateProgramCache } from '../api/supabaseCache';

// After updating a program
await updateProgram(programId, updates);
invalidateProgramCache(userId);
```

#### `invalidateExerciseCache()`

**Purpose**: Invalidates all exercise-related caches globally.

**When to use**:
- Exercise creation, updates, or deletions
- Global exercise data changes
- Exercise permission modifications

**Invalidates**:
- `exercises*` (all exercise caches)

**Example**:
```javascript
import { invalidateExerciseCache } from '../api/supabaseCache';

// After creating a new exercise
await createExercise(exerciseData);
invalidateExerciseCache();
```

### Advanced Invalidation Methods

#### `supabaseCache.invalidate(patterns, options)`

**Purpose**: Core invalidation method with flexible pattern matching and filtering.

**Parameters**:
- `patterns`: Array of cache key patterns or specific keys
- `options`: Invalidation options including userId, tags, tables, and reason

**Example**:
```javascript
import { supabaseCache } from '../api/supabaseCache';

// Invalidate specific user workout logs
supabaseCache.invalidate(['workout_logs_recent_*'], {
  userId: userId,
  reason: 'user-logout'
});

// Invalidate by tags
supabaseCache.invalidate([], {
  tags: ['programs', 'user'],
  userId: userId,
  reason: 'program-update'
});
```

## Multi-User Considerations

### Coach-Client Relationships

When implementing features involving coaches and clients, ensure invalidation occurs for both parties:

```javascript
// After coach assigns program to client
await assignProgramToClient(programId, clientId);
invalidateProgramCache(coachId);  // Coach's program cache
invalidateProgramCache(clientId); // Client's program cache
```

### Shared Data Scenarios

For features involving shared or public data:

- **Global exercises**: Use `invalidateExerciseCache()` for all users
- **Template programs**: Consider invalidating for all affected users
- **Public analytics**: Invalidate user-specific caches appropriately

### Concurrent User Access

Consider race conditions when multiple users modify the same data:

- Implement optimistic locking where possible
- Use database constraints to prevent conflicts
- Ensure invalidation occurs after successful commits only

## Testing Requirements

### Unit Tests for Invalidation

Every service method that modifies data must include tests verifying cache invalidation:

```javascript
describe('createExercise', () => {
  it('should call invalidateExerciseCache when creating an exercise', async () => {
    // Mock database call
    mockSupabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'exercise-1', name: 'Test Exercise' },
            error: null
          })
        })
      })
    });

    await createExercise({ name: 'Test Exercise', primary_muscle_group: 'chest' });

    expect(mockInvalidateExerciseCache).toHaveBeenCalledWith();
    expect(mockInvalidateExerciseCache).toHaveBeenCalledTimes(1);
  });
});
```

### Integration Tests

Include integration tests that verify end-to-end cache behavior:

- Cache population after data creation
- Cache invalidation after data updates
- Cache serving correct data after invalidation
- Performance impact of invalidation operations

### Cache Consistency Tests

Test scenarios ensuring cache consistency:

- Multiple users accessing shared data
- Concurrent modifications
- Network failures during invalidation
- Cache recovery after invalidation

## Common Patterns

### Service Layer Invalidation

All service methods should follow this pattern:

```javascript
export async function createProgram(programData) {
  try {
    // Database operation
    const result = await supabase
      .from('programs')
      .insert(programData)
      .select()
      .single();

    if (result.error) throw result.error;

    // Cache invalidation
    invalidateProgramCache(programData.user_id);

    return result.data;
  } catch (error) {
    // Handle error
    throw error;
  }
}
```

### Bulk Operations

For bulk operations, batch invalidations efficiently:

```javascript
export async function bulkUpdateExercises(updates) {
  try {
    // Perform bulk update
    const results = await Promise.all(
      updates.map(update => updateExercise(update.id, update.data))
    );

    // Single invalidation call for all changes
    invalidateExerciseCache();

    return results;
  } catch (error) {
    throw error;
  }
}
```

### Conditional Invalidation

Use conditional invalidation based on operation scope:

```javascript
export async function updateExercise(exerciseId, updates, userId) {
  // Check if exercise is global or user-specific
  const exercise = await getExercise(exerciseId);

  const result = await supabase
    .from('exercises')
    .update(updates)
    .eq('id', exerciseId)
    .select()
    .single();

  if (result.error) throw result.error;

  // Invalidate based on scope
  if (exercise.is_global) {
    invalidateExerciseCache(); // Global invalidation
  } else {
    // User-specific invalidation using advanced method
    supabaseCache.invalidate([], {
      userId: userId,
      tags: ['exercises', 'user'],
      reason: 'exercise-update'
    });
  }

  return result.data;
}
```

## Code Review Checklist

### Invalidation Implementation

- [ ] **Immediate invalidation**: Cache invalidation occurs immediately after successful database operations
- [ ] **Correct function selection**: Appropriate invalidation function chosen based on data scope
- [ ] **User ID inclusion**: User-specific invalidation includes correct userId parameter
- [ ] **Multi-user handling**: Coach-client scenarios invalidate caches for all affected users
- [ ] **Error handling**: Invalidation occurs even if subsequent operations fail

### Testing Coverage

- [ ] **Unit tests**: Service methods include tests verifying invalidation calls
- [ ] **Mock verification**: Tests mock and verify invalidation function calls
- [ ] **Integration tests**: End-to-end tests verify cache behavior
- [ ] **Edge cases**: Tests cover error scenarios and edge cases

### Code Quality

- [ ] **Import statements**: Correct import of invalidation functions
- [ ] **Function placement**: Invalidation calls placed after database operations
- [ ] **Reason logging**: Invalidation calls include descriptive reasons
- [ ] **Documentation**: Code comments explain why invalidation is needed
- [ ] **Performance**: Invalidation strategy minimizes unnecessary cache clearing

### Data Consistency

- [ ] **Complete invalidation**: All affected cache patterns are invalidated
- [ ] **Dependency analysis**: Indirect dependencies are considered
- [ ] **Race conditions**: Concurrent access scenarios are handled
- [ ] **Recovery**: Application recovers correctly after invalidation
- [ ] **Monitoring**: Invalidation operations are logged and monitored

## Best Practices

### Performance Optimization

1. **Batch invalidations**: Group related invalidations to reduce cache misses
2. **Selective invalidation**: Use tags and userId filters for targeted invalidation
3. **Avoid over-invalidation**: Don't clear more cache than necessary
4. **Monitor impact**: Track invalidation performance and frequency

### Error Handling

1. **Idempotent operations**: Invalidation calls should be safe to repeat
2. **Graceful degradation**: Application continues functioning if invalidation fails
3. **Logging**: All invalidation operations should be logged with context
4. **Recovery**: Implement cache recovery mechanisms for failed invalidations

### Monitoring and Debugging

1. **Cache statistics**: Monitor cache hit rates and invalidation patterns
2. **Logging**: Enable detailed logging for invalidation operations
3. **Performance metrics**: Track the performance impact of invalidation
4. **Alerting**: Set up alerts for unusual invalidation patterns

### Documentation

1. **Code comments**: Document why specific invalidation is needed
2. **Change logs**: Update cache documentation when adding new patterns
3. **API documentation**: Document cache behavior in API specifications
4. **Migration guides**: Provide guidance for cache changes during deployments

## Examples

### New Feature: Exercise Templates

When implementing exercise templates that can be shared between users:

```javascript
// Service method
export async function createExerciseTemplate(templateData, creatorId) {
  const result = await supabase
    .from('exercise_templates')
    .insert({
      ...templateData,
      created_by: creatorId,
      is_public: templateData.is_public || false
    })
    .select()
    .single();

  if (result.error) throw result.error;

  // Invalidate exercise caches for all users if public
  if (result.data.is_public) {
    invalidateExerciseCache();
  } else {
    // Invalidate only for creator if private
    supabaseCache.invalidate([], {
      userId: creatorId,
      tags: ['exercises', 'templates'],
      reason: 'template-created'
    });
  }

  return result.data;
}
```

### New Feature: Workout Sharing

When implementing workout sharing between users:

```javascript
// Service method
export async function shareWorkout(workoutId, fromUserId, toUserIds) {
  // Create sharing records
  const sharingRecords = toUserIds.map(userId => ({
    workout_id: workoutId,
    shared_by: fromUserId,
    shared_with: userId,
    shared_at: new Date().toISOString()
  }));

  const result = await supabase
    .from('workout_shares')
    .insert(sharingRecords);

  if (result.error) throw result.error;

  // Invalidate caches for all affected users
  const allUserIds = [fromUserId, ...toUserIds];
  allUserIds.forEach(userId => {
    invalidateWorkoutCache(userId);
  });

  return result.data;
}
```

### New Feature: Program Analytics

When implementing program analytics that aggregate user data:

```javascript
// Service method
export async function updateProgramAnalytics(programId, userId) {
  // Recalculate analytics
  const analytics = await calculateProgramAnalytics(programId, userId);

  const result = await supabase
    .from('program_analytics')
    .upsert({
      program_id: programId,
      user_id: userId,
      ...analytics,
      last_updated: new Date().toISOString()
    });

  if (result.error) throw result.error;

  // Invalidate user analytics cache
  invalidateUserCache(userId);

  return result.data;
}
```

## Conclusion

Proper cache invalidation is essential for maintaining data consistency in the Training PWA. Always consider the data dependencies, choose the appropriate invalidation functions, handle multi-user scenarios correctly, and thoroughly test your implementation. Following these guidelines will ensure reliable cache behavior and prevent data inconsistency issues.