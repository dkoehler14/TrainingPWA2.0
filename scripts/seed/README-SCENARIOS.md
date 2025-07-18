# Scenario-Based Test Data Seeding

This document explains how to use the scenario-based test data seeding system to populate Firebase emulators with realistic user personas and data patterns.

## Overview

The scenario-based seeding system creates different user personas, each with unique characteristics, workout patterns, and data behaviors. This enables comprehensive testing of various user journeys and edge cases.

## Available User Scenarios

### Core Scenarios (Basic Group)

#### 1. Complete Beginner (`beginner`)
- **Email**: `beginner@test.com`
- **Experience**: New to weightlifting
- **Characteristics**:
  - 75% workout completion rate
  - 3% weekly progression (fast beginner gains)
  - 8 weeks of workout history
  - Basic equipment (barbell, dumbbells, bench)
  - Goals: strength, muscle gain

#### 2. Intermediate Lifter (`intermediate`)
- **Email**: `intermediate@test.com`
- **Experience**: 2 years of consistent training
- **Characteristics**:
  - 85% workout completion rate
  - 2% weekly progression
  - 16 weeks of workout history
  - Full gym equipment
  - Goals: strength, powerlifting

#### 3. Advanced Competitor (`advanced`)
- **Email**: `advanced@test.com`
- **Experience**: 5+ years, competitive powerlifter
- **Characteristics**:
  - 95% workout completion rate
  - 1% weekly progression (slower advanced gains)
  - 24 weeks of workout history
  - Specialty equipment
  - Goals: competition, strength
  - Uses KG units

### Extended Scenarios

#### 4. Returning Lifter (`returning`)
- **Email**: `returning@test.com`
- **Experience**: Previously trained, returning after break
- **Characteristics**:
  - 80% workout completion rate
  - 2.5% weekly progression (muscle memory)
  - 12 weeks of comeback history
  - Conservative approach

#### 5. Injury Recovery (`injury_recovery`)
- **Email**: `recovery@test.com`
- **Experience**: Working around injury limitations
- **Characteristics**:
  - 90% workout completion rate (very consistent)
  - 1.5% weekly progression (conservative)
  - 20 weeks of recovery-focused training
  - Modified equipment (no barbells)
  - Goals: injury prevention, mobility
  - Has injury history

#### 6. Busy Professional (`busy_professional`)
- **Email**: `professional@test.com`
- **Experience**: Time-constrained professional
- **Characteristics**:
  - 70% workout completion rate (busy schedule)
  - 2% weekly progression
  - 14 weeks of on-and-off training
  - Time-efficient workouts (45 minutes)
  - Goals: general fitness, time efficiency

## Scenario Groups

### Predefined Groups
- **`basic`**: beginner, intermediate, advanced (3 users)
- **`extended`**: basic + returning, injury_recovery (5 users)
- **`comprehensive`**: extended + busy_professional (6 users)
- **`all`**: All available scenarios (6 users)

## Usage

### Command Line Interface

#### Basic Usage
```bash
# Seed basic scenarios (beginner, intermediate, advanced)
npm run seed:scenarios

# Seed with verbose output
npm run seed:scenarios:basic

# Seed comprehensive scenarios (all persona types)
npm run seed:scenarios:comprehensive

# Show help
npm run seed:scenarios:help
```

#### Advanced Usage
```bash
# Custom scenario selection
npm run seed:scenarios -- --scenarios=beginner,returning

# Specific scenario group
npm run seed:scenarios -- --scenarios=extended --verbose

# All scenarios without historical data
npm run seed:scenarios -- --scenarios=all --no-history

# Single scenario with detailed logging
npm run seed:scenarios -- --scenarios=injury_recovery --verbose
```

### Available Options

- `--scenarios=<selection>`: Scenario selection
  - Individual: `beginner`, `intermediate`, `advanced`, etc.
  - Multiple: `beginner,intermediate,advanced`
  - Groups: `basic`, `extended`, `comprehensive`, `all`
- `--verbose`, `-v`: Enable detailed logging
- `--no-history`: Skip historical workout log generation
- `--help`, `-h`: Show help information

### Programmatic Usage

```javascript
const { seedAll } = require('./seed/seeder');
const { getSeedingConfig } = require('./seed/config/scenarios');

// Get scenario configuration
const config = getSeedingConfig('comprehensive', { verbose: true });
console.log(`Will create ${config.totalUsers} users`);

// Seed with scenarios
await seedAll({
  scenarios: 'comprehensive',
  verbose: true,
  includeHistoricalData: true
});
```

## Data Patterns

Each scenario generates realistic data patterns:

### Workout Consistency
- **Beginner**: 75% (still building habit)
- **Intermediate**: 85% (established routine)
- **Advanced**: 95% (very disciplined)
- **Injury Recovery**: 90% (focused on recovery)
- **Busy Professional**: 70% (time constraints)

### Progression Rates (per week)
- **Beginner**: 3% (fast initial gains)
- **Intermediate**: 2% (steady progression)
- **Advanced**: 1% (slower advanced gains)
- **Injury Recovery**: 1.5% (conservative)
- **Returning**: 2.5% (muscle memory)

### Historical Data
- **Beginner**: 8 weeks (new to training)
- **Intermediate**: 16 weeks (established training)
- **Advanced**: 24 weeks (extensive history)
- **Injury Recovery**: 20 weeks (recovery focus)
- **Busy Professional**: 14 weeks (inconsistent)

## Generated Test Data

### User Accounts
Each scenario creates:
- Firebase Auth account with email/password
- Firestore user profile with detailed characteristics
- Scenario-specific preferences and limitations

### Workout Programs
- Experience-appropriate program templates
- Beginner: Starting Strength (3x5 compound movements)
- Intermediate: 5/3/1 (percentage-based progression)
- Advanced: Conjugate Method (max/dynamic effort)

### Exercise Database
- 50+ exercises with proper categorization
- Muscle groups, equipment types, instructions
- Both global and user-specific exercises

### Historical Workout Logs
- Realistic progression patterns
- Missed workouts and plateaus
- Performance variations
- Scenario-specific completion rates

## Testing Workflows

### Development Testing
```bash
# Quick setup for basic testing
npm run seed:scenarios:basic

# Comprehensive testing environment
npm run seed:scenarios:comprehensive

# Test specific user journey
npm run seed:scenarios -- --scenarios=returning --verbose
```

### Feature Testing
```bash
# Test injury-related features
npm run seed:scenarios -- --scenarios=injury_recovery

# Test time-constrained workflows
npm run seed:scenarios -- --scenarios=busy_professional

# Test progression tracking
npm run seed:scenarios -- --scenarios=beginner,advanced
```

### Integration Testing
```bash
# Test scenario system
node scripts/test-scenario-seeding-integration.js

# Validate implementation
npm run validate:reset
```

## Test User Credentials

All test users use the password: `test123`

| Scenario | Email | Experience | Special Notes |
|----------|-------|------------|---------------|
| Beginner | beginner@test.com | New lifter | Fast progression |
| Intermediate | intermediate@test.com | 2 years | Balanced approach |
| Advanced | advanced@test.com | 5+ years | Uses KG, competitive |
| Returning | returning@test.com | Comeback | Muscle memory gains |
| Injury Recovery | recovery@test.com | Modified training | No barbells |
| Busy Professional | professional@test.com | Time-limited | 45min workouts |

## Troubleshooting

### Common Issues

1. **Emulators not running**
   ```bash
   # Start Firebase emulators first
   npm run dev:firebase
   ```

2. **Invalid scenario names**
   ```bash
   # Check available scenarios
   npm run seed:scenarios:help
   ```

3. **Permission errors**
   ```bash
   # Reset and try again
   npm run seed:reset:force
   npm run seed:scenarios
   ```

### Validation

```bash
# Test the scenario system
node scripts/test-scenario-seeding-integration.js

# Validate specific scenarios
npm run seed:scenarios -- --scenarios=basic --verbose
```

## Extending Scenarios

To add new scenarios, edit `scripts/seed/config/scenarios.js`:

1. Add new scenario to `USER_SCENARIOS`
2. Include in appropriate `SCENARIO_GROUPS`
3. Define realistic `dataPatterns`
4. Update tests and documentation

## Best Practices

1. **Start with basic scenarios** for initial development
2. **Use comprehensive scenarios** for thorough testing
3. **Reset between test runs** to ensure clean state
4. **Use verbose logging** when debugging issues
5. **Match scenarios to test cases** for relevant data patterns

## Integration with Development Workflow

The scenario-based seeding integrates with existing development tools:

- **Hot reloading**: Seeded data persists during development
- **Reset functionality**: Clean slate between test runs
- **Debug panel**: View seeded data in development UI
- **Validation scripts**: Ensure data integrity

This system provides a comprehensive foundation for testing all aspects of the fitness application with realistic, varied user data.