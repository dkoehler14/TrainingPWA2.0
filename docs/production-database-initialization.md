# Production Supabase Database Initialization Guide

This guide provides comprehensive steps to initialize the production Supabase database for the Exercise Tracker application.

## Prerequisites

- Supabase CLI installed and configured
- Production Supabase project created
- Environment variables configured
- Access to production deployment environment

## Environment Variables Required

Ensure these environment variables are set in your production environment:

```bash
REACT_APP_SUPABASE_URL=https://lgfxzuvkvjmlpzliohpd.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_anon_key_here
REACT_APP_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
REACT_APP_USE_SUPABASE=true
```

## Step-by-Step Initialization Process

### 1. Environment Setup & Verification

First, verify your production environment variables are properly configured:

```bash
# Verify production environment variables are set
echo $REACT_APP_SUPABASE_URL
echo $REACT_APP_SUPABASE_ANON_KEY
echo $REACT_APP_SUPABASE_SERVICE_ROLE_KEY
```

### 2. Link to Production Project

Connect your local Supabase CLI to the production project:

```bash
# Link your local Supabase CLI to the production project
supabase link --project-ref lgfxzuvkvjmlpzliohpd

# Verify the link is successful
supabase status
```

### 3. Apply Database Migrations

Apply all database migrations to create the complete schema:

```bash
# Apply all migrations to production database
supabase db push

# Alternative: Apply migrations individually to monitor progress
# supabase migration up --include-all
```

#### Migration Overview

The following migrations will be applied in order:

1. **Initial Schema** (`20240101000000_initial_schema.sql`)
   - Core tables: users, exercises, programs, workouts, workout_logs
   - Primary relationships and constraints

2. **Indexes** (`20240101000001_create_indexes.sql`)
   - Performance optimization indexes
   - Query optimization for common operations

3. **Row Level Security** (`20240101000002_row_level_security.sql`)
   - Security policies for data access control
   - User-based data isolation

4. **Authentication Triggers** (`20240101000003_auth_triggers.sql`)
   - Automatic user profile creation
   - Auth event handling

5. **User Auth Enhancements** (`20240101000004_enhance_user_auth_tables.sql`)
   - Extended user authentication features
   - Profile management improvements

6. **User Profile Extensions** (`20240101000005_user_profile_extension.sql`)
   - Additional user profile fields
   - Preference management

7. **Exercise & Program Enhancements** (`20240101000006_enhance_exercise_program_tables.sql`)
   - Enhanced exercise categorization
   - Program sharing and visibility features

8. **Workout Logging Analytics** (`20240101000007_enhance_workout_logging_analytics.sql`)
   - Analytics and reporting capabilities
   - Performance tracking features

9. **Bug Fixes and Optimizations** (remaining migrations)
   - Timestamp trigger fixes
   - RLS policy refinements
   - Admin role management
   - Duplicate prevention constraints

### 4. Deploy Edge Functions

Deploy all Supabase Edge Functions to production:

```bash
# Deploy all edge functions to production
supabase functions deploy

# Or deploy individually for better control:
supabase functions deploy coaching-insights
supabase functions deploy data-validation
supabase functions deploy process-workout
supabase functions deploy workout-triggers
```

#### Edge Functions Overview

- **coaching-insights**: AI-powered workout analysis and recommendations
- **data-validation**: Data integrity checks and validation
- **process-workout**: Workout processing and analytics
- **workout-triggers**: Database triggers for workout events

### 5. Seed Initial Data

Seed the database with essential global data:

```bash
# Option 1: Reset database with seed data (recommended for fresh setup)
supabase db reset --linked

# Option 2: Manually run the seed file
psql -h db.lgfxzuvkvjmlpzliohpd.supabase.co -U postgres -d postgres -f supabase/seed.sql

# Option 3: Use the comprehensive seeding system (for development data)
npm run seed:dev
```

#### Seed Data Includes

- **Global Exercises**: 24 pre-defined exercises covering all major muscle groups
- **Exercise Categories**: Chest, Back, Legs, Shoulders, Arms, Core
- **Exercise Types**: Barbell, Dumbbell, Bodyweight, Cable, Machine, etc.

### 6. Configure Authentication

Set up authentication settings for production:

```bash
# Update auth configuration for production domain
supabase auth update --site-url "https://your-production-domain.com"

# Configure additional redirect URLs if needed
supabase auth update --additional-redirect-urls "https://your-production-domain.com/auth/callback"
```

#### Authentication Features

- Email/password authentication
- Google OAuth integration
- User profile management
- Role-based access control (admin/user roles)

### 7. Set Up Production Monitoring

Enable monitoring and health checks:

```bash
# Enable production monitoring
npm run prod:monitor

# Verify edge functions are working
npm run test:edge-functions

# Test database connectivity
npm run test:supabase
```

### 8. Data Migration (Firebase to Supabase)

If migrating existing data from Firebase, use the migration orchestrator:

```bash
# Run the complete production migration strategy
node scripts/production-migration-strategy.js --environment=production

# Or run individual migration steps:
node scripts/migration/firestore-extractor.js
node scripts/migration/data-transformer.js  
node scripts/migration/postgres-importer.js
```

#### Migration Process

1. **Data Extraction**: Extract data from Firestore
2. **Data Transformation**: Convert Firebase data to PostgreSQL format
3. **Data Import**: Import transformed data to Supabase
4. **Verification**: Validate data integrity and relationships
5. **Rollback Preparation**: Set up rollback procedures

### 9. Verification & Testing

Run comprehensive tests to ensure everything is working:

```bash
# Run Supabase-specific tests
npm run test:supabase

# Run integration tests
npm run test:integration

# Run user acceptance tests
npm run test:user-acceptance

# Test specific functionality
node scripts/test-rls-policies.js
node scripts/test-with-service-role.mjs
```

#### Test Coverage

- **Database Schema**: Table structure and relationships
- **RLS Policies**: Security and access control
- **Edge Functions**: Function execution and responses
- **Authentication**: User registration and login flows
- **Data Operations**: CRUD operations and business logic

### 10. Final Configuration

Complete the setup with final configuration steps:

```bash
# Set production secrets and environment variables
supabase secrets set --env-file .env.production

# Verify all services are running correctly
supabase status --linked

# Check database health
supabase db inspect --linked
```

## Automated Initialization Script

For convenience, use the provided initialization script:

```bash
# Make the script executable
chmod +x scripts/initialize-production.sh

# Run the initialization script
./scripts/initialize-production.sh
```

The script automates steps 2-6 and includes verification checks.

## Post-Initialization Checklist

After completing the initialization, verify the following:

- [ ] All migrations applied successfully
- [ ] Edge functions deployed and responding
- [ ] Authentication working (test login/signup)
- [ ] RLS policies enforcing correct access control
- [ ] Global exercises seeded correctly
- [ ] Monitoring and logging configured
- [ ] Production environment variables set
- [ ] Database performance acceptable
- [ ] Backup procedures in place

## Important Security Considerations

### Row Level Security (RLS)

- All tables have RLS enabled
- Users can only access their own data
- Admin users have elevated permissions for global exercises
- Anonymous access is restricted

### API Keys

- Use anon key for client-side operations
- Service role key only for server-side operations
- Never expose service role key in client code
- Rotate keys regularly

### Database Access

- Direct database access restricted to authorized personnel
- Use Supabase Dashboard for administrative tasks
- Monitor database logs for suspicious activity

## Troubleshooting

### Common Issues

1. **Migration Failures**
   ```bash
   # Check migration status
   supabase migration list --linked
   
   # Repair migrations if needed
   supabase migration repair --status applied --version <version>
   ```

2. **Edge Function Deployment Issues**
   ```bash
   # Check function logs
   supabase functions logs <function-name>
   
   # Redeploy specific function
   supabase functions deploy <function-name> --no-verify-jwt
   ```

3. **Authentication Problems**
   ```bash
   # Check auth configuration
   supabase auth show --linked
   
   # Update auth settings
   supabase auth update --enable-signup=true
   ```

4. **RLS Policy Issues**
   ```bash
   # Test RLS policies
   node scripts/test-rls-policies.js
   
   # Check policy definitions in migration files
   ```

### Getting Help

- Check Supabase Dashboard for real-time logs
- Review migration files for schema details
- Consult the project's technical documentation
- Use Supabase CLI help: `supabase help`

## Monitoring and Maintenance

### Regular Tasks

- Monitor database performance metrics
- Review error logs and alerts
- Update dependencies and security patches
- Backup database regularly
- Monitor storage usage and costs

### Performance Optimization

- Review slow query logs
- Optimize indexes based on usage patterns
- Monitor edge function performance
- Adjust RLS policies for performance
- Consider read replicas for high traffic

## Rollback Procedures

If issues arise after initialization:

1. **Database Rollback**
   ```bash
   # Use the rollback manager
   node scripts/migration/rollback-manager.js
   ```

2. **Edge Function Rollback**
   ```bash
   # Redeploy previous version
   supabase functions deploy <function-name> --import-map-path ./previous-version/
   ```

3. **Configuration Rollback**
   ```bash
   # Restore previous configuration
   supabase auth update --site-url "https://previous-domain.com"
   ```

## Next Steps

After successful initialization:

1. Set up continuous deployment pipelines
2. Configure monitoring and alerting
3. Implement backup and disaster recovery procedures
4. Plan for scaling and performance optimization
5. Set up development and staging environments
6. Document operational procedures for the team

---

**Note**: This guide assumes a fresh production setup. If you're migrating from an existing system, additional steps may be required for data migration and system integration.