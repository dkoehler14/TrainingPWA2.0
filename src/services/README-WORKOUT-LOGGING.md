# Workout Logging Service Documentation

This document describes the Supabase-based workout logging service that replaces the Firebase/Firestore implementation as part of the migration to PostgreSQL.

## Overview

The workout logging service provides comprehensive functionality for:
- Creating and managing workout logs with exercise relationships
- Draft workout management and completion flow
- Workout analytics calculation and retrieval
- Exercise history tracking
- Real-time updates and caching integration

## Services

### 1. WorkoutLogService (`workoutLogService.js`)

The main service that handles all workout logging operations with PostgreSQL backend.

#### Key Methods

##### CRUD Operations

```javascript
import workoutLogService from './workoutLogService'

// Create a new workout log
const workoutLog = await workoutLogService.createWorkoutLog(userId, {
  programId: 'program-123',
  weekIndex: 0,
  dayIndex: 1,
  name: 'Push Day',
  type: 'program_workout',
  exercises: [
    {
      exerciseId: 'bench-press-123',
      sets: 3,
      reps: [10, 8, 6],
      weights: [135, 145, 155],
      completed: [true, true, true],
      notes: 'Good form'
    }
  ]
})

// Get workout log by program, week, and day
const log = await workoutLogService.getWorkoutLog(userId, programId, weekIndex, dayIndex)

// Update workout log
const updated = await workoutLogService.updateWorkoutLog(workoutLogId, {
  name: 'Updated Workout',
  isFinished: true,
  exercises: updatedExercises
})

// Delete workout log
await workoutLogService.deleteWorkoutLog(workoutLogId)
```

##### Draft Management

```javascript
// Save workout as draft
const draft = await workoutLogService.saveDraft(userId, exercises, 'My Draft')

// Get single draft for user
const currentDraft = await workoutLogService.getSingleDraft(userId)

// Complete draft workout
const completed = await workoutLogService.completeDraft(
  userId, 
  draftId, 
  exercises, 
  'Completed Workout'
)

// Clean up old drafts
await workoutLogService.cleanupOldDrafts(userId, 7) // 7 days threshold
```

##### Analytics and History

```javascript
// Get exercise history
const history = await workoutLogService.getExerciseHistory(userId, exerciseId, 50)

// Get user analytics
const analytics = await workoutLogService.getUserAnalytics(userId, exerciseId)

// Get workout statistics
const stats = await workoutLogService.getWorkoutStats(userId, '30d')
```

### 2. SupabaseQuickWorkoutDraftService (`supabaseWorkoutDraftService.js`)

A compatibility layer that maintains the same API as the Firebase-based quick workout draft service.

#### Migration-Friendly API

```javascript
import supabaseQuickWorkoutDraftService from './supabaseWorkoutDraftService'

// Same API as Firebase version - no code changes needed!
const draft = await supabaseQuickWorkoutDraftService.saveDraft(
  userId, 
  exercises, 
  workoutName
)

const singleDraft = await supabaseQuickWorkoutDraftService.getSingleDraft(userId)
const allDrafts = await supabaseQuickWorkoutDraftService.loadDrafts(userId, 5)
```

## Data Models

### Workout Log Structure

```typescript
interface WorkoutLog {
  id: string
  user_id: string
  program_id?: string
  week_index?: number
  day_index?: number
  name?: string
  type: string
  date: string
  completed_date?: string
  is_finished: boolean
  is_draft: boolean
  weight_unit: 'LB' | 'KG'
  duration?: number
  notes?: string
  workout_log_exercises: WorkoutLogExercise[]
}

interface WorkoutLogExercise {
  id: string
  workout_log_id: string
  exercise_id: string
  sets: number
  reps: number[]
  weights: number[]
  completed: boolean[]
  bodyweight?: number
  notes?: string
  is_added: boolean
  added_type?: string
  original_index: number
  order_index: number
}
```

### Analytics Structure

```typescript
interface UserAnalytics {
  id: string
  user_id: string
  exercise_id: string
  total_volume: number
  max_weight: number
  total_reps: number
  total_sets: number
  last_workout_date: string
  pr_date: string
}
```

## Exercise Type Support

The service supports different exercise types with proper weight calculations:

### 1. Regular Exercises (Barbell, Dumbbell, etc.)
- Volume = weight × reps
- Display weight = actual weight

### 2. Bodyweight Exercises
- Volume = bodyweight × reps
- Display weight = bodyweight
- Weight field is ignored

### 3. Bodyweight Loadable Exercises
- Volume = (bodyweight + additional weight) × reps
- Display weight = "bodyweight + weight = total"
- Both bodyweight and additional weight are considered

## Error Handling

The service includes comprehensive error handling:

```javascript
try {
  const result = await workoutLogService.createWorkoutLog(userId, workoutData)
} catch (error) {
  if (error.name === 'SupabaseConnectionError') {
    // Handle connection issues
  } else if (error.message.includes('Invalid parameters')) {
    // Handle validation errors
  } else {
    // Handle other errors
  }
}
```

## Real-time Updates

The service supports real-time updates through Supabase subscriptions:

```javascript
// Example of setting up real-time workout updates
const subscription = supabase
  .channel('workout_logs')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'workout_logs',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      console.log('Workout log change:', payload)
      // Handle real-time updates
    }
  )
  .subscribe()
```

## Migration from Firebase

### Step 1: Update Imports

```javascript
// Before (Firebase)
import quickWorkoutDraftService from './quickWorkoutDraftService'

// After (Supabase)
import supabaseQuickWorkoutDraftService from './supabaseWorkoutDraftService'
```

### Step 2: Update Service Calls

Most API calls remain the same due to the compatibility layer:

```javascript
// This works with both Firebase and Supabase versions
const draft = await draftService.saveDraft(userId, exercises, workoutName)
const singleDraft = await draftService.getSingleDraft(userId)
```

### Step 3: Handle Data Format Differences

The Supabase service automatically transforms data to match Firebase format for compatibility.

## Performance Considerations

### Caching
- Exercise metadata is cached for 1 hour
- Workout logs are cached for 15 minutes
- Draft data is cached for 5 minutes

### Query Optimization
- Uses proper PostgreSQL indexes
- Implements efficient joins for related data
- Supports pagination for large datasets

### Connection Management
- Automatic retry logic with exponential backoff
- Connection pooling through Supabase
- Proper error handling and recovery

## Testing

The service includes comprehensive tests:

```bash
# Run unit tests
npm test -- --testPathPattern="workoutLogService"

# Run integration tests
npm test -- --testPathPattern="workoutLogService.integration"

# Run demo
node src/services/__tests__/workoutLogService.demo.js
```

## Database Schema

The service works with the following PostgreSQL tables:

- `workout_logs` - Main workout log records
- `workout_log_exercises` - Exercise data within workouts
- `user_analytics` - Aggregated user exercise statistics
- `exercises` - Exercise definitions
- `users` - User profiles

See the design document for complete schema definitions.

## Environment Configuration

Ensure proper Supabase configuration:

```env
REACT_APP_USE_SUPABASE=true
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
```

## Best Practices

1. **Always validate user input** before calling service methods
2. **Handle errors gracefully** with proper user feedback
3. **Use caching appropriately** to reduce database load
4. **Clean up old drafts regularly** to maintain performance
5. **Monitor analytics updates** to ensure data consistency
6. **Test with different exercise types** to verify calculations

## Troubleshooting

### Common Issues

1. **"Invalid parameters" errors**: Check that all required fields are provided
2. **Connection timeouts**: Verify Supabase configuration and network connectivity
3. **Data transformation errors**: Ensure exercise data matches expected format
4. **Analytics calculation issues**: Verify exercise type and weight data

### Debug Mode

Enable debug logging in development:

```javascript
// In development, detailed logs are available
console.log('Supabase operation:', operation, result)
```

## Future Enhancements

Planned improvements include:
- Batch operations for better performance
- Advanced analytics with trend analysis
- Offline support with sync capabilities
- Enhanced real-time collaboration features
- Machine learning-based workout recommendations