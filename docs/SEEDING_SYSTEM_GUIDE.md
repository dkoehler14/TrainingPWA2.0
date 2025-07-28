# Supabase Seeding System Guide

This guide covers the comprehensive PostgreSQL-compatible seeding system for development and testing with Supabase.

## Overview

The seeding system provides:
- **PostgreSQL-compatible seeding** with realistic test data
- **Advanced data generation** with progressive patterns
- **Database reset and cleanup utilities** with selective options
- **Development tools** for validation and optimization
- **Scenario-based seeding** for different testing needs

## Quick Start

### Basic Usage

```bash
# Start with a complete development workflow
npm run supabase:seeding:system workflow development

# Or use individual commands
npm run supabase:seed                    # Basic seeding
npm run supabase:seed:reset             # Reset database
npm run supabase:seed:status            # Check current status
```

### Advanced Usage

```bash
# Use the comprehensive seeding system
node scripts/seed/supabase/seeding-system.js seed comprehensive --verbose
node scripts/seed/supabase/seeding-system.js reset full --backup
node scripts/seed/supabase/seeding-system.js validate --verbose
```

## System Components

### 1. Main Seeding System (`seeding-system.js`)

The central controller that orchestrates all seeding operations.

**Key Features:**
- Unified interface for all seeding operations
- Multiple seeding methods (basic, comprehensive, advanced, scenario)
- Database reset with backup options
- Integrity validation and cleanup
- Predefined workflows for common tasks

**Usage:**
```bash
# Seed with different methods
node scripts/seed/supabase/seeding-system.js seed basic
node scripts/seed/supabase/seeding-system.js seed advanced --users=50 --weeks=12
node scripts/seed/supabase/seeding-system.js seed scenario --scenario=comprehensive

# Reset with different modes
node scripts/seed/supabase/seeding-system.js reset full --backup
node scripts/seed/supabase/seeding-system.js reset user-data --force

# Execute workflows
node scripts/seed/supabase/seeding-system.js workflow development
node scripts/seed/supabase/seeding-system.js workflow testing --verbose
```

### 2. Advanced Data Generator (`data-generator.js`)

Generates sophisticated test data with realistic patterns and user journeys.

**Features:**
- Diverse user profiles with varied experience levels
- Progressive workout data with realistic progression
- Comprehensive analytics generation
- Configurable data patterns (progression, plateau, deload)

**Usage:**
```bash
# Generate advanced test data
node scripts/seed/supabase/data-generator.js --users=25 --weeks=8 --verbose

# Or use via main system
node scripts/seed/supabase/seeding-system.js seed advanced --users=25 --weeks=8
```

### 3. Database Reset Utilities (`database-reset.js`)

Comprehensive database reset with multiple modes and backup functionality.

**Reset Modes:**
- **Full**: Complete database reset (preserves global exercises by default)
- **User Data**: Reset only user-generated data
- **Selective**: Reset specific tables or user data

**Features:**
- Automatic backup creation before reset
- Confirmation prompts (can be bypassed with --force)
- Detailed statistics and verification
- Rollback capabilities

**Usage:**
```bash
# Full reset with backup
node scripts/seed/supabase/database-reset.js reset --mode=full --backup

# User data only
node scripts/seed/supabase/database-reset.js reset --mode=user-data --force

# Check current statistics
node scripts/seed/supabase/database-reset.js stats --verbose
```

### 4. Development Utilities (`dev-utilities.js`)

Tools for database validation, performance testing, and debugging.

**Features:**
- Database integrity validation
- Performance testing and monitoring
- Data consistency checks
- Export functionality for debugging
- Cleanup and optimization tools

**Usage:**
```bash
# Validate database integrity
node scripts/seed/supabase/dev-utilities.js validate --verbose

# Clean up and optimize
node scripts/seed/supabase/dev-utilities.js cleanup --fix

# Export database info for debugging
node scripts/seed/supabase/dev-utilities.js export --include-data
```

### 5. Seeding Scenarios (`seeding-scenarios.js`)

Predefined scenarios for different testing and development needs.

**Available Scenarios:**
- **minimal**: Basic setup with minimal data
- **basic**: Standard development setup
- **comprehensive**: Full test data with all user types
- **performance**: Large dataset for performance testing
- **userJourneys**: Realistic user progression scenarios
- **analytics**: Rich dataset for analytics testing
- **mobile**: Optimized for mobile app testing
- **edge_cases**: Data for testing edge cases

**Usage:**
```bash
# List available scenarios
node scripts/seed/supabase/seeding-scenarios.js list

# Execute specific scenario
node scripts/seed/supabase/seeding-scenarios.js comprehensive --verbose

# Interactive selection
node scripts/seed/supabase/seeding-scenarios.js interactive

# Get recommendations
node scripts/seed/supabase/seeding-scenarios.js recommend development
```

## Workflows

### Development Workflow
```bash
node scripts/seed/supabase/seeding-system.js workflow development
```
1. Reset user data (preserving exercises)
2. Seed comprehensive test data
3. Ready for development

### Testing Workflow
```bash
node scripts/seed/supabase/seeding-system.js workflow testing
```
1. Full database reset
2. Comprehensive scenario seeding
3. Database validation
4. Ready for testing

### Performance Workflow
```bash
node scripts/seed/supabase/seeding-system.js workflow performance
```
1. Full database reset
2. Advanced seeding with large dataset
3. Database validation
4. Ready for performance testing

### Cleanup Workflow
```bash
node scripts/seed/supabase/seeding-system.js workflow cleanup
```
1. Database validation
2. Cleanup and optimization
3. Database health check

## NPM Scripts

### Basic Seeding Scripts
```bash
npm run supabase:seed                    # Basic seeding
npm run supabase:seed:verbose           # Basic seeding with verbose output
npm run supabase:seed:reset             # Reset database
npm run supabase:seed:reset:force       # Force reset without confirmation
npm run supabase:seed:status            # Show current database status
```

### Advanced Seeding Scripts
```bash
npm run supabase:seed:database          # Comprehensive database seeding
npm run supabase:seed:advanced          # Advanced data generation
npm run supabase:seed:scenarios         # Interactive scenario selection
npm run supabase:reset:advanced         # Advanced reset with options
```

### Development and Testing Scripts
```bash
npm run supabase:dev:validate           # Validate database integrity
npm run supabase:dev:cleanup            # Clean up and optimize database
npm run supabase:dev:export             # Export database info for debugging
npm run supabase:seeding:system         # Access main seeding system
npm run supabase:seeding:test           # Run seeding system tests
```

## Configuration

### Environment Variables
```bash
REACT_APP_SUPABASE_URL=http://127.0.0.1:54321
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # For seeding operations
```

### Seeding Options
Most commands support these common options:
- `--verbose` / `-v`: Show detailed progress information
- `--quiet` / `-q`: Suppress most output
- `--force` / `-f`: Skip confirmation prompts
- `--dry-run`: Show what would be done without executing
- `--backup`: Create backup before destructive operations

## Testing the System

### Run Comprehensive Tests
```bash
npm run supabase:seeding:test
```

This runs a complete test suite that validates:
- System initialization
- Database connection
- All seeding methods
- Reset functionality
- Validation tools
- Workflow execution

### Manual Testing
```bash
# Test basic functionality
node scripts/seed/supabase/seeding-system.js status
node scripts/seed/supabase/seeding-system.js seed basic --verbose
node scripts/seed/supabase/seeding-system.js validate
node scripts/seed/supabase/seeding-system.js reset user-data --force

# Test advanced features
node scripts/seed/supabase/seeding-system.js seed advanced --users=10 --weeks=4
node scripts/seed/supabase/seeding-system.js workflow development
```

## Troubleshooting

### Common Issues

1. **Supabase not running**
   ```bash
   # Start Supabase
   npm run supabase:start
   
   # Verify connection
   npm run supabase:seed:status
   ```

2. **Database schema issues**
   ```bash
   # Reset and migrate
   npm run supabase:reset
   npm run supabase:migrate
   
   # Then seed
   npm run supabase:seed
   ```

3. **Seeding failures**
   ```bash
   # Check database integrity
   npm run supabase:dev:validate --verbose
   
   # Clean up and retry
   npm run supabase:dev:cleanup
   npm run supabase:seed
   ```

4. **Performance issues**
   ```bash
   # Check database statistics
   npm run supabase:reset:stats
   
   # Optimize database
   npm run supabase:dev:cleanup --vacuum
   ```

### Debug Mode
For detailed debugging, use verbose mode and check logs:
```bash
node scripts/seed/supabase/seeding-system.js seed basic --verbose --dry-run
```

### Export Database State
For troubleshooting, export current database state:
```bash
npm run supabase:dev:export --include-data --verbose
```

## Best Practices

### Development
1. Use the `development` workflow for daily development
2. Reset user data regularly to test with fresh data
3. Use scenarios that match your current development focus

### Testing
1. Use the `testing` workflow for comprehensive test setup
2. Validate database integrity before important tests
3. Use edge case scenarios for thorough testing

### Performance Testing
1. Use the `performance` workflow with large datasets
2. Monitor database performance during seeding
3. Clean up and optimize regularly

### Production Preparation
1. Never run seeding tools against production
2. Test migration scripts with realistic data volumes
3. Validate data integrity before deployment

## API Reference

### SupabaseSeedingSystem Class

```javascript
const { SupabaseSeedingSystem } = require('./scripts/seed/supabase/seeding-system');

const system = new SupabaseSeedingSystem({
  verbose: true,
  dryRun: false,
  force: false
});

// Initialize system
await system.initialize();

// Seed database
await system.seed('comprehensive', { scenarios: ['basic', 'advanced'] });

// Reset database
await system.reset('user-data', { backup: true });

// Validate integrity
await system.validate();

// Execute workflow
await system.executeWorkflow('development');
```

### Individual Functions

```javascript
// Data generation
const { generateAdvancedTestData } = require('./scripts/seed/supabase/data-generator');
await generateAdvancedTestData({ userCount: 25, weeksOfHistory: 8 });

// Database reset
const { resetDatabase } = require('./scripts/seed/supabase/database-reset');
await resetDatabase({ mode: 'full', createBackup: true });

// Validation
const { validateDatabaseIntegrity } = require('./scripts/seed/supabase/dev-utilities');
await validateDatabaseIntegrity({ verbose: true, fix: true });

// Scenarios
const { executeScenario } = require('./scripts/seed/supabase/seeding-scenarios');
await executeScenario('comprehensive', { verbose: true });
```

## Contributing

When adding new features to the seeding system:

1. **Follow the established patterns** in existing files
2. **Add comprehensive error handling** and logging
3. **Include verbose mode support** for debugging
4. **Add tests** to the test suite
5. **Update documentation** with new features
6. **Use consistent naming** and code style

### Adding New Scenarios
1. Add scenario definition to `SCENARIOS` in `seeding-scenarios.js`
2. Test the scenario thoroughly
3. Update documentation with scenario description
4. Add NPM script if commonly used

### Adding New Utilities
1. Follow the pattern in `dev-utilities.js`
2. Include proper error handling and logging
3. Add command-line interface if standalone
4. Add tests to the test suite
5. Update main seeding system integration

This seeding system provides a robust foundation for PostgreSQL-compatible development and testing with Supabase, supporting all the requirements for task 9.3.