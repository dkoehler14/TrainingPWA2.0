# Design Document

## Overview

The current program editing functionality has a critical gap: when users add or remove weeks from an existing program, only the `programs` table is updated (specifically the `duration` field), but the corresponding `program_workouts` and `program_exercises` entries are not created or removed. This creates data inconsistency where the program metadata doesn't match the actual workout structure.

The solution involves creating a new comprehensive program update function that handles both the program metadata and the complete workout structure atomically, similar to how `createCompleteProgram` works for new programs.

## Architecture

### Current State Analysis

**Current Edit Flow:**
1. User modifies weeks in UI (adds/removes weeks)
2. `saveProgram()` calls `updateProgram()` with basic metadata only
3. `updateProgram()` only updates the `programs` table
4. `program_workouts` and `program_exercises` remain unchanged
5. Data inconsistency results

**Current Create Flow (Working Correctly):**
1. User creates program structure in UI
2. `saveProgram()` calls `createCompleteProgram()` with full workout data
3. `createCompleteProgram()` creates program, workouts, and exercises atomically
4. All data is consistent

### Proposed Solution Architecture

**New Edit Flow:**
1. User modifies weeks in UI (adds/removes weeks)
2. `saveProgram()` calls new `updateCompleteProgram()` function
3. `updateCompleteProgram()` performs atomic transaction:
   - Updates `programs` table metadata
   - Deletes existing `program_workouts` and `program_exercises`
   - Recreates complete workout structure from UI state
4. All data remains consistent

## Components and Interfaces

### New Service Function: `updateCompleteProgram`

```javascript
/**
 * Update a complete program with workouts and exercises
 * @param {string} programId - The program ID to update
 * @param {Object} programData - Program metadata
 * @param {Array} workoutsData - Complete workout structure
 * @returns {Promise<Object>} Updated program with workouts and exercises
 */
export const updateCompleteProgram = async (programId, programData, workoutsData) => {
  // Implementation details in next section
}
```

### Modified CreateProgram Component

The `saveProgram()` function in `CreateProgram.js` needs to be updated to:
1. Use `updateCompleteProgram()` instead of `updateProgram()` for edit mode
2. Pass the complete workout structure (already generated) to the new function
3. Handle the atomic transaction results appropriately

### Database Transaction Strategy

The update operation will use Supabase's transaction-like behavior through sequential operations with proper error handling and rollback:

1. **Backup Phase**: Store current state for potential rollback
2. **Update Phase**: Update program metadata
3. **Delete Phase**: Remove existing workout/exercise data
4. **Recreate Phase**: Insert new workout/exercise structure
5. **Cleanup Phase**: Remove backup data on success

## Data Models

### Input Data Structure

The function will accept the same data structures already used by `createCompleteProgram`:

```javascript
// Program metadata
const programData = {
  name: string,
  weight_unit: 'LB' | 'KG',
  duration: number,
  days_per_week: number,
  is_template: boolean,
  is_active: boolean
}

// Workout structure (same as create)
const workoutsData = [
  {
    week_number: number,
    day_number: number,
    name: string,
    exercises: [
      {
        exercise_id: string,
        sets: number,
        reps: string,
        notes: string
      }
    ]
  }
]
```

### Database Operations Sequence

1. **programs** table: UPDATE with new metadata
2. **program_exercises** table: DELETE all for program_id
3. **program_workouts** table: DELETE all for program_id  
4. **program_workouts** table: INSERT new workout records
5. **program_exercises** table: INSERT new exercise records

## Error Handling

### Transaction Rollback Strategy

Since Supabase doesn't support traditional transactions, we'll implement a compensation pattern:

1. **Pre-operation Backup**: Query and store current program state
2. **Operation Tracking**: Track which operations succeeded
3. **Failure Recovery**: On any failure, restore previous state using backup data
4. **Cleanup**: Remove backup data on successful completion

### Error Scenarios and Responses

1. **Program Update Failure**: Return error immediately, no cleanup needed
2. **Workout Deletion Failure**: Attempt to restore program metadata
3. **Workout Creation Failure**: Restore program metadata and recreate deleted workouts
4. **Exercise Creation Failure**: Restore entire previous state

### User-Facing Error Messages

- "Failed to update program structure. Your program remains unchanged."
- "Program updated but some workout data may be incomplete. Please review and save again."
- "Update partially completed. Please refresh and try again."

## Testing Strategy

### Unit Tests

1. **updateCompleteProgram Function Tests**:
   - Successful update with week additions
   - Successful update with week removals
   - Successful update with day modifications
   - Error handling and rollback scenarios

2. **Integration Tests**:
   - Full edit workflow from UI to database
   - Data consistency verification
   - Cache invalidation verification

3. **Edge Case Tests**:
   - Programs with missing workout data
   - Programs with orphaned exercises
   - Concurrent edit scenarios

### Test Data Scenarios

1. **Week Addition**: 2-week program → 4-week program
2. **Week Removal**: 4-week program → 2-week program  
3. **Day Modification**: 3-day program → 5-day program
4. **Mixed Changes**: Add weeks + modify days + change exercises

### Validation Tests

1. **Data Consistency**: Verify program.duration matches actual workout weeks
2. **Referential Integrity**: Verify all exercises reference valid exercise_ids
3. **Completeness**: Verify all weeks/days have corresponding workout records

## Implementation Phases

### Phase 1: Core Function Implementation
- Create `updateCompleteProgram` function in `programService.js`
- Implement basic update logic without advanced error handling
- Add basic unit tests

### Phase 2: Error Handling and Rollback
- Implement backup/restore mechanism
- Add comprehensive error handling
- Add rollback tests

### Phase 3: UI Integration
- Modify `CreateProgram.js` to use new function
- Update error messaging in UI
- Add loading states for longer operations

### Phase 4: Testing and Validation
- Comprehensive integration testing
- Performance testing with large programs
- User acceptance testing

## Performance Considerations

### Database Operation Optimization

1. **Batch Operations**: Use batch inserts for workouts and exercises
2. **Selective Updates**: Only update changed data when possible (future enhancement)
3. **Index Usage**: Ensure proper indexes on program_id, week_number, day_number

### Caching Strategy

1. **Cache Invalidation**: Invalidate program cache after successful update
2. **Optimistic Updates**: Update UI immediately, rollback on failure
3. **Partial Cache Updates**: Update specific cache entries rather than full invalidation

### User Experience

1. **Progress Indicators**: Show progress during multi-step operations
2. **Optimistic UI**: Update UI immediately for better perceived performance
3. **Background Processing**: Consider moving large updates to background tasks