# Test Data Seeding CLI

This document describes the command-line interface for managing test data in Firebase emulators.

## Overview

The test data seeding CLI provides a comprehensive set of commands for managing realistic test data in your Firebase emulators. It supports multiple user scenarios, workout programs, exercises, and historical data generation.

## Quick Start

```bash
# Seed basic test data
npm run seed:dev

# Reset all test data
npm run seed:reset

# Show help
npm run seed:help

# Check current data status
npm run seed:status
```

## Commands

### `seed` - Seed Test Data

Seeds test data into Firebase emulators with realistic user scenarios.

```bash
# Basic seeding
node scripts/seed/index.js seed

# Seed specific scenarios
node scripts/seed/index.js seed --scenarios beginner,intermediate

# Seed with verbose output
node scripts/seed/index.js seed --verbose

# Skip historical data generation
node scripts/seed/index.js seed --no-history

# Dry run (show what would be done)
node scripts/seed/index.js seed --dry-run
```

### `reset` - Reset Test Data

Removes all test data from Firebase emulators.

```bash
# Reset with confirmation
node scripts/seed/index.js reset

# Force reset without confirmation
node scripts/seed/index.js reset --force

# Dry run reset
node scripts/seed/index.js reset --dry-run
```

### `status` - Show Data Status

Displays current test data status in Firebase emulators.

```bash
# Show current data counts
node scripts/seed/index.js status
```

### `help` - Show Help

Displays comprehensive help information.

```bash
# Show help
node scripts/seed/index.js help
```

## Options

### Seeding Options

- `--scenario <name>` - Single scenario (basic, beginner, intermediate, advanced)
- `--scenarios <list>` - Multiple scenarios (comma-separated)
- `--no-history` - Skip historical workout log generation
- `--dry-run` - Show what would be done without executing

### General Options

- `-v, --verbose` - Show detailed progress information
- `-q, --quiet` - Suppress most output (errors only)
- `-f, --force` - Skip confirmation prompts
- `-h, --help` - Show help message
- `--version` - Show version information

## NPM Scripts

The following npm scripts are available for convenience:

### Basic Operations
- `npm run seed:dev` - Seed basic test data
- `npm run seed:reset` - Reset all test data
- `npm run seed:status` - Show current data status
- `npm run seed:help` - Show help information

### Verbose Operations
- `npm run seed:dev:verbose` - Seed with detailed output
- `npm run seed:dev:quiet` - Seed with minimal output

### Dry Run Operations
- `npm run seed:dev:dry-run` - Preview seeding without execution
- `npm run seed:reset:dry-run` - Preview reset without execution

### Force Operations
- `npm run seed:reset:force` - Reset without confirmation

### Scenario-Based Operations
- `npm run seed:scenarios` - Interactive scenario selection
- `npm run seed:scenarios:basic` - Seed basic scenarios
- `npm run seed:scenarios:extended` - Seed extended scenarios
- `npm run seed:scenarios:comprehensive` - Seed all scenarios

### Testing
- `npm run test:cli` - Test CLI functionality

## Available Scenarios

### Individual Scenarios
- **basic** - Simple test setup with one user of each type
- **beginner** - New user with basic programs and minimal history
- **intermediate** - Experienced user with varied programs and progress
- **advanced** - Expert user with complex programs and extensive history

### Scenario Groups
- **comprehensive** - All scenarios with maximum test data

## Examples

### Basic Usage

```bash
# Start with clean emulators and seed basic data
npm run seed:reset:force
npm run seed:dev

# Check what was created
npm run seed:status
```

### Advanced Usage

```bash
# Seed multiple specific scenarios with verbose output
npm run seed:dev -- --scenarios beginner,advanced --verbose

# Preview what would be reset
npm run seed:reset:dry-run

# Force reset and seed comprehensive data
npm run seed:reset:force
npm run seed:dev -- --scenarios comprehensive --verbose
```

### Development Workflow

```bash
# Quick setup for testing
npm run seed:dev:quiet

# Reset and try different scenarios
npm run seed:reset:force
npm run seed:dev -- --scenarios intermediate --no-history

# Check current state
npm run seed:status
```

## Progress Reporting

The CLI provides detailed progress reporting with:

- **Step-by-step progress** - Shows current operation and step number
- **Timing information** - Reports duration for each major operation
- **Summary tables** - Displays results in formatted tables
- **User credentials** - Shows test user login information
- **Error handling** - Provides helpful error messages and suggestions

### Verbose Output Example

```
🚀 [2:30:15 PM] Starting scenario-based test data seeding process

📊 Seeding Configuration
──────────────────────────────────────────────────
  Scenarios: beginner,intermediate
  Include Historical Data: true
  Verbose Logging: true
  Total Steps: 4

🔄 [2:30:15 PM] [1/4] Seeding exercise database
✅ [2:30:16 PM] Exercise database seeding completed in 0.85s

🔄 [2:30:16 PM] [2/4] Creating scenario-based test users
✅ [2:30:17 PM] User creation completed in 1.23s

📧 Test User Credentials:
──────────────────────────────────────────────────────────────────────
  Email                    | Scenario      | Password
──────────────────────────────────────────────────────────────────────
  beginner@test.com        | Beginner      | test123
  intermediate@test.com    | Intermediate  | test123
──────────────────────────────────────────────────────────────────────

🔄 [2:30:17 PM] [3/4] Creating scenario-specific workout programs
✅ [2:30:18 PM] Program creation completed in 0.67s

🔄 [2:30:18 PM] [4/4] Generating scenario-based workout logs
✅ [2:30:20 PM] Workout log generation completed in 1.45s

✅ [2:30:20 PM] Complete seeding process completed in 4.20s

📊 Seeding Results
──────────────────────────────────────────────────
  Exercise Database: 45 exercises
  Test Users: 2 users
  Workout Programs: 4 programs
  Historical Data: Generated
  Total Duration: 4.20s

🎉 [2:30:20 PM] Seeding completed successfully!
```

## Error Handling

The CLI provides comprehensive error handling:

- **Emulator validation** - Checks if Firebase emulators are running
- **Graceful failures** - Provides helpful error messages
- **Recovery suggestions** - Suggests solutions for common issues
- **Verbose error mode** - Shows full stack traces when needed

### Common Error Scenarios

1. **Emulators not running**
   ```
   ❌ Error: Cannot seed data: Auth emulator not available
   💡 Make sure Auth emulator is running on the expected port
      Run: npm run dev:firebase
   ```

2. **Invalid scenario**
   ```
   ❌ Configuration Error: Invalid scenario 'invalid-scenario'
   💡 Suggestions:
     - Did you mean 'intermediate'?
     - Available scenarios: basic, beginner, intermediate, advanced
   ```

3. **Network issues**
   ```
   ❌ Error: Connection refused - emulator not running
   Use --verbose flag for detailed error information.
   ```

## Testing

The CLI includes comprehensive testing:

```bash
# Test all CLI functionality
npm run test:cli

# Test specific functionality
node scripts/test-cli-functionality.js
```

The test suite validates:
- All command-line options
- Argument parsing
- Error handling
- NPM script integration
- Help and version commands
- Dry-run functionality

## Integration with Development Workflow

The CLI is designed to integrate seamlessly with your development workflow:

1. **Start emulators**: `npm run dev:firebase`
2. **Seed test data**: `npm run seed:dev`
3. **Start React app**: `npm run dev:react`
4. **Reset when needed**: `npm run seed:reset`

Or use the combined development command:
```bash
npm run dev  # Starts both React and Firebase emulators
```

Then in another terminal:
```bash
npm run seed:dev  # Seed test data
```

## Troubleshooting

### Common Issues

1. **Command not found**
   - Ensure you're in the project root directory
   - Check that npm dependencies are installed: `npm install`

2. **Emulator connection errors**
   - Start Firebase emulators: `npm run dev:firebase`
   - Check emulator ports in firebase.json
   - Verify emulator status: `npm run seed:status`

3. **Permission errors**
   - On Unix systems, ensure scripts are executable: `chmod +x scripts/seed/index.js`

4. **Slow performance**
   - Use `--no-history` to skip historical data generation
   - Use `--quiet` to reduce output overhead
   - Consider using specific scenarios instead of 'comprehensive'

### Getting Help

- Use `npm run seed:help` for comprehensive help
- Use `--verbose` flag for detailed error information
- Check the test suite: `npm run test:cli`
- Review the logs for specific error messages