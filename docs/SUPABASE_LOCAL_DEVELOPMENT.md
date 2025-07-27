# Supabase Local Development Guide

This guide covers setting up and using the Supabase local development environment for the exercise tracker application.

## Prerequisites

1. **Docker Desktop** - Required for running Supabase services locally
2. **Node.js** - Version 16 or higher
3. **Supabase CLI** - Installed via npm (included in devDependencies)

## Quick Start

### 1. Start Supabase Services

```bash
# Start all Supabase services
npm run supabase:start

# Or use the setup script for first-time setup
npm run supabase:setup
```

### 2. Validate Environment

```bash
# Check that everything is working
npm run validate:supabase:dev
```

### 3. Seed Test Data

```bash
# Seed basic test data
npm run supabase:seed

# Seed with verbose output
npm run supabase:seed:verbose

# Reset all test data
npm run supabase:seed:reset
```

### 4. Start Development

```bash
# Start React app with Supabase backend
npm run dev
```

## Available Services

When Supabase is running locally, you have access to:

- **API Server**: http://localhost:54321
- **Supabase Studio**: http://localhost:54323
- **Email Testing**: http://localhost:54324
- **PostgreSQL Database**: localhost:54322

## NPM Scripts Reference

### Core Supabase Commands

| Command | Description |
|---------|-------------|
| `npm run supabase:start` | Start Supabase services |
| `npm run supabase:stop` | Stop Supabase services |
| `npm run supabase:status` | Check service status |
| `npm run supabase:reset` | Reset database with migrations |
| `npm run supabase:studio` | Open Supabase Studio |

### Development Setup

| Command | Description |
|---------|-------------|
| `npm run supabase:setup` | Complete setup for first-time use |
| `npm run validate:supabase:dev` | Validate development environment |
| `npm run supabase:types` | Generate TypeScript types |

### Database Seeding

| Command | Description |
|---------|-------------|
| `npm run supabase:seed` | Seed basic test data |
| `npm run supabase:seed:verbose` | Seed with detailed output |
| `npm run supabase:seed:reset` | Reset all test data |
| `npm run supabase:seed:reset:force` | Force reset without confirmation |
| `npm run supabase:seed:status` | Show current data status |
| `npm run supabase:seed:help` | Show seeding help |

### Advanced Seeding

| Command | Description |
|---------|-------------|
| `npm run supabase:seed:database` | Run comprehensive database seeding |
| `npm run supabase:seed:database:verbose` | Comprehensive seeding with output |

## Database Schema

The PostgreSQL database includes the following main tables:

- **users** - User profiles and settings
- **exercises** - Exercise definitions (global and custom)
- **programs** - Workout programs
- **program_workouts** - Individual workouts within programs
- **program_exercises** - Exercises within workouts
- **workout_logs** - Completed workout sessions
- **workout_log_exercises** - Exercise data from completed workouts
- **user_analytics** - Aggregated user performance data

## Test Data

The seeding system provides several scenarios:

### Basic Scenario
- Simple test user with basic program
- Minimal historical data
- Good for basic development

### User Scenarios
- **Beginner**: New user with simple programs
- **Intermediate**: Experienced user with varied programs  
- **Advanced**: Expert user with complex programs
- **Comprehensive**: All scenarios combined

### Sample Users

When seeded, you'll have access to these test users:

| Email | Password | Level | Description |
|-------|----------|-------|-------------|
| test@example.com | testpass123 | Beginner | Basic test user |
| beginner@example.com | testpass123 | Beginner | New user scenario |
| intermediate@example.com | testpass123 | Intermediate | Experienced user |
| advanced@example.com | testpass123 | Advanced | Expert user |

## Development Workflow

### 1. Daily Development

```bash
# Start services
npm run supabase:start

# Validate everything is working
npm run validate:supabase:dev

# Start development
npm run dev
```

### 2. Database Changes

```bash
# After making schema changes
npm run supabase:reset

# Regenerate TypeScript types
npm run supabase:types

# Re-seed test data
npm run supabase:seed
```

### 3. Testing Different Scenarios

```bash
# Reset to clean state
npm run supabase:seed:reset:force

# Seed specific scenario
node scripts/seed/supabase/index.js seed --scenarios beginner,intermediate --verbose
```

## Troubleshooting

### Common Issues

#### Docker Not Running
```
Error: Docker is not running
```
**Solution**: Start Docker Desktop

#### Services Not Starting
```
Error: failed to inspect container health
```
**Solutions**:
1. Check Docker Desktop is running
2. Try: `npm run supabase:stop` then `npm run supabase:start`
3. Restart Docker Desktop

#### Database Connection Issues
```
Error: Supabase connection failed
```
**Solutions**:
1. Verify services are running: `npm run supabase:status`
2. Check environment variables in `.env.development`
3. Try resetting: `npm run supabase:reset`

#### Seeding Failures
```
Error: Failed to create test user
```
**Solutions**:
1. Reset database: `npm run supabase:reset`
2. Check database schema is up to date
3. Run with verbose output: `npm run supabase:seed:verbose`

### Environment Variables

Ensure these are set in `.env.development`:

```env
REACT_APP_SUPABASE_URL=http://127.0.0.1:54321
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

### Getting Help

1. **Check Status**: `npm run supabase:status`
2. **Validate Environment**: `npm run validate:supabase:dev`
3. **View Logs**: Check Docker Desktop logs
4. **Reset Everything**: `npm run supabase:stop && npm run supabase:start`

## Advanced Usage

### Custom Seeding

You can create custom seeding scenarios by modifying:
- `scripts/seed/supabase/seeder.js` - Core seeding logic
- `scripts/seed/supabase/seed-database.js` - Comprehensive seeding
- `supabase/seed.sql` - SQL-based seeding

### Database Migrations

Migrations are stored in `supabase/migrations/` and run automatically when:
- Starting Supabase: `npm run supabase:start`
- Resetting database: `npm run supabase:reset`

### Edge Functions

Edge Functions are stored in `supabase/functions/` and can be:
- Deployed: `npm run functions:deploy`
- Tested: `npm run functions:test`
- Served locally: `npm run functions:serve`

## Production Considerations

This local setup is for development only. For production:

1. Use hosted Supabase project
2. Update environment variables
3. Run proper migrations
4. Set up proper authentication
5. Configure production-grade security

## Next Steps

- Review the [Database Schema Documentation](./DATABASE_SCHEMA.md)
- Check out [Testing Guide](./TESTING_GUIDE.md)
- See [Deployment Guide](./DEPLOYMENT_GUIDE.md) for production setup