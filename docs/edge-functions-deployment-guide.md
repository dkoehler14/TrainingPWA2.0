# Edge Functions Deployment Guide

This guide provides comprehensive instructions for deploying, managing, and maintaining Supabase Edge Functions in the Exercise Tracker application.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Deployment Pipeline](#deployment-pipeline)
5. [Staging Deployment](#staging-deployment)
6. [Production Deployment](#production-deployment)
7. [Verification and Testing](#verification-and-testing)
8. [Rollback Procedures](#rollback-procedures)
9. [Monitoring and Maintenance](#monitoring-and-maintenance)
10. [Troubleshooting](#troubleshooting)

## Overview

The Edge Functions deployment pipeline provides automated deployment, verification, and rollback capabilities for the following functions:

- **coaching-insights**: Generates personalized coaching insights based on user analytics
- **data-validation**: Validates and sanitizes data before database operations
- **process-workout**: Processes completed workouts and updates user analytics
- **workout-triggers**: Handles database triggers and automated tasks

### Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Development   │───▶│     Staging     │───▶│   Production    │
│                 │    │                 │    │                 │
│ Local Testing   │    │ Integration     │    │ Live System     │
│ Function Dev    │    │ Testing         │    │ User Traffic    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Supabase Local  │    │ Staging Project │    │ Prod Project    │
│ Development     │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Prerequisites

Before deploying Edge Functions, ensure you have:

### Required Tools
- [Supabase CLI](https://supabase.com/docs/guides/cli) v1.0.0 or later
- Node.js v18 or later
- Git (for version control and rollback)

### Environment Access
- Supabase account with project access
- Staging and production project references
- Appropriate environment variables configured

### Authentication
```bash
# Login to Supabase CLI
supabase login

# Verify access to projects
supabase projects list
```

## Environment Setup

### Environment Variables

Create environment-specific configuration:

```bash
# Staging Environment
export SUPABASE_STAGING_PROJECT_REF="your-staging-project-ref"
export SUPABASE_STAGING_URL="https://your-staging-project.supabase.co"
export SUPABASE_STAGING_ANON_KEY="your-staging-anon-key"

# Production Environment
export SUPABASE_PROJECT_REF="your-production-project-ref"
export REACT_APP_SUPABASE_URL="https://your-production-project.supabase.co"
export REACT_APP_SUPABASE_ANON_KEY="your-production-anon-key"

# Optional: For testing with authentication
export TEST_AUTH_TOKEN="your-test-user-jwt-token"
```

### Project Structure

```
supabase/
├── functions/
│   ├── _shared/           # Shared utilities and types
│   ├── coaching-insights/ # Coaching insights function
│   ├── data-validation/   # Data validation function
│   ├── process-workout/   # Workout processing function
│   └── workout-triggers/  # Database triggers function
└── config.toml           # Supabase configuration

scripts/
├── deploy-edge-functions.js      # Main deployment script
├── edge-functions-verification.js # Testing and verification
├── edge-functions-rollback.js    # Rollback management
└── edge-functions-ci.yml         # CI/CD workflow template
```

## Deployment Pipeline

### Available Scripts

```bash
# Deploy all functions to staging
npm run edge-functions:deploy:staging

# Deploy all functions to production
npm run edge-functions:deploy:production

# Dry run deployment (shows what would be deployed)
npm run edge-functions:deploy:dry-run

# Verify deployed functions
npm run edge-functions:verify:staging
npm run edge-functions:verify:production

# Run health checks
npm run edge-functions:health-check staging
npm run edge-functions:health-check production

# Show deployment plan
npm run edge-functions:plan staging
```

### Manual Deployment Commands

```bash
# Deploy specific function
node scripts/deploy-edge-functions.js deploy staging coaching-insights

# Deploy all functions in parallel
node scripts/deploy-edge-functions.js deploy staging --parallel

# Deploy with error continuation
node scripts/deploy-edge-functions.js deploy staging --continue-on-error

# Verify specific function
node scripts/deploy-edge-functions.js verify staging coaching-insights
```

## Staging Deployment

### Pre-deployment Checklist

- [ ] All functions pass local testing
- [ ] Environment variables are configured
- [ ] Staging database is up to date
- [ ] No breaking changes in shared dependencies

### Deployment Process

1. **Validate Environment**
   ```bash
   node scripts/deploy-edge-functions.js plan staging
   ```

2. **Deploy Functions**
   ```bash
   # Option 1: Sequential deployment (safer)
   node scripts/deploy-edge-functions.js deploy staging

   # Option 2: Parallel deployment (faster)
   node scripts/deploy-edge-functions.js deploy staging --parallel
   ```

3. **Verify Deployment**
   ```bash
   node scripts/edge-functions-verification.js comprehensive staging
   ```

4. **Run Integration Tests**
   ```bash
   # With authentication token
   TEST_AUTH_TOKEN="your-token" node scripts/edge-functions-verification.js comprehensive staging --load-test
   ```

### Staging Verification

The verification process includes:

- **Connectivity Tests**: CORS preflight, response time, error handling
- **Authentication Tests**: JWT token validation, unauthorized access
- **Load Tests**: Concurrent requests, performance benchmarks
- **Integration Tests**: End-to-end function workflows

## Production Deployment

### Pre-deployment Requirements

- [ ] Successful staging deployment and testing
- [ ] Code review and approval
- [ ] Backup of current production functions
- [ ] Maintenance window scheduled (if required)
- [ ] Rollback plan prepared

### Production Deployment Process

1. **Create Rollback Point**
   ```bash
   node scripts/edge-functions-rollback.js rollback-point production v1.2.0 "Pre-deployment backup"
   ```

2. **Pre-deployment Health Check**
   ```bash
   node scripts/deploy-edge-functions.js health-check production
   ```

3. **Deploy to Production**
   ```bash
   # Production deployment (sequential for safety)
   node scripts/deploy-edge-functions.js deploy production
   ```

4. **Verify Production Deployment**
   ```bash
   node scripts/edge-functions-verification.js comprehensive production
   ```

5. **Post-deployment Monitoring**
   ```bash
   # Monitor for 15 minutes after deployment
   node scripts/deploy-edge-functions.js health-check production
   ```

### Blue-Green Deployment (Advanced)

For zero-downtime deployments:

1. Deploy to staging environment
2. Update DNS/routing to point to staging
3. Monitor for issues
4. If successful, promote staging to production
5. If issues, revert DNS/routing

## Verification and Testing

### Connectivity Testing

```bash
# Test basic connectivity
node scripts/edge-functions-verification.js connectivity staging

# Test specific function
node scripts/edge-functions-verification.js connectivity staging coaching-insights
```

### Authentication Testing

```bash
# Test with authentication token
TEST_AUTH_TOKEN="jwt-token" node scripts/edge-functions-verification.js auth staging

# Test specific function with auth
TEST_AUTH_TOKEN="jwt-token" node scripts/edge-functions-verification.js auth staging process-workout
```

### Load Testing

```bash
# Load test specific function
node scripts/edge-functions-verification.js load staging process-workout 10 50

# Parameters: function, concurrency, total requests
```

### Comprehensive Testing

```bash
# Full test suite
node scripts/edge-functions-verification.js comprehensive staging

# With load testing
node scripts/edge-functions-verification.js comprehensive staging --load-test
```

## Rollback Procedures

### Creating Backups

```bash
# Create manual backup
node scripts/edge-functions-rollback.js backup production "Pre-deployment backup"

# Create tagged rollback point
node scripts/edge-functions-rollback.js rollback-point production v1.1.0 "Stable release"
```

### Listing Available Backups

```bash
# List all backups
node scripts/edge-functions-rollback.js list production

# View deployment history
node scripts/edge-functions-rollback.js history production 10
```

### Performing Rollback

```bash
# Dry run rollback (preview)
node scripts/edge-functions-rollback.js restore production backup-2024-01-15 --dry-run

# Full rollback
node scripts/edge-functions-rollback.js restore production backup-2024-01-15

# Rollback specific functions only
node scripts/edge-functions-rollback.js restore production v1.1.0 --functions coaching-insights,process-workout
```

### Emergency Rollback Procedure

1. **Identify the Issue**
   - Check error logs and monitoring
   - Determine affected functions

2. **Quick Rollback**
   ```bash
   # Find last known good backup
   node scripts/edge-functions-rollback.js list production

   # Rollback immediately
   node scripts/edge-functions-rollback.js restore production last-known-good-backup
   ```

3. **Verify Rollback**
   ```bash
   node scripts/edge-functions-verification.js comprehensive production
   ```

4. **Post-Rollback Actions**
   - Update incident tracking
   - Analyze root cause
   - Plan fix and re-deployment

## Monitoring and Maintenance

### Health Checks

Set up regular health checks:

```bash
# Automated health check (add to cron)
0 */6 * * * /path/to/project/scripts/deploy-edge-functions.js health-check production

# Manual health check
node scripts/deploy-edge-functions.js health-check production
```

### Performance Monitoring

Monitor key metrics:

- **Response Time**: < 2 seconds for most functions
- **Success Rate**: > 99% for production functions
- **Error Rate**: < 1% for production traffic
- **Concurrent Connections**: Monitor for scaling needs

### Log Analysis

Check function logs regularly:

```bash
# View function logs
supabase functions logs coaching-insights --project-ref $SUPABASE_PROJECT_REF

# Follow logs in real-time
supabase functions logs coaching-insights --project-ref $SUPABASE_PROJECT_REF --follow
```

### Maintenance Tasks

#### Weekly Tasks
- [ ] Review deployment reports
- [ ] Check function performance metrics
- [ ] Verify backup integrity
- [ ] Update dependencies if needed

#### Monthly Tasks
- [ ] Clean up old backups (keep last 30 days)
- [ ] Review and optimize function performance
- [ ] Update deployment documentation
- [ ] Test rollback procedures

#### Quarterly Tasks
- [ ] Review and update deployment pipeline
- [ ] Conduct disaster recovery testing
- [ ] Update security configurations
- [ ] Performance optimization review

## Troubleshooting

### Common Issues

#### 1. Deployment Failures

**Symptoms**: Function deployment fails with timeout or error

**Solutions**:
```bash
# Check Supabase CLI authentication
supabase projects list

# Verify project reference
echo $SUPABASE_PROJECT_REF

# Try deploying single function
node scripts/deploy-edge-functions.js deploy staging coaching-insights

# Check function syntax
npx tsc --noEmit --skipLibCheck supabase/functions/**/*.ts
```

#### 2. Function Not Responding

**Symptoms**: Function returns 500 errors or timeouts

**Solutions**:
```bash
# Check function logs
supabase functions logs function-name --project-ref $PROJECT_REF

# Test function locally
supabase functions serve function-name

# Verify environment variables
node -e "console.log(process.env.SUPABASE_URL)"
```

#### 3. Authentication Issues

**Symptoms**: Functions return 401 unauthorized errors

**Solutions**:
```bash
# Verify JWT token
node -e "console.log(JSON.parse(Buffer.from('jwt-payload', 'base64').toString()))"

# Check auth configuration
# Review supabase/config.toml auth settings

# Test with fresh token
# Generate new token from Supabase dashboard
```

#### 4. Performance Issues

**Symptoms**: Slow response times or timeouts

**Solutions**:
```bash
# Run load test to identify bottlenecks
node scripts/edge-functions-verification.js load staging function-name 5 20

# Check database connection pooling
# Review supabase/config.toml pooler settings

# Optimize function code
# Review database queries and caching
```

### Debugging Tools

#### Function Logs
```bash
# Real-time logs
supabase functions logs --follow --project-ref $PROJECT_REF

# Filtered logs
supabase functions logs coaching-insights --project-ref $PROJECT_REF | grep ERROR
```

#### Local Development
```bash
# Start local Supabase
supabase start

# Serve functions locally
supabase functions serve

# Test locally
curl -X POST http://localhost:54321/functions/v1/coaching-insights \
  -H "Authorization: Bearer $LOCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Network Debugging
```bash
# Test connectivity
curl -I https://your-project.supabase.co/functions/v1/coaching-insights

# Check CORS
curl -X OPTIONS https://your-project.supabase.co/functions/v1/coaching-insights \
  -H "Origin: https://localhost:3000" \
  -H "Access-Control-Request-Method: POST"
```

### Getting Help

1. **Check Documentation**: [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
2. **Community Support**: [Supabase Discord](https://discord.supabase.com)
3. **GitHub Issues**: [Supabase GitHub](https://github.com/supabase/supabase)
4. **Internal Team**: Contact the development team for project-specific issues

### Emergency Contacts

- **Development Team Lead**: [Contact Information]
- **DevOps Team**: [Contact Information]
- **Supabase Support**: [Support Channel]

---

## Appendix

### Environment Variable Reference

| Variable | Environment | Description |
|----------|-------------|-------------|
| `SUPABASE_STAGING_PROJECT_REF` | Staging | Staging project reference |
| `SUPABASE_PROJECT_REF` | Production | Production project reference |
| `SUPABASE_STAGING_URL` | Staging | Staging project URL |
| `REACT_APP_SUPABASE_URL` | Production | Production project URL |
| `TEST_AUTH_TOKEN` | Testing | JWT token for testing |

### Function Reference

| Function | Purpose | Endpoint |
|----------|---------|----------|
| `coaching-insights` | Generate personalized insights | `/functions/v1/coaching-insights` |
| `data-validation` | Validate and sanitize data | `/functions/v1/data-validation` |
| `process-workout` | Process workout completion | `/functions/v1/process-workout` |
| `workout-triggers` | Handle database triggers | `/functions/v1/workout-triggers` |

### Deployment Reports

Deployment reports are saved in:
- `deployment-reports/`: Deployment results and metrics
- `test-reports/`: Verification and testing results
- `edge-functions-backups/`: Function backups and rollback data

Reports include:
- Deployment timestamps and duration
- Success/failure status for each function
- Performance metrics and response times
- Error logs and troubleshooting information