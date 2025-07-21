# Design Document

## Overview

This design implements automatic saving functionality for the Quick Workout page by adapting the debounced save pattern from LogWorkout.js and integrating it with the existing QuickWorkoutDraftService. The solution provides seamless auto-save capabilities while maintaining performance and user experience.

## Architecture

### High-Level Architecture

```
QuickWorkout Component
├── Auto-Save Hook (useAutoSave)
├── Debounced Save Function
├── Draft State Management
└── QuickWorkoutDraftService Integration
```

### Component Integration

The auto-save functionality will be implemented as a custom React hook that can be easily integrated into the existing QuickWorkout component without major structural changes.

## Components and Interfaces

### 1. useAutoSave Custom Hook

**Purpose:** Encapsulates all auto-save logic and provides a clean interface for the QuickWorkout component.

**Interface:**
```javascript
const {
  debouncedSave,
  currentDraftId,
  isAutoSaving,
  lastSaveTime,
  clearDraft
} = useAutoSave(user, selectedExercises, workoutName);
```

**Key Features:**
- Debounced save with 1-second delay (matching LogWorkout.js)
- Automatic draft ID management
- Save status tracking
- Cleanup on component unmount

### 2. Enhanced QuickWorkoutDraftService Integration

**Current Service:** The existing `quickWorkoutDraftService.js` already provides the necessary CRUD operations for drafts.

**Enhancements Needed:**
- Add method for incremental updates (to support auto-save)
- Optimize for frequent save operations
- Add better error handling for auto-save scenarios

### 3. Auto-Save State Management

**State Variables:**
```javascript
const [currentDraftId, setCurrentDraftId] = useState(null);
const [isAutoSaving, setIsAutoSaving] = useState(false);
const [lastSaveTime, setLastSaveTime] = useState(null);
const [autoSaveError, setAutoSaveError] = useState(null);
```

## Data Models

### Draft Workout Data Structure

The existing draft structure in `quickWorkoutDraftService.js` will be used:

```javascript
{
  userId: string,
  name: string,
  type: 'quick_workout',
  exercises: Array<{
    exerciseId: string,
    sets: number,
    reps: number[],
    weights: number[],
    completed: boolean[],
    notes: string,
    bodyweight: number | null
  }>,
  isDraft: true,
  isWorkoutFinished: false,
  lastModified: Timestamp,
  date: Timestamp
}
```

### Auto-Save Metadata

Additional metadata for tracking auto-save operations:

```javascript
{
  autoSaveVersion: number,        // Incremental version for conflict resolution
  lastAutoSave: Timestamp,        // Last auto-save timestamp
  saveSource: 'auto' | 'manual'   // Source of the save operation
}
```

## Error Handling

### Auto-Save Error Recovery

1. **Network Errors:** Queue saves and retry when connection is restored
2. **Permission Errors:** Fall back to local storage and notify user
3. **Validation Errors:** Log error and continue with next save attempt
4. **Concurrent Modification:** Use version numbers to detect conflicts

### Error States

```javascript
const AUTO_SAVE_ERRORS = {
  NETWORK_ERROR: 'network_error',
  PERMISSION_DENIED: 'permission_denied',
  VALIDATION_ERROR: 'validation_error',
  CONCURRENT_MODIFICATION: 'concurrent_modification',
  UNKNOWN_ERROR: 'unknown_error'
};
```

## Testing Strategy

### Unit Tests

1. **useAutoSave Hook Tests:**
   - Debounce functionality
   - Save triggering conditions
   - Error handling
   - Cleanup behavior

2. **Draft Service Integration Tests:**
   - Auto-save with existing drafts
   - New draft creation
   - Error scenarios

### Integration Tests

1. **Component Integration:**
   - Auto-save triggers on data changes
   - Draft restoration on page load
   - Manual save interaction with auto-save

2. **Performance Tests:**
   - Rapid input changes
   - Large workout data
   - Network latency scenarios

### User Acceptance Tests

1. **Happy Path:**
   - Create workout, make changes, verify auto-save
   - Navigate away and return, verify restoration
   - Complete workout, verify draft cleanup

2. **Error Scenarios:**
   - Offline usage
   - Network interruptions
   - Browser refresh during save

## Implementation Details

### Debounced Save Implementation

Based on LogWorkout.js pattern:

```javascript
const debouncedSave = useCallback(
  debounce(async (userData, exercises, workoutName, draftId) => {
    if (!userData || !exercises || exercises.length === 0) return;
    
    setIsAutoSaving(true);
    try {
      const result = await quickWorkoutDraftService.saveDraft(
        userData.uid,
        exercises,
        workoutName,
        draftId
      );
      
      setCurrentDraftId(result.id);
      setLastSaveTime(new Date());
      setAutoSaveError(null);
    } catch (error) {
      setAutoSaveError(error);
      console.error('Auto-save failed:', error);
    } finally {
      setIsAutoSaving(false);
    }
  }, 1000), // 1 second debounce
  []
);
```

### Integration Points

1. **Exercise Data Changes:** Trigger auto-save on `updateExerciseData`
2. **Exercise Addition/Removal:** Trigger auto-save on `addExerciseToWorkout` and `removeExercise`
3. **Workout Name Changes:** Trigger auto-save on workout name input
4. **Notes and Bodyweight:** Trigger auto-save on modal saves

### Draft Restoration Logic

```javascript
useEffect(() => {
  const restoreDraft = async () => {
    if (!user || isLoading) return;
    
    try {
      const drafts = await quickWorkoutDraftService.loadDrafts(user.uid, 1);
      if (drafts.length > 0) {
        const latestDraft = drafts[0];
        setSelectedExercises(latestDraft.exercises);
        setWorkoutName(latestDraft.name);
        setCurrentDraftId(latestDraft.id);
        showUserMessage('Draft workout restored!', 'info');
      }
    } catch (error) {
      console.error('Failed to restore draft:', error);
    }
  };
  
  restoreDraft();
}, [user, isLoading]);
```

### Performance Optimizations

1. **Debouncing:** 1-second delay to prevent excessive saves
2. **Change Detection:** Only save when actual data changes occur
3. **Batch Updates:** Combine multiple rapid changes into single save
4. **Cache Integration:** Leverage existing cache invalidation patterns

### Cleanup Strategy

```javascript
useEffect(() => {
  return () => {
    // Cancel any pending saves on unmount
    debouncedSave.cancel();
  };
}, [debouncedSave]);
```

## Migration Strategy

### Phase 1: Core Auto-Save Implementation
- Implement useAutoSave hook
- Integrate with existing QuickWorkout component
- Add basic error handling

### Phase 2: Enhanced Features
- Draft restoration on page load
- Improved error recovery
- Performance optimizations

### Phase 3: Polish and Testing
- Comprehensive testing
- User feedback integration
- Performance monitoring

## Security Considerations

1. **User Authorization:** Ensure users can only access their own drafts
2. **Data Validation:** Validate all auto-saved data before storage
3. **Rate Limiting:** Prevent abuse through excessive auto-save operations
4. **Privacy:** Ensure draft data follows same privacy rules as completed workouts

## Monitoring and Analytics

### Metrics to Track

1. **Auto-Save Success Rate:** Percentage of successful auto-saves
2. **Save Frequency:** Average time between saves
3. **Error Rates:** Types and frequency of auto-save errors
4. **Draft Restoration Rate:** How often users restore drafts
5. **Performance Impact:** Auto-save impact on component performance

### Logging Strategy

```javascript
const logAutoSaveEvent = (event, data) => {
  console.log(`[AutoSave] ${event}:`, {
    timestamp: new Date().toISOString(),
    userId: user?.uid,
    draftId: currentDraftId,
    ...data
  });
};
```