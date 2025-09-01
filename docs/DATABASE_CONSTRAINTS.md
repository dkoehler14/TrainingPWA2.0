# Database Constraints Reference

This document outlines all database constraints implemented in the Supabase backend, including their purpose, implementation details, and maintenance guidelines.

## Table of Contents

1. [Workout Logs Constraints](#workout-logs-constraints)
2. [Workout Log Exercises Constraints](#workout-log-exercises-constraints)
3. [Programs Constraints](#programs-constraints)
4. [User Analytics Constraints](#user-analytics-constraints)
5. [Constraint Maintenance](#constraint-maintenance)

## Workout Logs Constraints

### Unique User-Program-Week-Day Constraint

**Constraint Name:** `unique_user_program_week_day`
**Table:** `workout_logs`
**Columns:** `(user_id, program_id, week_index, day_index)`
**Purpose:** Prevents duplicate workout logs for the same user, program, week, and day combination

**Implementation:**
```sql
ALTER TABLE workout_logs
ADD CONSTRAINT unique_user_program_week_day
UNIQUE (user_id, program_id, week_index, day_index);
```

**Business Logic:**
- Ensures one workout log per user per program per week per day
- Supports program-based workout tracking
- Enables cache-first operations with reliable lookups

**Error Handling:**
- Frontend displays user-friendly message: "A workout log already exists for this program, week, and day. Your changes have been saved to the existing workout."
- Backend attempts automatic recovery by updating existing record
- Recovery success rate tracked in `ConstraintViolationHandler`

## Workout Log Exercises Constraints

### Unique Workout-Exercise Constraint

**Constraint Name:** `unique_workout_log_exercise`
**Table:** `workout_log_exercises`
**Columns:** `(workout_log_id, exercise_id)`
**Purpose:** Prevents duplicate exercises within the same workout log

**Implementation:**
```sql
ALTER TABLE workout_log_exercises
ADD CONSTRAINT unique_workout_log_exercise
UNIQUE (workout_log_id, exercise_id);
```

**Business Logic:**
- Ensures each exercise appears only once per workout
- Prevents data integrity issues in analytics calculations
- Supports clean exercise ordering and management

**Error Handling:**
- Frontend validation prevents duplicate selection with alert: "Cannot add duplicate exercise: [Exercise Name] is already selected for this workout/day."
- Database constraint provides final safety net
- Supports both program workouts and quick workouts

**Related Functions:**
- `handle_duplicate_workout_exercise_upsert()`: Safely handles upsert operations
- Frontend validation in `CreateProgram.js` and `QuickWorkout.js`

## Programs Constraints

### Unique Program-Week-Day Constraint

**Constraint Name:** `programs_program_id_week_number_day_number_key`
**Table:** `program_workouts`
**Columns:** `(program_id, week_number, day_number)`
**Purpose:** Ensures unique workout definitions within programs

**Implementation:**
```sql
ALTER TABLE program_workouts
ADD CONSTRAINT programs_program_id_week_number_day_number_key
UNIQUE (program_id, week_number, day_number);
```

## User Analytics Constraints

### Unique User-Exercise Constraint

**Constraint Name:** `user_analytics_user_id_exercise_id_key`
**Table:** `user_analytics`
**Columns:** `(user_id, exercise_id)`
**Purpose:** Ensures one analytics record per user per exercise

**Implementation:**
```sql
ALTER TABLE user_analytics
ADD CONSTRAINT user_analytics_user_id_exercise_id_key
UNIQUE (user_id, exercise_id);
```

**Business Logic:**
- Supports efficient analytics queries
- Enables ON CONFLICT upsert operations for performance
- Maintains data consistency in exercise statistics

## Constraint Maintenance

### Monitoring and Alerts

**Constraint Violation Tracking:**
- `WorkoutLogService.constraintViolationStats` tracks violations
- Metrics include total violations, successful recoveries, and failure rates
- Logs provide detailed context for debugging

**Performance Indexes:**
- `idx_workout_log_exercises_unique_lookup`: Optimizes constraint checks
- `idx_workout_logs_user_program_week_day_lookup`: Supports cache operations
- Regular index maintenance recommended

### Data Integrity Checks

**Regular Audits:**
```sql
-- Check for constraint violations
SELECT
    schemaname,
    tablename,
    constraintname,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE contype = 'u'  -- unique constraints
AND schemaname = 'public';
```

**Cleanup Procedures:**
- Analyze existing data before adding new constraints
- Use `analyze-workout-log-duplicates.js` for duplicate detection
- Implement data migration strategies for constraint additions

### Deployment Guidelines

**Migration Order:**
1. Analyze existing data for violations
2. Clean up any found duplicates
3. Add constraint with appropriate error handling
4. Update application code to handle constraint violations
5. Test thoroughly in staging environment
6. Monitor for violations in production

**Rollback Strategy:**
- Keep backup of data before constraint addition
- Have constraint removal script ready
- Monitor application logs for constraint violation patterns

### Best Practices

**Application-Level Validation:**
- Always implement frontend validation before database constraints
- Provide clear, actionable error messages to users
- Handle constraint violations gracefully with recovery options

**Performance Considerations:**
- Constraints add overhead to INSERT/UPDATE operations
- Monitor query performance after constraint additions
- Consider partial indexes for conditional constraints

**Testing Strategy:**
- Unit tests for constraint validation logic
- Integration tests for constraint violation handling
- Load testing to ensure performance impact is acceptable

## Recent Changes

### Version 2024-01-20: Workout Log Exercises Unique Constraint

**Changes:**
- Added `unique_workout_log_exercise` constraint to prevent duplicate exercises
- Implemented frontend validation in CreateProgram and QuickWorkout components
- Added `handle_duplicate_workout_exercise_upsert()` function for safe operations
- Created comprehensive test suite for constraint validation

**Migration File:** `20240101000020_add_workout_log_exercises_unique_constraint.sql`

**Impact Assessment:**
- No existing data violations found during analysis
- Frontend validation prevents most constraint violations
- Database constraint provides final safety net
- Performance impact minimal due to existing indexes

---

*Last Updated: 2024-01-20*
*Maintained by: Development Team*