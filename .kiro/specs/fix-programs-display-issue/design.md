# Design Document

## Overview

This design addresses the Programs page display issue by fixing the data structure mismatch between the frontend expectations and the Supabase database schema. The solution involves updating the program service to fetch and transform normalized data, enhancing the seeding script to create programs for all test users, and ensuring robust error handling.

## Architecture

The fix involves three main components:

1. **Program Service Enhancement**: Modify `getUserPrograms` to fetch related workout and exercise data and transform it into the expected format
2. **Data Transformation Layer**: Create utilities to convert normalized database structure to the legacy `weekly_configs` format
3. **Seeding Script Enhancement**: Update the seeding script to create complete programs with workouts and exercises for all test users

## Components and Interfaces

### Enhanced Program Service

**File**: `src/services/programService.js`

The `getUserPrograms` function will be enhanced to:
- Fetch programs with related `program_workouts` and `program_exercises` data using Supabase joins
- Transform the normalized data into the expected `weekly_configs` format
- Maintain backward compatibility with existing frontend code

**Interface Changes**:
```javascript
// Current return format (will be maintained)
{
  id: string,
  name: string,
  duration: number,
  days_per_week: number,
  weekly_configs: object, // This will be computed from normalized data
  // ... other program fields
}
```

### Data Transformation Utilities

**File**: `src/utils/dataTransformations.js`

New function: `transformSupabaseProgramToWeeklyConfigs`
- Converts normalized program_workouts and program_exercises data to weekly_configs format
- Handles edge cases like missing workout data
- Maintains the expected structure for the parseWeeklyConfigs function

**Interface**:
```javascript
transformSupabaseProgramToWeeklyConfigs(program) => {
  ...program,
  weekly_configs: object // Computed from program_workouts and program_exercises
}
```

### Enhanced Seeding Script

**File**: `scripts/seed/supabase/seeder.js`

The seeding script will be updated to:
- Create programs for all test users (not just the first one)
- Use the `createCompleteProgram` function to create programs with proper workout structure
- Include sample exercises, sets, and reps for realistic test data

## Data Models

### Current Database Structure (Normalized)
```
programs
├── id
├── user_id
├── name
├── duration
├── days_per_week
└── ... other fields

program_workouts
├── id
├── program_id (FK)
├── week_number
├── day_number
└── name

program_exercises
├── id
├── workout_id (FK)
├── exercise_id (FK)
├── sets
├── reps
└── order_index
```

### Expected Frontend Format (Legacy)
```javascript
{
  weekly_configs: {
    "week1_day1": {
      name: "Day 1",
      exercises: [
        {
          exerciseId: "uuid",
          sets: 3,
          reps: 8,
          notes: ""
        }
      ]
    }
  }
}
```

### Transformation Logic

The transformation will:
1. Group `program_workouts` by week and day
2. For each workout, collect associated `program_exercises`
3. Format the data into the expected `week{n}_day{n}` structure
4. Ensure exercises are properly ordered by `order_index`

## Error Handling

### Graceful Degradation
- If a program has no workout data, return empty weekly_configs
- If transformation fails, log error and return basic program info
- Frontend should handle programs with empty weekly_configs gracefully

### Validation
- Validate that week_number and day_number are within expected ranges
- Ensure exercise references are valid
- Handle missing or null data appropriately

## Testing Strategy

### Unit Tests
- Test data transformation functions with various input scenarios
- Test error handling for malformed data
- Test backward compatibility with existing program structures

### Integration Tests
- Test the enhanced getUserPrograms function with real database data
- Test seeding script creates proper program structure
- Test Programs page displays data correctly for all user types

### Manual Testing
- Verify beginner user can see programs after seeding
- Verify program details modal works with transformed data
- Verify performance metrics display correctly

## Implementation Approach

### Phase 1: Data Transformation
1. Create `transformSupabaseProgramToWeeklyConfigs` utility function
2. Add unit tests for the transformation logic
3. Update `getUserPrograms` to use the transformation

### Phase 2: Service Enhancement
1. Modify `getUserPrograms` to fetch related workout and exercise data
2. Apply the transformation to all returned programs
3. Ensure caching still works correctly

### Phase 3: Seeding Script Update
1. Create sample workout data for each user type
2. Update seeding script to create complete programs using `createCompleteProgram`
3. Test that all users get appropriate programs

### Phase 4: Error Handling & Polish
1. Add robust error handling throughout the data flow
2. Update frontend to handle edge cases gracefully
3. Add logging for debugging purposes

## Performance Considerations

- The enhanced query will fetch more data, but this is necessary for functionality
- Caching should still work effectively with the transformed data
- Consider pagination if users have many programs with extensive workout data

## Backward Compatibility

The solution maintains full backward compatibility:
- Existing frontend code continues to work unchanged
- The `weekly_configs` field is computed and provided as expected
- No breaking changes to existing APIs or data structures