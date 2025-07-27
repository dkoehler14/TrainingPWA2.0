# Real-time Workout Features

This document describes the real-time capabilities added to the workout logging system.

## Overview

The real-time workout features provide live updates during workout sessions, including:

- **Live Progress Updates**: See workout progress in real-time as sets are completed
- **Connection Management**: Automatic reconnection on network issues
- **Multi-user Support**: See when other users are working on the same workout
- **Optimistic Updates**: Immediate UI feedback with server synchronization

## Components

### 1. useWorkoutRealtime Hook

The main hook that provides real-time capabilities for workout sessions.

```javascript
import useWorkoutRealtime from '../hooks/useWorkoutRealtime'

const realtimeHook = useWorkoutRealtime(
  userId,
  programId,
  weekIndex,
  dayIndex,
  {
    enabled: true,
    onUpdate: (update) => {
      console.log('Real-time update:', update)
    },
    onError: (error) => {
      console.error('Connection error:', error)
    },
    onConnectionChange: (connected, status) => {
      console.log('Connection status:', connected, status)
    }
  }
)
```

#### Features:
- **Connection Status**: `isConnected`, `connectionError`
- **Update Tracking**: `lastUpdate` with timestamp and type
- **Connection Management**: `connect()`, `disconnect()`, `reconnect()`
- **Broadcasting**: `broadcastProgress()` for sending updates
- **Presence**: `updatePresence()`, `getPresence()` for multi-user awareness

### 2. useWorkoutProgressBroadcast Hook

Helper hook for broadcasting specific workout events.

```javascript
import { useWorkoutProgressBroadcast } from '../hooks/useWorkoutRealtime'

const progressBroadcast = useWorkoutProgressBroadcast(realtimeHook)

// Broadcast set completion
progressBroadcast.broadcastSetCompletion(exerciseIndex, setIndex, completed, {
  exerciseId: 'exercise-123',
  exerciseName: 'Bench Press',
  reps: 10,
  weight: 135
})

// Broadcast exercise completion
progressBroadcast.broadcastExerciseCompletion(exerciseIndex, completed)

// Broadcast overall workout progress
progressBroadcast.broadcastWorkoutProgress(completedSets, totalSets)
```

### 3. WorkoutRealtimeIndicator Component

Visual indicator showing connection status and real-time activity.

```javascript
import WorkoutRealtimeIndicator from '../components/WorkoutRealtimeIndicator'

<WorkoutRealtimeIndicator 
  realtimeHook={realtimeHook}
  showProgress={true}
  showPresence={true}
  className="ms-auto"
/>
```

#### Features:
- **Connection Status**: Green (connected), Yellow (disconnected), Red (error)
- **Progress Updates**: Shows recent activity with animations
- **User Presence**: Displays number of active users
- **Error Recovery**: Click to retry connection on errors

## Real-time Events

### Database Changes
- `INSERT`: New workout log created
- `UPDATE`: Workout log or exercises updated
- `DELETE`: Workout log deleted

### Broadcast Events
- `set_completion`: Set marked as complete/incomplete
- `exercise_completion`: Exercise completed
- `workout_progress`: Overall progress update
- `workout_completed`: Workout finished
- `set_added`/`set_removed`: Sets added/removed
- `exercise_added`/`exercise_removed`: Exercises added/removed

## Integration in LogWorkout Component

The LogWorkout component integrates real-time features as follows:

### 1. Hook Initialization
```javascript
const realtimeHook = useWorkoutRealtime(
  user?.id,
  selectedProgram?.id,
  selectedWeek,
  selectedDay,
  {
    enabled: true,
    onUpdate: (update) => {
      // Handle real-time updates
      showUserMessage('Workout updated in real-time', 'info')
    }
  }
)
```

### 2. Progress Broadcasting
```javascript
const handleChange = (exerciseIndex, setIndex, value, field) => {
  // ... existing logic ...
  
  if (field === 'completed') {
    // Broadcast set completion
    progressBroadcast.broadcastSetCompletion(
      exerciseIndex, 
      setIndex, 
      !wasCompleted,
      { exerciseId, exerciseName, reps, weight }
    )
    
    // Broadcast overall progress
    progressBroadcast.broadcastWorkoutProgress(completedSets, totalSets)
  }
}
```

### 3. UI Integration
```javascript
<div className="d-flex justify-content-between align-items-center mb-3">
  <h1 className="soft-title mb-0">Log Workout</h1>
  <WorkoutRealtimeIndicator 
    realtimeHook={realtimeHook}
    showProgress={true}
    showPresence={true}
  />
</div>
```

## Connection Management

### Automatic Reconnection
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
- Maximum 5 reconnection attempts
- Reset on successful connection

### Error Recovery
- Network errors: Automatic retry
- Authentication errors: User notification
- Server errors: Graceful degradation

### Connection Monitoring
- Heartbeat every 30 seconds
- Connection status indicators
- Performance monitoring in development

## Performance Considerations

### Optimizations
- Debounced updates (1 second for auto-save)
- Efficient data structures
- Minimal re-renders
- Connection pooling

### Bandwidth Usage
- Only essential data broadcasted
- Compressed payloads
- Rate limiting (10 events/second)

### Battery Life
- Adaptive heartbeat intervals
- Background connection management
- Efficient event handling

## Testing

### Manual Testing
```javascript
import { runRealtimeTests } from '../utils/testRealtimeFeatures'

// Test all real-time features
const results = await runRealtimeTests(userId, programId, weekIndex, dayIndex)
console.log('Test results:', results)
```

### Test Scenarios
1. **Connection Test**: Verify Supabase real-time connection
2. **Broadcast Test**: Test message broadcasting
3. **Subscription Test**: Test database change subscriptions
4. **Recovery Test**: Test reconnection after network loss
5. **Multi-user Test**: Test presence and conflict resolution

## Troubleshooting

### Common Issues

#### Connection Fails
- Check Supabase configuration
- Verify network connectivity
- Check browser console for errors

#### Updates Not Received
- Verify channel subscription
- Check user permissions
- Confirm database triggers

#### Performance Issues
- Monitor connection count
- Check for memory leaks
- Optimize update frequency

### Debug Mode
Enable debug logging in development:
```javascript
const realtimeHook = useWorkoutRealtime(userId, programId, weekIndex, dayIndex, {
  debug: true // Enables verbose logging
})
```

## Security Considerations

### Row Level Security (RLS)
- All real-time subscriptions respect RLS policies
- Users can only see their own workout data
- Presence information is anonymized

### Data Validation
- All broadcast messages validated
- Malicious payloads filtered
- Rate limiting prevents abuse

### Privacy
- No sensitive data in presence updates
- Workout details only visible to owner
- Connection metadata minimized

## Future Enhancements

### Planned Features
- **Collaborative Workouts**: Multiple users on same workout
- **Coach Monitoring**: Real-time coaching capabilities
- **Workout Sharing**: Live workout streaming
- **Advanced Analytics**: Real-time performance metrics

### Technical Improvements
- **Offline Support**: Queue updates when offline
- **Conflict Resolution**: Advanced merge strategies
- **Performance Metrics**: Real-time performance tracking
- **Mobile Optimization**: Battery and bandwidth optimization

## API Reference

### useWorkoutRealtime Hook

```typescript
interface UseWorkoutRealtimeOptions {
  enabled?: boolean
  onUpdate?: (update: RealtimeUpdate) => void
  onError?: (error: Error) => void
  onConnectionChange?: (connected: boolean, status: string) => void
  autoReconnect?: boolean
  heartbeatInterval?: number
}

interface RealtimeUpdate {
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'BROADCAST'
  data: any
  timestamp: string
}

const useWorkoutRealtime: (
  userId: string,
  programId: string,
  weekIndex: number,
  dayIndex: number,
  options?: UseWorkoutRealtimeOptions
) => {
  isConnected: boolean
  connectionError: Error | null
  lastUpdate: RealtimeUpdate | null
  connect: () => void
  disconnect: () => void
  reconnect: () => void
  broadcastProgress: (data: any) => void
  updatePresence: (data: any) => void
  getPresence: () => any
  channelName: string
  reconnectAttempts: number
}
```

### WorkoutRealtimeIndicator Props

```typescript
interface WorkoutRealtimeIndicatorProps {
  realtimeHook: ReturnType<typeof useWorkoutRealtime>
  showProgress?: boolean
  showPresence?: boolean
  className?: string
}
```