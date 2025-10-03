# Cache Key Patterns and Invalidation Requirements

This document provides comprehensive documentation of all cache key patterns used in the Training PWA application, along with their invalidation requirements and usage contexts.

## Overview

The application uses a multi-layered caching system with Supabase as the primary data source. Cache keys follow specific patterns based on data type, user context, and query parameters. Invalidation is handled through specialized functions that ensure data consistency across the application.

## Cache Key Pattern Categories

### User Data

#### `user_programs_all_including_coach_assigned_{userId}`
- **Description**: Caches all programs accessible to a user, including their own programs, template programs, and coach-assigned programs
- **When Used**: When fetching programs for display in the Programs page, program selection, and workout planning
- **Data Cached**: Complete program structures with workouts, exercises, and metadata
- **TTL**: 30 minutes
- **Invalidation Triggers**:
  - Program creation, update, or deletion
  - Coach assignment changes
  - Program progress updates
- **Related Patterns**: `program_enhanced_{programId}`, `template_programs_all`

#### `exercises_user_{userId}`
- **Description**: Caches all exercises available to a user (global + user-created)
- **When Used**: When displaying exercise selection dialogs, program creation, and workout logging
- **Data Cached**: Exercise metadata including name, muscle groups, instructions, and ownership
- **TTL**: 30 minutes
- **Invalidation Triggers**:
  - Exercise creation, update, or deletion
  - User exercise permissions changes
- **Related Patterns**: `exercises_global_all`, `available_exercises_{userId}_{filters}`

#### `workout_logs_recent_{userId}`
- **Description**: Caches recent workout logs for quick access
- **When Used**: Dashboard display, recent activity views, progress tracking
- **Data Cached**: Recent workout log entries with basic metadata
- **TTL**: 15 minutes
- **Invalidation Triggers**:
  - New workout completion
  - Workout log updates or deletion
- **Related Patterns**: `workout_log_{userId}_{programId}_{weekIndex}_{dayIndex}`

#### `user_analytics_{userId}`
- **Description**: Caches user analytics and progress data
- **When Used**: Analytics dashboard, progress reports, coach monitoring
- **Data Cached**: Aggregated workout statistics, progress metrics, and performance data
- **TTL**: 15 minutes
- **Invalidation Triggers**:
  - Workout completion
  - Analytics recalculation
  - User profile updates
- **Related Patterns**: `coach_completion_analytics_{coachId}_{timeframe}_{includeInactive}`

### Programs

#### `program_enhanced_{programId}`
- **Description**: Caches detailed program information with complete workout structure
- **When Used**: Program editing, detailed program views, workout execution
- **Data Cached**: Full program data including workouts, exercises, and program metadata
- **TTL**: 30 minutes
- **Invalidation Triggers**:
  - Program content updates
  - Exercise additions/removals
  - Program metadata changes
- **Related Patterns**: `user_programs_all_including_coach_assigned_{userId}`, `program_workout_logs_{userId}_{programId}`

#### `template_programs_all`
- **Description**: Caches all available template programs
- **When Used**: Program creation from templates, template selection
- **Data Cached**: Template program structures and metadata
- **TTL**: 60 minutes
- **Invalidation Triggers**:
  - Template program updates (rare)
  - New template creation
- **Related Patterns**: `user_programs_all_including_coach_assigned_{userId}`

#### `program_workout_logs_{userId}_{programId}`
- **Description**: Caches workout logs associated with a specific program
- **When Used**: Program progress tracking, workout history within program context
- **Data Cached**: Workout logs filtered by program
- **TTL**: 15 minutes
- **Invalidation Triggers**:
  - New workout completion in program
  - Workout log updates
- **Related Patterns**: `workout_logs_recent_{userId}`, `workout_log_{userId}_{programId}_{weekIndex}_{dayIndex}`

### Exercises

#### `exercises_global_all`
- **Description**: Caches all globally available exercises
- **When Used**: Exercise selection, global exercise management
- **Data Cached**: Complete global exercise database
- **TTL**: 60 minutes
- **Invalidation Triggers**:
  - Global exercise updates
  - New global exercise creation
- **Related Patterns**: `exercises_user_{userId}`, `available_exercises_{userId}_{filters}`

#### `available_exercises_{userId}_{filters}`
- **Description**: Caches filtered exercise lists for specific users
- **When Used**: Exercise search and filtering in program creation
- **Data Cached**: Exercises matching filter criteria for the user
- **TTL**: 30 minutes
- **Invalidation Triggers**:
  - Exercise creation/update/deletion
  - User permission changes
- **Related Patterns**: `exercises_user_{userId}`, `exercises_global_all`

#### `muscle_groups_global`
- **Description**: Caches available muscle groups for exercise categorization
- **When Used**: Exercise filtering, muscle group selection
- **Data Cached**: List of muscle group options
- **TTL**: 60 minutes (rarely changes)
- **Invalidation Triggers**:
  - New muscle group additions (rare)
- **Related Patterns**: `exercises_global_all`

### Workout Logs

#### `{weekIndex}_{dayIndex}` (Program Logs Cache)
- **Description**: Caches workout log IDs for specific program week/day combinations
- **When Used**: Workout execution, log retrieval for specific program positions
- **Data Cached**: Workout log ID and metadata for program-based workouts
- **TTL**: Based on cache manager settings (default 1 hour)
- **Invalidation Triggers**:
  - Workout completion
  - Cache validation failures
  - Manual invalidation on conflicts
- **Related Patterns**: `workout_log_{userId}_{programId}_{weekIndex}_{dayIndex}`

#### `workout_log_{userId}_{programId}_{weekIndex}_{dayIndex}`
- **Description**: Caches complete workout log data for specific program positions
- **When Used**: Detailed workout log retrieval, progress tracking
- **Data Cached**: Full workout log with exercises, sets, reps, weights
- **TTL**: 15 minutes
- **Invalidation Triggers**:
  - Workout updates
  - Exercise changes within workout
- **Related Patterns**: `{weekIndex}_{dayIndex}`, `workout_logs_recent_{userId}`

#### `workout_logs_drafts_{userId}`
- **Description**: Caches draft workout logs for quick access
- **When Used**: Draft workout management, incomplete workout recovery
- **Data Cached**: Unfinished workout drafts
- **TTL**: 15 minutes
- **Invalidation Triggers**:
  - Draft completion
  - Draft cleanup operations
- **Related Patterns**: `workout_logs_recent_{userId}`

#### `workout_logs_progress_{userId}_{startDate}_{endDate}_{limit}_{includeDrafts}_{programId}`
- **Description**: Caches filtered workout log progress data
- **When Used**: Progress analytics, workout history filtering
- **Data Cached**: Workout logs matching date/program filters
- **TTL**: 15 minutes
- **Invalidation Triggers**:
  - New workout completion
  - Workout updates in date range
- **Related Patterns**: `workout_logs_recent_{userId}`, `program_workout_logs_{userId}_{programId}`

### Analytics

#### `coach_program_progress_{coachId}_{clientId}_{programId}`
- **Description**: Caches coach-specific program progress data
- **When Used**: Coach dashboard, client progress monitoring
- **Data Cached**: Program completion metrics, workout statistics
- **TTL**: 15 minutes
- **Invalidation Triggers**:
  - Client workout completion
  - Program updates
- **Related Patterns**: `coach_completion_analytics_{coachId}_{timeframe}_{includeInactive}`

#### `coach_completion_analytics_{coachId}_{timeframe}_{includeInactive}`
- **Description**: Caches coach analytics for client completion rates
- **When Used**: Coach performance dashboards, client engagement metrics
- **Data Cached**: Completion statistics across clients and timeframes
- **TTL**: 15 minutes
- **Invalidation Triggers**:
  - Client workout activities
  - Client status changes
- **Related Patterns**: `coach_program_progress_{coachId}_{clientId}_{programId}`

#### `coach_effectiveness_report_{coachId}_{timeframe}_{includeClientDetails}_{minWorkouts}`
- **Description**: Caches detailed coach effectiveness metrics
- **When Used**: Coach performance analysis, detailed reporting
- **Data Cached**: Comprehensive effectiveness statistics and client details
- **TTL**: 15 minutes
- **Invalidation Triggers**:
  - Client workout data changes
  - Coach-client relationship updates
- **Related Patterns**: `coach_completion_analytics_{coachId}_{timeframe}_{includeInactive}`

#### `exercise_history_{userId}_{exerciseId}_{limit}`
- **Description**: Caches exercise-specific workout history
- **When Used**: Exercise progress tracking, performance analytics
- **Data Cached**: Historical workout data for specific exercises
- **TTL**: 15 minutes
- **Invalidation Triggers**:
  - New workouts with the exercise
  - Exercise data updates
- **Related Patterns**: `workout_logs_progress_{userId}_{startDate}_{endDate}_{limit}_{includeDrafts}_{programId}`

### Multi-Key Scenarios

#### Auth-Related Caching
- **Patterns**: `auth_user`, `auth_session`
- **Description**: Caches authentication state and session data
- **When Used**: User authentication, session management
- **Data Cached**: User authentication tokens, session metadata
- **TTL**: 5 minutes
- **Invalidation Triggers**:
  - User logout
  - Token expiration
  - Authentication state changes

#### Collection-Based Caching (Migration Layer)
- **Patterns**: Generated via `generateCacheKey('collection', tableName, queryParams)`
- **Description**: Legacy caching layer for collection queries
- **When Used**: Data migration and legacy compatibility
- **Data Cached**: Query results from collection operations
- **TTL**: 5 minutes (default)
- **Invalidation Triggers**:
  - Data updates in cached collections
  - Manual invalidation calls

#### Document-Based Caching (Migration Layer)
- **Patterns**: Generated via `generateCacheKey('doc', 'table/id')`
- **Description**: Legacy caching for individual document queries
- **When Used**: Single document retrieval during migration
- **Data Cached**: Individual document data
- **TTL**: 5 minutes (default)
- **Invalidation Triggers**:
  - Document updates
  - Document deletion

## Invalidation Functions

### Primary Invalidation Functions

#### `invalidateUserCache(userId)`
- **Purpose**: Invalidates all user-specific caches
- **Parameters**: `userId` (string) - User identifier
- **Invalidates Patterns**:
  - `workout_logs*` (all workout-related caches)
  - `programs*` (all program-related caches)
  - `user_analytics*` (all analytics caches)
- **Usage**: Called after user data changes, profile updates, or major user actions
- **Example**:
  ```javascript
  import { invalidateUserCache } from '../api/supabaseCache';
  invalidateUserCache(userId);
  ```

#### `invalidateWorkoutCache(userId)`
- **Purpose**: Invalidates workout-specific caches for a user
- **Parameters**: `userId` (string) - User identifier
- **Invalidates Patterns**:
  - `workout_logs*` (all workout log caches)
- **Usage**: Called after workout completion, updates, or deletions
- **Example**:
  ```javascript
  import { invalidateWorkoutCache } from '../api/supabaseCache';
  invalidateWorkoutCache(userId);
  ```

#### `invalidateProgramCache(userId)`
- **Purpose**: Invalidates program-related caches using tags
- **Parameters**: `userId` (string) - User identifier
- **Invalidates Patterns**:
  - All caches with `tags: ['programs']` and matching `userId`
- **Usage**: Called after program creation, updates, or assignment changes
- **Example**:
  ```javascript
  import { invalidateProgramCache } from '../api/supabaseCache';
  invalidateProgramCache(userId);
  ```

#### `invalidateExerciseCache()`
- **Purpose**: Invalidates all exercise-related caches globally
- **Parameters**: None
- **Invalidates Patterns**:
  - `exercises*` (all exercise caches)
- **Usage**: Called after exercise creation, updates, or deletions
- **Example**:
  ```javascript
  import { invalidateExerciseCache } from '../api/supabaseCache';
  invalidateExerciseCache();
  ```

### Advanced Invalidation Methods

#### `supabaseCache.invalidate(patterns, options)`
- **Purpose**: Core invalidation method with flexible pattern matching
- **Parameters**:
  - `patterns` (array|string): Cache key patterns to invalidate
  - `options` (object): Invalidation options
    - `exact` (boolean): Exact match vs pattern matching
    - `userId` (string): Filter by user ID
    - `tables` (array): Filter by table names
    - `tags` (array): Filter by cache tags
    - `reason` (string): Invalidation reason for logging
- **Usage**: Advanced invalidation with filtering
- **Example**:
  ```javascript
  import { supabaseCache } from '../api/supabaseCache';

  // Invalidate specific patterns
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

#### `invalidateUserExerciseCache(userId)`
- **Purpose**: Invalidates user-specific exercise caches
- **Parameters**: `userId` (string) - User identifier
- **Invalidates Patterns**:
  - Caches with `tags: ['exercises', 'user']` and matching `userId`
- **Usage**: Targeted exercise cache invalidation for specific users

#### `invalidateUserProgramCache(userId)`
- **Purpose**: Invalidates user-specific program caches
- **Parameters**: `userId` (string) - User identifier
- **Invalidates Patterns**:
  - Caches with `tags: ['programs', 'user']` and matching `userId`
- **Usage**: Targeted program cache invalidation for specific users

### Cache Manager Invalidation

#### `cacheManager.invalidate(key, cacheStore, setCacheStore, options)`
- **Purpose**: Invalidates specific workout log cache entries
- **Parameters**:
  - `key` (string): Cache key in format `{weekIndex}_{dayIndex}`
  - `cacheStore`: Cache store object
  - `setCacheStore`: Cache store setter function
  - `options`: Invalidation options
- **Usage**: Program-specific workout log invalidation
- **Example**:
  ```javascript
  import { WorkoutLogCacheManager } from '../utils/cacheManager';
  const cacheManager = new WorkoutLogCacheManager();

  await cacheManager.invalidate('1_2', programLogs, setProgramLogs, {
    reason: 'workout-completed'
  });
  ```

## Cache Warming Strategies

### `warmUserCache(userId, priority)`
- **Purpose**: Pre-loads commonly accessed user data
- **Parameters**:
  - `userId` (string): User identifier
  - `priority` (string): 'high', 'normal', or 'low'
- **Warms Caches**:
  - `user_programs_all_including_coach_assigned_{userId}`
  - `exercises_user_{userId}`
  - `workout_logs_recent_{userId}`
- **Usage**: Called on user login or app startup

### `warmAppCache()`
- **Purpose**: Pre-loads global application data
- **Parameters**: None
- **Warms Caches**:
  - `exercises_global_all`
  - `template_programs_all`
- **Usage**: Called on application startup

## Best Practices

### Invalidation Timing
1. **Immediate Invalidation**: Always invalidate caches immediately after data mutations
2. **User Context**: Include userId in invalidation calls for user-specific data
3. **Reason Logging**: Provide descriptive reasons for invalidation operations
4. **Batch Operations**: Group related invalidations to minimize cache misses

### Cache Key Design
1. **User Scoping**: Include userId in keys for user-specific data
2. **Parameter Encoding**: Serialize complex parameters consistently
3. **Pattern Consistency**: Follow established naming conventions
4. **TTL Appropriateness**: Set TTL based on data volatility

### Monitoring and Debugging
1. **Cache Statistics**: Monitor hit rates and invalidation patterns
2. **Logging**: Enable cache operation logging for debugging
3. **Performance**: Regularly review cache performance metrics
4. **Cleanup**: Implement automatic cleanup for expired entries

## Implementation Notes

- Cache keys are generated using `JSON.stringify()` for complex parameter objects
- The system supports both exact matching and pattern-based invalidation
- Cache entries include metadata for debugging and performance monitoring
- Automatic cleanup runs every 5 minutes to remove expired entries
- Memory monitoring prevents cache from exceeding configured limits