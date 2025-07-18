# Test Data Seeding - Usage Examples

This document provides specific examples for common testing scenarios using the test data seeding system.

## Table of Contents

- [Development Workflows](#development-workflows)
- [Feature Testing Examples](#feature-testing-examples)
- [Bug Reproduction Examples](#bug-reproduction-examples)
- [Integration Testing Examples](#integration-testing-examples)
- [Performance Testing Examples](#performance-testing-examples)

## Development Workflows

### Example 1: Daily Development Setup

**Scenario:** Starting a new development session

```bash
# Terminal 1: Start Firebase emulators
npm run dev:firebase

# Terminal 2: Seed test data and start React
npm run seed:dev
npm run dev:react

# Result: Ready to develop with 3 test users
# - beginner@test.com (new lifter)
# - intermediate@test.com (experienced)
# - advanced@test.com (competitor, uses KG)
```

**What you get:**
- 50+ exercises in database
- 3 users with different experience levels
- Each user has appropriate workout programs
- 8-24 weeks of historical workout data per user

### Example 2: Feature Branch Testing

**Scenario:** Testing a new feature across different user types

```bash
# Reset to clean state
npm run seed:reset:force

# Seed comprehensive test environment
npm run seed:scenarios:comprehensive --verbose

# Test feature with each user type:
# 1. Login as beginner@test.com - test basic functionality
# 2. Login as intermediate@test.com - test standard workflows
# 3. Login as advanced@test.com - test advanced features
# 4. Login as recovery@test.com - test with limitations
```

**What you get:**
- 6 different user personas
- Varied data patterns and constraints
- Comprehensive test coverage

## Feature Testing Examples

### Example 3: Testing Workout Logging Feature

**Scenario:** Validating workout logging across user experience levels

```bash
# Seed basic scenarios
npm run seed:scenarios:basic

# Test sequence:
# 1. Login as beginner@test.com
#    - Test basic exercise selection
#    - Verify beginner-friendly interface
#    - Check form guidance features

# 2. Login as intermediate@test.com  
#    - Test standard workout logging
#    - Verify progression tracking
#    - Check program adherence features

# 3. Login as advanced@test.com
#    - Test advanced logging features
#    - Verify KG unit handling
#    - Check competition preparation features
```

**Expected Data:**
- Beginner: Simple programs, basic exercises
- Intermediate: Structured programs, consistent history
- Advanced: Complex programs, extensive history in KG

### Example 4: Testing Progress Analytics

**Scenario:** Validating progress charts and analytics

```bash
# Seed user with extensive history
npm run seed:scenarios -- --scenarios=advanced --verbose

# Login as advanced@test.com
# Navigate to progress analytics
# Expected data:
# - 24 weeks of workout history
# - Realistic progression patterns
# - Plateau and deload periods
# - Competition preparation cycles
```

**Data Characteristics:**
- 95% workout completion rate
- 1% weekly progression (realistic for advanced)
- Strategic deload weeks
- Varied exercise selection

### Example 5: Testing Unit Conversion

**Scenario:** Validating KG/LB unit handling

```bash
# Seed advanced user (uses KG)
npm run seed:scenarios -- --scenarios=advanced

# Login as advanced@test.com
# Test all unit-related features:
# - Workout logging in KG
# - Progress charts in KG
# - Program templates in KG
# - Export/import functionality
```

**Expected Behavior:**
- All weights displayed in KG
- Realistic KG progression (2.5kg increments)
- Proper conversion in mixed-unit scenarios

## Bug Reproduction Examples

### Example 6: Reproducing Progression Calculation Bug

**Scenario:** Bug report states "progression calculation incorrect for returning users"

```bash
# Seed specific scenario
npm run seed:scenarios -- --scenarios=returning --verbose

# Login as returning@test.com
# Navigate to progress tracking
# Expected pattern: 2.5% weekly progression (muscle memory)
# Check if calculation matches expected pattern
```

**Debug Data:**
- 12 weeks of comeback history
- 2.5% weekly progression rate
- 80% workout completion
- Mix of successful and missed workouts

### Example 7: Reproducing Equipment Limitation Bug

**Scenario:** Bug report states "app suggests barbell exercises for injury recovery user"

```bash
# Seed injury recovery scenario
npm run seed:scenarios -- --scenarios=injury_recovery --verbose

# Login as recovery@test.com
# Check exercise recommendations
# Expected: No barbell exercises should be suggested
# Available equipment: dumbbells, cables, machines only
```

**Debug Data:**
- User profile shows shoulder impingement
- Equipment list excludes barbells
- 20 weeks of modified exercise history
- Conservative progression pattern

### Example 8: Reproducing Time Constraint Bug

**Scenario:** Bug report states "app doesn't respect workout duration preferences"

```bash
# Seed busy professional scenario
npm run seed:scenarios -- --scenarios=busy_professional --verbose

# Login as professional@test.com
# Check workout recommendations
# Expected: All workouts should be ≤45 minutes
# User has time_efficient training style preference
```

**Debug Data:**
- 45-minute workout duration preference
- 70% completion rate (time constraints)
- Time-efficient exercise selection
- Irregular workout schedule pattern

## Integration Testing Examples

### Example 9: End-to-End User Journey Testing

**Scenario:** Testing complete user flow from onboarding to advanced features

```bash
# Seed comprehensive environment
npm run seed:scenarios:comprehensive

# Test progression:
# 1. Beginner journey (beginner@test.com)
#    - Onboarding experience
#    - First workout logging
#    - Basic progress tracking

# 2. Intermediate journey (intermediate@test.com)
#    - Program selection
#    - Consistent logging
#    - Progress analytics

# 3. Advanced journey (advanced@test.com)
#    - Competition preparation
#    - Advanced analytics
#    - Program customization
```

### Example 10: Testing Data Migration

**Scenario:** Testing data migration or export/import functionality

```bash
# Create comprehensive test data
npm run seed:scenarios:comprehensive

# Test data export for each user type
# Verify data integrity across different:
# - Experience levels
# - Unit preferences (LB vs KG)
# - Equipment availability
# - Injury considerations
```

## Performance Testing Examples

### Example 11: Testing with Maximum Data Volume

**Scenario:** Performance testing with extensive historical data

```bash
# Seed maximum data volume
npm run seed:scenarios:comprehensive

# Performance test targets:
# - Advanced user: 24 weeks of data (largest dataset)
# - Multiple users: 6 users total
# - Full exercise database: 50+ exercises
# - Complete program library: Multiple programs per user

# Test scenarios:
# 1. Login performance
# 2. Progress chart rendering
# 3. Exercise search/filter
# 4. Program loading
```

### Example 12: Testing with Minimal Data

**Scenario:** Testing application behavior with minimal data

```bash
# Seed without historical data
npm run seed:dev -- --no-history

# Test scenarios:
# 1. New user experience
# 2. Empty state handling
# 3. First workout logging
# 4. Progress tracking with minimal data
```

### Example 13: Stress Testing User Creation

**Scenario:** Testing user creation system performance

```bash
# Test user creation system
node scripts/test-user-creation.js

# Validate user creation performance
node scripts/validate-user-creation-system.js

# Test scenario seeding performance
node scripts/test-scenario-seeding-integration.js
```

## Validation Examples

### Example 14: Validating Seeded Data Integrity

**Scenario:** Ensuring seeded data meets quality standards

```bash
# Seed comprehensive data
npm run seed:scenarios:comprehensive

# Run validation scripts
npm run validate:reset
node scripts/validate-user-creation-system.js
node scripts/validate-workout-log-generation.js
node scripts/validate-program-seeding.js

# Check data status
npm run seed:status
```

### Example 15: Testing CLI Functionality

**Scenario:** Validating seeding CLI commands work correctly

```bash
# Test all CLI functionality
npm run test:cli

# Test specific functionality
node scripts/test-cli-functionality.js
node scripts/test-reset-functionality.js
node scripts/test-scenario-seeding-integration.js
```

## Custom Scenario Examples

### Example 16: Creating Custom Test Environment

**Scenario:** Need specific combination of users for testing

```bash
# Custom scenario combination
npm run seed:scenarios -- --scenarios=beginner,injury_recovery --verbose

# Result: 2 users with contrasting characteristics
# - Beginner: Fast progression, no limitations
# - Recovery: Conservative progression, equipment limitations

# Use case: Testing adaptive recommendation system
```

### Example 17: Testing Edge Cases

**Scenario:** Testing application with edge case users

```bash
# Seed edge case scenarios
npm run seed:scenarios -- --scenarios=injury_recovery,busy_professional

# Test edge cases:
# 1. Equipment limitations (recovery user)
# 2. Time constraints (professional user)
# 3. Modified exercise recommendations
# 4. Adaptive program suggestions
```

## Cleanup Examples

### Example 18: Resetting Between Test Sessions

**Scenario:** Clean slate for new testing session

```bash
# Quick reset and reseed
npm run seed:reset:force && npm run seed:dev

# Comprehensive reset and reseed
npm run seed:reset:force && npm run seed:scenarios:comprehensive
```

### Example 19: Selective Data Management

**Scenario:** Managing specific data types

```bash
# Preview what would be reset
npm run seed:reset:dry-run

# Reset with confirmation
npm run seed:reset

# Seed specific scenarios after reset
npm run seed:scenarios -- --scenarios=intermediate,advanced
```

These examples provide practical guidance for using the test data seeding system effectively across different development and testing scenarios.