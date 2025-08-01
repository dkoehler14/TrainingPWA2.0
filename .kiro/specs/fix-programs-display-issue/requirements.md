# Requirements Document

## Introduction

The Programs page is not displaying programs for the Beginner User due to a data structure mismatch between the frontend code expectations and the actual Supabase database schema. The code expects a `weekly_configs` field that doesn't exist in the database, and the seeding script only creates a program for the first test user, not the beginner user.

## Requirements

### Requirement 1

**User Story:** As a beginner user, I want to see my programs displayed on the Programs page, so that I can access and manage my workout programs.

#### Acceptance Criteria

1. WHEN a beginner user logs in and navigates to the Programs page THEN the system SHALL display any programs assigned to that user
2. WHEN the system fetches user programs THEN it SHALL properly handle the normalized database structure with program_workouts and program_exercises tables
3. WHEN the system processes program data THEN it SHALL transform the normalized data into the expected weekly_configs format for the frontend

### Requirement 2

**User Story:** As a system administrator, I want the seeding script to create programs for all test users, so that each user type has sample data to work with.

#### Acceptance Criteria

1. WHEN the seeding script runs THEN it SHALL create at least one program for each test user (test user, beginner user, intermediate user)
2. WHEN creating programs in the seeding script THEN it SHALL use the proper normalized structure with program_workouts and program_exercises
3. WHEN programs are created THEN they SHALL include actual workout data with exercises, sets, and reps

### Requirement 3

**User Story:** As a developer, I want the program service to return properly structured data, so that the frontend components can display program information correctly.

#### Acceptance Criteria

1. WHEN getUserPrograms is called THEN it SHALL fetch programs with their related workout and exercise data
2. WHEN program data is returned THEN it SHALL include a computed weekly_configs field that transforms the normalized data
3. WHEN the data transformation occurs THEN it SHALL maintain backward compatibility with existing frontend code
4. WHEN programs have no workout data THEN the system SHALL handle this gracefully without errors

### Requirement 4

**User Story:** As a user, I want the Programs page to handle missing or incomplete program data gracefully, so that the page doesn't break when programs lack workout details.

#### Acceptance Criteria

1. WHEN a program has no weekly_configs data THEN the system SHALL display the program with appropriate messaging
2. WHEN the parseWeeklyConfigs function receives invalid data THEN it SHALL return an empty array without throwing errors
3. WHEN programs are displayed THEN the system SHALL show basic program information even if workout details are missing