# Requirements Document

## Introduction

This specification validates the "Add Exercise" functionality in the LogWorkout component to ensure that users can properly add exercises to their workout sessions with both temporary and permanent options. The feature allows users to dynamically expand their workouts by adding exercises that either apply only to the current session (temporary) or become part of the program structure for future workouts (permanent).

## Requirements

### Requirement 1

**User Story:** As a user logging a workout, I want to add exercises to my current workout session so that I can customize my training beyond the original program structure.

#### Acceptance Criteria

1. WHEN I am on the LogWorkout page with an active workout THEN I SHALL see an "Add Exercise" button
2. WHEN I click the "Add Exercise" button THEN the system SHALL display a modal with exercise selection options
3. WHEN the workout is already finished THEN the "Add Exercise" button SHALL be disabled or hidden
4. IF I am not authenticated or have no selected program THEN the add exercise functionality SHALL not be available

### Requirement 2

**User Story:** As a user adding an exercise, I want to choose between temporary and permanent addition so that I can control whether the exercise affects future workouts.

#### Acceptance Criteria

1. WHEN the Add Exercise modal opens THEN I SHALL see radio button options for "Temporary" and "Permanent"
2. WHEN I select "Temporary" THEN the system SHALL indicate the exercise will only be logged for this session
3. WHEN I select "Permanent" THEN the system SHALL indicate the exercise will be added to the program structure
4. WHEN I select an exercise THEN the system SHALL use the currently selected addition type (temporary or permanent)
5. IF no addition type is selected THEN the system SHALL default to "temporary"

### Requirement 3

**User Story:** As a user adding a temporary exercise, I want the exercise to appear in my current workout and that particular day of the program without affecting future days of the program so that I can log additional work without changing my routine.

#### Acceptance Criteria

1. WHEN I add a temporary exercise THEN it SHALL appear in the current workout log with default values (3 sets, empty reps/weights)
2. WHEN I add a temporary exercise THEN it SHALL be marked with `isAdded: true` and `addedType: 'temporary'`
3. WHEN I add a temporary exercise THEN the program structure in Firestore SHALL be modified ONLY for that day
4. WHEN I save the workout log THEN the temporary exercise SHALL be included in the workout log document
5. WHEN I navigate to future instances of the same day THEN the temporary exercise SHALL NOT appear

### Requirement 4

**User Story:** As a user adding a permanent exercise, I want the exercise to be added to my program structure so that it appears in future workouts on the same day.

#### Acceptance Criteria

1. WHEN I add a permanent exercise THEN it SHALL appear in the current workout log with default values (3 sets, empty reps/weights)
2. WHEN I add a permanent exercise THEN it SHALL be marked with `isAdded: true` and `addedType: 'permanent'`
3. WHEN I add a permanent exercise THEN the program's weeklyConfigs in Firestore SHALL be updated to include the new exercise
4. WHEN I add a permanent exercise THEN the exercise SHALL be added with default program values (3 sets, 8 reps)
5. WHEN I navigate to future instances of the same day THEN the permanent exercise SHALL appear as part of the program

### Requirement 5

**User Story:** As a user who has added exercises, I want to be able to remove them so that I can correct mistakes or change my mind about additions.

#### Acceptance Criteria

1. WHEN I have added exercises to my workout THEN I SHALL see a "Remove Added" button for each added exercise
2. WHEN I click "Remove Added" for a temporary exercise THEN it SHALL be removed from the current workout only
3. WHEN I click "Remove Added" for a permanent exercise THEN it SHALL be removed from both the current workout AND the program structure
4. WHEN the workout is finished THEN the "Remove Added" button SHALL be disabled
5. WHEN I remove an added exercise THEN the workout log SHALL be automatically saved with the updated exercise list

### Requirement 6

**User Story:** As a user adding exercises, I want the system to handle different exercise types properly so that bodyweight and loaded exercises work correctly.

#### Acceptance Criteria

1. WHEN I add a bodyweight exercise THEN the system SHALL initialize the bodyweight field as empty
2. WHEN I add a bodyweight loadable exercise THEN the system SHALL initialize the bodyweight field as empty
3. WHEN I add a regular exercise THEN the system SHALL NOT include bodyweight fields
4. WHEN I add any exercise THEN the system SHALL initialize with 3 sets, empty reps array, empty weights array, and all sets marked as incomplete

### Requirement 7

**User Story:** As a user, I want the add exercise functionality to integrate seamlessly with the existing workout logging system so that added exercises behave like original program exercises.

#### Acceptance Criteria

1. WHEN I add an exercise THEN it SHALL support all standard workout logging features (set completion, notes, history viewing)
2. WHEN I add an exercise THEN it SHALL be included in workout summary calculations
3. WHEN I add an exercise THEN it SHALL be saved automatically with the debounced save functionality
4. WHEN I add an exercise THEN the programLogs state SHALL be updated to reflect the addition
5. WHEN I finish a workout with added exercises THEN they SHALL be included in the final workout log with proper metadata

### Requirement 8

**User Story:** As a user, I want the system to handle errors gracefully when adding exercises so that I receive appropriate feedback if something goes wrong.

#### Acceptance Criteria

1. WHEN adding an exercise fails due to network issues THEN I SHALL see an error message "Failed to add exercise. Please try again."
2. WHEN adding a permanent exercise fails to update the program THEN the system SHALL still add the exercise temporarily to the current workout
3. WHEN the system is already processing an exercise addition THEN additional add requests SHALL be ignored until completion
4. WHEN I try to add an exercise without selecting one THEN the system SHALL not proceed with the addition
5. IF the program document cannot be found THEN permanent exercise addition SHALL fail with appropriate error handling