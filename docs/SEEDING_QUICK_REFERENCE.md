# Test Data Seeding - Quick Reference

## Essential Commands

```bash
# Basic Operations
npm run seed:dev                    # Seed basic test data (3 users)
npm run seed:reset:force           # Reset all data without confirmation
npm run seed:status                # Show current data status

# Scenario-Based Seeding
npm run seed:scenarios:basic       # 3 users: beginner, intermediate, advanced
npm run seed:scenarios:comprehensive # 6 users: all scenarios

# Advanced Options
npm run seed:dev:verbose           # Detailed progress output
npm run seed:dev -- --no-history  # Skip historical data (faster)
npm run seed:dev:dry-run          # Preview without executing
```

## Test User Credentials

| Email | Password | Experience | Key Features |
|-------|----------|------------|--------------|
| `beginner@test.com` | `test123` | New lifter | Fast progression, 75% completion |
| `intermediate@test.com` | `test123` | 2 years | Steady progress, 85% completion |
| `advanced@test.com` | `test123` | 5+ years | **Uses KG units**, 95% completion |
| `returning@test.com` | `test123` | Comeback | Muscle memory gains |
| `recovery@test.com` | `test123` | Injury recovery | **No barbells**, modified exercises |
| `professional@test.com` | `test123` | Time-limited | **45min workouts**, 70% completion |

## Common Workflows

### Quick Development Setup
```bash
npm run dev:firebase    # Start emulators
npm run seed:dev       # Seed basic data
npm run dev:react      # Start React app
```

### Bug Reproduction
```bash
npm run seed:reset:force
npm run seed:scenarios -- --scenarios=advanced --verbose
# Login as advanced@test.com for KG unit testing
```

### Feature Testing
```bash
npm run seed:scenarios:comprehensive  # All user types
# Test feature across different user scenarios
```

### Performance Testing
```bash
npm run seed:scenarios:comprehensive  # Maximum data volume
# Advanced user has 24 weeks of workout history
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection errors | `npm run dev:firebase` then retry |
| Inconsistent data | `npm run seed:reset:force` then reseed |
| Slow seeding | Use `--no-history` flag |
| Auth issues | Check http://localhost:4000 for emulator UI |

## Data Patterns

| User Type | Completion Rate | Progression | History | Special Notes |
|-----------|----------------|-------------|---------|---------------|
| Beginner | 75% | 3%/week | 8 weeks | Fast gains, form issues |
| Intermediate | 85% | 2%/week | 16 weeks | Steady progress |
| Advanced | 95% | 1%/week | 24 weeks | KG units, competition focus |
| Returning | 80% | 2.5%/week | 12 weeks | Muscle memory effect |
| Recovery | 90% | 1.5%/week | 20 weeks | No barbells, conservative |
| Professional | 70% | 2%/week | 14 weeks | Time constraints |

## Validation Commands

```bash
npm run test:cli                           # Test CLI functionality
node scripts/validate-user-creation-system.js  # Validate user creation
node scripts/test-scenario-seeding-integration.js  # Test scenarios
```