# Test Data Seeding Guide

This comprehensive guide provides detailed examples and workflows for using the test data seeding system in the Exercise Tracker application.

## Table of Contents

- [Overview](#overview)
- [Quick Reference](#quick-reference)
- [User Scenarios](#user-scenarios)
- [Common Workflows](#common-workflows)
- [Advanced Usage](#advanced-usage)
- [Testing Strategies](#testing-strategies)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview

The test data seeding system creates realistic fitness application data including:
- **User accounts** with different experience levels and characteristics
- **Exercise database** with 50+ exercises across all major categories
- **Workout programs** tailored to each user's experience level
- **Historical workout logs** with realistic progression patterns

This enables comprehensive testing without manual data entry and provides consistent test environments across development sessions.

## Quick Reference

### Essential Commands
```bash
# Basic seeding (most common)
npm run seed:dev

# Reset everything
npm run seed:reset:force

# Check current data
npm run seed:status

# Comprehensive test environment
npm run seed:scenarios:comprehensive
```

### Test User Credentials
| Email | Password | Experience | Special Notes |
|-------|----------|------------|---------------|
| beginner@test.com | test123 | New lifter | Fast progression, 75% completion |
| intermediate@test.com | test123 | 2 years | Steady progress, 85% completion |
| advanced@test.com | test123 | 5+ years | Uses KG units, 95% completion |
| returning@test.com | test123 | Comeback | Muscle memory gains, 80% completion |
| recovery@test.com | test123 | Injury recovery | No barbells, 90% completion |
| professional@test.com | test123 | Time-limited | 45min workouts, 70% completion |

## User Scenarios

### Complete Beginner (`beginner@test.com`)

**Profile Characteristics:**
- Age: 25, Weight: 150 lbs, Height: 5'8"
- Goals: Strength building, muscle gain
- Equipment: Basic (barbell, dumbbells, bench)
- Workout frequency: 3 days/week

**Data Patterns:**
- 75% workout completion rate (still building habit)
- 3% weekly progression (fast beginner gains)
- 8 weeks of workout history
- 30% chance of form-related missed reps

**Use Cases:**
- Testing onboarding flows
- Validating beginner-friendly features
- Testing rapid progression tracking
- Form guidance and education features

**Example Workout History:**
```
Week 1: Squat 95lbs → Week 8: Squat 135lbs
Missed 2 workouts due to motivation, 3 due to form issues
```

### Intermediate Lifter (`intermediate@test.com`)

**Profile Characteristics:**
- Age: 28, Weight: 175 lbs, Height: 5'10"
- Goals: Strength, powerlifting focus
- Equipment: Full gym setup
- Workout frequency: 4 days/week

**Data Patterns:**
- 85% workout completion rate (established routine)
- 2% weekly progression (steady gains)
- 16 weeks of workout history
- 15% chance of plateau/deload periods

**Use Cases:**
- Testing standard application workflows
- Program progression features
- Analytics and progress tracking
- Social features and program sharing

**Example Workout History:**
```
Week 1: Bench 185lbs → Week 16: Bench 225lbs
Includes 2 deload weeks, consistent progression pattern
```

### Advanced Competitor (`advanced@test.com`)

**Profile Characteristics:**
- Age: 32, Weight: 185 lbs, Height: 6'0"
- Goals: Competition, strength maximization
- Equipment: Specialty bars, full powerlifting setup
- Workout frequency: 5 days/week
- **Uses KG units** (important for testing)

**Data Patterns:**
- 95% workout completion rate (very disciplined)
- 1% weekly progression (slower advanced gains)
- 24 weeks of extensive workout history
- 25% strategic plateau/deload frequency

**Use Cases:**
- Testing advanced features and edge cases
- KG unit conversion and display
- Complex program structures
- Competition preparation features
- Injury history management

**Example Workout History:**
```
Week 1: Squat 140kg → Week 24: Squat 150kg
Includes periodization, competition prep, injury management
```

### Returning Lifter (`returning@test.com`)

**Profile Characteristics:**
- Age: 30, Weight: 165 lbs, Height: 5'9"
- Background: 3 years previous training, 6 months off
- Goals: Regaining strength, general fitness
- Conservative approach to training

**Data Patterns:**
- 80% completion rate (rebuilding habit)
- 2.5% weekly progression (muscle memory effect)
- 12 weeks of comeback history
- 15% form relearning issues

**Use Cases:**
- Testing comeback/restart workflows
- Muscle memory progression patterns
- Habit rebuilding features
- Conservative program recommendations

### Injury Recovery (`recovery@test.com`)

**Profile Characteristics:**
- Age: 35, Weight: 170 lbs, Height: 5'7"
- Injuries: Shoulder impingement, lower back history
- Equipment: No barbells (dumbbells, cables, machines only)
- Focus: Injury prevention, mobility

**Data Patterns:**
- 90% completion rate (very consistent for recovery)
- 1.5% weekly progression (conservative approach)
- 20 weeks of recovery-focused training
- Modified exercise selections

**Use Cases:**
- Testing injury accommodation features
- Equipment limitation handling
- Modified exercise recommendations
- Recovery-focused program structures

### Busy Professional (`professional@test.com`)

**Profile Characteristics:**
- Age: 29, Weight: 160 lbs, Height: 5'6"
- Time constraint: 45-minute workout limit
- Goals: General fitness, time efficiency
- Irregular schedule

**Data Patterns:**
- 70% completion rate (busy schedule)
- 2% weekly progression
- 14 weeks of inconsistent training
- 25% motivation/time-related missed workouts

**Use Cases:**
- Testing time-efficient workout features
- Flexible scheduling options
- Quick workout recommendations
- Busy lifestyle accommodations

## Common Workflows

### 1. Feature Development Workflow

**Scenario:** Developing a new workout logging feature

```bash
# Step 1: Start clean development environment
npm run dev:firebase

# Step 2: Seed basic test data
npm run seed:dev:verbose

# Step 3: Start React application
npm run dev:react

# Step 4: Test with different user types
# Login as beginner@test.com to test basic flows
# Login as advanced@test.com to test edge cases
```

**Expected Results:**
- 3 users with different experience levels
- Each user has appropriate workout programs
- Historical data shows realistic progression patterns
- Can test feature across different user scenarios

### 2. Bug Reproduction Workflow

**Scenario:** Reproducing a bug related to KG unit conversion

```bash
# Step 1: Reset to clean state
npm run seed:reset:force

# Step 2: Seed only advanced user (uses KG)
npm run seed:scenarios -- --scenarios=advanced --verbose

# Step 3: Login as advanced@test.com
# Step 4: Navigate to feature with KG conversion issue
# Step 5: Reproduce bug with realistic KG data
```

**Expected Results:**
- Advanced user with extensive KG-based workout history
- Realistic weight progressions in KG units
- Complex program structure for thorough testing

### 3. Performance Testing Workflow

**Scenario:** Testing application performance with extensive data

```bash
# Step 1: Seed comprehensive data set
npm run seed:scenarios:comprehensive --verbose

# Step 2: Check data volume
npm run seed:status

# Step 3: Test application performance
# - Login as advanced@test.com (24 weeks of data)
# - Navigate to progress analytics
# - Test chart rendering with extensive data
```

**Expected Results:**
- 6 users with varied data patterns
- Advanced user has 24 weeks of workout history
- Realistic data volume for performance testing

### 4. Integration Testing Workflow

**Scenario:** Testing complete user journey from onboarding to advanced features

```bash
# Step 1: Comprehensive seeding
npm run seed:scenarios:comprehensive

# Step 2: Test progression through user types
# - Start with beginner@test.com (onboarding experience)
# - Progress to intermediate@test.com (standard features)
# - Finish with advanced@test.com (advanced features)

# Step 3: Validate data relationships
node scripts/validate-user-creation-system.js
```

**Expected Results:**
- Complete user journey testing capability
- Data integrity across all user types
- Realistic progression patterns for each scenario

### 5. Edge Case Testing Workflow

**Scenario:** Testing application with users who have limitations

```bash
# Step 1: Seed specific edge case scenarios
npm run seed:scenarios -- --scenarios=injury_recovery,busy_professional --verbose

# Step 2: Test limitation handling
# - Login as recovery@test.com (no barbell exercises)
# - Login as professional@test.com (time constraints)

# Step 3: Validate appropriate recommendations
```

**Expected Results:**
- Users with specific limitations and constraints
- Modified exercise selections and recommendations
- Realistic constraint-based data patterns

## Advanced Usage

### Custom Scenario Selection

```bash
# Seed specific combinations
npm run seed:scenarios -- --scenarios=beginner,advanced --verbose

# Seed returning lifter only
npm run seed:scenarios -- --scenarios=returning --verbose

# Seed all injury-related scenarios
npm run seed:scenarios -- --scenarios=injury_recovery --verbose
```

### Dry Run Operations

```bash
# Preview what would be seeded
npm run seed:dev:dry-run

# Preview reset operation
npm run seed:reset:dry-run

# Preview scenario seeding
npm run seed:scenarios -- --scenarios=comprehensive --dry-run
```

### Historical Data Control

```bash
# Seed without historical workout logs (faster)
npm run seed:dev -- --no-history

# Seed with verbose progress reporting
npm run seed:dev:verbose

# Quiet seeding (minimal output)
npm run seed:dev:quiet
```

### Programmatic Usage

```javascript
// In test files or custom scripts
const { seedAll } = require('./scripts/seed/seeder');
const { getSeedingConfig } = require('./scripts/seed/config/scenarios');

// Custom seeding configuration
const config = getSeedingConfig('intermediate', {
  verbose: true,
  includeHistoricalData: false
});

await seedAll(config);
```

## Testing Strategies

### 1. User Experience Testing

**Strategy:** Test features across different user experience levels

```bash
# Seed all experience levels
npm run seed:scenarios:basic

# Test sequence:
# 1. Login as beginner@test.com - test onboarding
# 2. Login as intermediate@test.com - test standard features  
# 3. Login as advanced@test.com - test advanced features
```

### 2. Data Volume Testing

**Strategy:** Test application performance with varying data volumes

```bash
# Minimal data (no history)
npm run seed:dev -- --no-history

# Standard data (basic scenarios)
npm run seed:scenarios:basic

# Maximum data (comprehensive scenarios)
npm run seed:scenarios:comprehensive
```

### 3. Edge Case Testing

**Strategy:** Test application behavior with constrained users

```bash
# Test injury limitations
npm run seed:scenarios -- --scenarios=injury_recovery

# Test time constraints
npm run seed:scenarios -- --scenarios=busy_professional

# Test comeback scenarios
npm run seed:scenarios -- --scenarios=returning
```

### 4. Unit Conversion Testing

**Strategy:** Test KG/LB unit handling

```bash
# Seed advanced user (uses KG)
npm run seed:scenarios -- --scenarios=advanced

# Test all unit conversion features with realistic KG data
```

### 5. Progression Pattern Testing

**Strategy:** Test progress tracking with realistic data patterns

```bash
# Seed comprehensive scenarios
npm run seed:scenarios:comprehensive

# Each user has different progression patterns:
# - Beginner: Fast gains (3% weekly)
# - Intermediate: Steady gains (2% weekly)
# - Advanced: Slow gains (1% weekly)
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Emulators Not Running

**Problem:** Seeding fails with connection errors

**Solution:**
```bash
# Check if emulators are running
npm run seed:status

# Start emulators if needed
npm run dev:firebase

# Verify emulator UI is accessible
# Visit http://localhost:4000
```

#### 2. Inconsistent Data State

**Problem:** Previous seeding attempts left partial data

**Solution:**
```bash
# Force reset to clean state
npm run seed:reset:force

# Seed fresh data
npm run seed:dev:verbose
```

#### 3. Seeding Performance Issues

**Problem:** Seeding takes too long or fails

**Solution:**
```bash
# Use minimal seeding for development
npm run seed:dev -- --no-history

# Use quiet mode to reduce output overhead
npm run seed:dev:quiet

# Seed specific scenarios only
npm run seed:scenarios -- --scenarios=beginner
```

#### 4. Authentication Issues

**Problem:** Cannot login with test users

**Solution:**
```bash
# Verify users were created
npm run seed:status

# Check emulator UI for Auth users
# Visit http://localhost:4000

# Reset and recreate users
npm run seed:reset:force
npm run seed:dev
```

#### 5. Data Validation Errors

**Problem:** Seeded data doesn't match expected structure

**Solution:**
```bash
# Run validation scripts
npm run validate:reset
node scripts/validate-user-creation-system.js

# Check for data integrity issues
node scripts/test-user-seeding-integration.js
```

### Debugging Commands

```bash
# Test CLI functionality
npm run test:cli

# Validate seeding implementation
node scripts/test-scenario-seeding-integration.js

# Debug specific user creation
node scripts/test-user-creation.js

# Debug workout log generation
node scripts/test-workout-log-generation.js
```

## Best Practices

### 1. Development Workflow

- **Always start with clean emulators** for consistent testing
- **Seed appropriate data volume** for your testing needs
- **Use scenario-specific seeding** for focused testing
- **Reset between major test sessions** to avoid data pollution

### 2. Testing Approach

- **Start with basic scenarios** for initial feature development
- **Use comprehensive scenarios** for integration testing
- **Test edge cases** with specialized scenarios (injury, time constraints)
- **Validate data integrity** with provided validation scripts

### 3. Performance Considerations

- **Use `--no-history` flag** for faster seeding during development
- **Seed specific scenarios** instead of comprehensive when possible
- **Use quiet mode** (`--quiet`) for automated scripts
- **Reset regularly** to prevent data accumulation

### 4. Data Management

- **Document test scenarios** used for specific bug reproductions
- **Use dry-run mode** to preview operations before execution
- **Validate seeded data** with status commands
- **Keep emulators running** during development sessions

### 5. Collaboration

- **Share specific seeding commands** with team members for bug reproduction
- **Document scenario usage** in test cases and bug reports
- **Use consistent seeding approaches** across the development team
- **Validate seeding system** with provided test scripts

This guide provides comprehensive coverage of the test data seeding system, enabling developers to effectively use realistic test data for thorough application testing and development.