# Real-time Workout Features

This document describes the enhanced real-time capabilities for the workout logging system using Supabase real-time subscriptions.

## Overview

The real-time workout features provide comprehensive live updates during workout sessions, including:

- **Live Progress Updates**: See workout progress in real-time as sets are completed
- **Enhanced Connection Management**: Automatic reconnection with exponential backoff and error classification
- **User-specific Data Subscriptions**: Secure, filtered real-time updates for individual users
- **Multi-user Support**: See when other users are working on the same workout
- **Optimistic Updates**: Immediate UI feedback with server synchronization
- **Performance Monitoring**: Connection quality tracking and health checks
- **Error Recovery**: Intelligent error handling and recovery strategies

## Components

### 1. Enhanced useWorkoutRealtime Hook

The main hook that provides comprehensive real-time capabilities for workout sessions with enhanced error handling and connection management.

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
      // Enhanced update object includes:
      // - type: 'INSERT' | 'UPDATE' | 'DELETE' | 'BROADCAST'
      // - table: 'workout_logs' | 'workout_log_exercises' | 'user_analytics'
      // - data: updated record
      // - oldData: previous record (for updates/deletes)
      // - timestamp: ISO timestamp
      // - userId: user who made the change
      // - workoutLogId: related workout log ID
    },
    onError: (error) => {
      console.error('Connection error:', error)
      // Enhanced error object includes:
      // - type: error classification
      // - timestamp: when error occurred
      // - channelName: affected channel
      // - reconnectAttempts: current retry count
    },
    onConnectionChange: (connected, status) => {
      console.log('Connection status:', connected, status)
    },
    autoReconnect: true,
    heartbeatInterval: 30000
  }
)
```

#### Enhanced Features:
- **Connection Status**: `isConnected`, `connectionError` with detailed error classification
- **Update Tracking**: `lastUpdate` with enhanced metadata and context
- **Connection Management**: `connect()`, `disconnect()`, `reconnect()` with intelligent retry logic
- **Broadcasting**: `broadcastProgress()` using centralized channel manager
- **Presence**: `updatePresence()`, `getPresence()` with async support
- **Error Classification**: Automatic categorization of connection errors
- **Retry Logic**: Exponential backoff with configurable limits
- **Channel Management**: Centralized channel lifecycle management

### 2. RealtimeChannelManager

A centralized manager for all real-time channels with advanced features:

```javascript
import channelManager from '../utils/realtimeChannelManager'

// Create a workout channel with comprehensive callbacks
const channel = channelManager.createWorkoutChannel(userId, programId, weekIndex, dayIndex, {
  onWorkoutLogChange: (payload) => {
    console.log('Workout log updated:', payload)
  },
  onWorkoutExerciseChange: (payload) => {
    console.log('Exercise updated:', payload)
  },
  onUserAnalyticsChange: (payload) => {
    console.log('Analytics updated:', payload)
  },
  onBroadcast: (broadcastData) => {
    console.log('Broadcast received:', broadcastData)
  },
  onPresenceChange: (presenceData) => {
    console.log('Presence changed:', presenceData)
  }
})

// Subscribe with enhanced error handling
await channelManager.subscribeChannel(channelName, {
  onStatusChange: (status, error) => console.log('Status:', status),
  onError: (error) => console.error('Error:', error),
  maxRetries: 3
})

// Get performance metrics
const metrics = channelManager.getMetrics()
console.log('Channel metrics:', metrics)

// Perform health check
const health = await channelManager.healthCheck()
console.log('Health status:', health)
```

#### Channel Manager Features:
- **Lifecycle Management**: Create, subscribe, and cleanup channels
- **User-specific Subscriptions**: Automatic filtering for user data
- **Performance Metrics**: Track connections, errors, and performance
- **Health Monitoring**: Regular health checks and status reporting
- **Error Recovery**: Intelligent retry with exponential backoff
- **Broadcasting**: Centralized message broadcasting
- **Presence Management**: Multi-user awareness and tracking

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