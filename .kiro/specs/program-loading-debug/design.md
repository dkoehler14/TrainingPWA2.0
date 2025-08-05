# Design Document

## Overview

The program loading issue appears to be in the data pipeline between the successful database fetch and the UI display. Based on the console logs, we can see that:

1. Database fetch is successful (returns 2 programs)
2. Cache layer shows 0 programs
3. UI shows no programs

This suggests the issue is in the data transformation layer, specifically in the `transformSupabaseProgramToWeeklyConfigs` function or the caching mechanism.

## Architecture

The current data flow is:
```
Database Query → Raw Supabase Data → Data Transformation → Cache Storage → UI Display
     ✅                ✅                    ❌?                ❌              ❌
```

The issue is likely in the transformation step where the data structure is being modified incorrectly, causing the cache to receive empty or malformed data.

## Components and Interfaces

### 1. Debug Logging Enhancement
- **Purpose**: Add detailed logging at each step of the data pipeline
- **Interface**: Enhanced console logging with data structure inspection
- **Implementation**: Temporary debug logs in key transformation functions

### 2. Data Transformation Validation
- **Purpose**: Validate data structure at each transformation step
- **Interface**: Validation functions that check data integrity
- **Implementation**: Add validation checks in `transformSupabaseProgramToWeeklyConfigs`

### 3. Cache Data Inspection
- **Purpose**: Inspect what data is actually being cached
- **Interface**: Enhanced cache logging with full data structure
- **Implementation**: Modify cache operations to log complete data objects

### 4. Fallback Mechanism
- **Purpose**: Ensure UI always shows programs even if transformation fails
- **Interface**: Error handling that preserves original data
- **Implementation**: Try-catch blocks with fallback to raw data

## Data Models

### Raw Supabase Program Structure
```javascript
{
  id: string,
  name: string,
  user_id: string,
  is_active: boolean,
  duration: number,
  days_per_week: number,
  program_workouts: [
    {
      id: string,
      program_id: string,
      week_number: number,
      day_number: number,
      name: string,
      program_exercises: [
        {
          id: string,
          workout_id: string,
          exercise_id: string,
          sets: number,
          reps: string,
          order_index: number,
          exercises: {
            id: string,
            name: string,
            primary_muscle_group: string,
            exercise_type: string
          }
        }
      ]
    }
  ]
}
```

### Expected Transformed Structure
```javascript
{
  id: string,
  name: string,
  user_id: string,
  is_active: boolean,
  duration: number,
  days_per_week: number,
  weekly_configs: {
    "week1_day1": {
      name: string,
      exercises: [...]
    }
  },
  weeklyConfigs: [[...]] // Parsed structure for UI
}
```

## Error Handling

### Transformation Errors
- Log the exact point of failure in transformation
- Preserve original data structure as fallback
- Continue processing other programs if one fails

### Cache Errors
- Log cache operation failures
- Fall back to direct database queries
- Maintain UI functionality even without cache

### UI Display Errors
- Show error messages for failed program loads
- Provide retry mechanisms
- Display partial data when possible

## Testing Strategy

### Debug Logging Tests
1. Verify logs show correct data at each pipeline step
2. Confirm data structure integrity throughout transformation
3. Validate cache operations store correct data

### Data Transformation Tests
1. Test transformation with various program structures
2. Verify edge cases (empty workouts, missing exercises)
3. Confirm backward compatibility

### Integration Tests
1. End-to-end program loading flow
2. Cache hit/miss scenarios
3. Error recovery mechanisms

### Performance Tests
1. Measure transformation performance impact
2. Verify cache efficiency
3. Monitor memory usage during debugging