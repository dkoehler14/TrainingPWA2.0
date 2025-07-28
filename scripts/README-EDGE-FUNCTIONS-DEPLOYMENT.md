# Edge Functions Deployment Pipeline

This directory contains the complete deployment pipeline for Supabase Edge Functions, providing automated deployment, verification, and rollback capabilities.

## Quick Start

### Deploy to Staging
```bash
npm run edge-functions:deploy:staging
```

### Deploy to Production
```bash
npm run edge-functions:deploy:production
```

### Verify Deployment
```bash
npm run edge-functions:verify:staging
npm run edge-functions:verify:production
```

### Create Backup
```bash
npm run edge-functions:backup:production
```

## Scripts Overview

### 1. `deploy-edge-functions.js`
Main deployment script with comprehensive features:
- **Environment validation** and connectivity testing
- **Parallel or sequential** deployment options
- **Automatic verification** after deployment
- **Deployment reporting** and history tracking
- **Health checks** and monitoring

**Key Features:**
- Dry-run mode for testing
- Continue-on-error for partial deployments
- Deployment plan generation
- Real-time progress tracking

### 2. `edge-functions-verification.js`
Comprehensive testing and verification:
- **Connectivity testing** (CORS, response time, error handling)
- **Authentication testing** with JWT tokens
- **Load testing** with configurable concurrency
- **Integration testing** for complete workflows

**Test Types:**
- Basic connectivity and CORS preflight
- Authentication and authorization
- Performance and load testing
- End-to-end integration testing

### 3. `edge-functions-rollback.js`
Complete rollback and backup management:
- **Automated backups** before deployments
- **Version tracking** with git integration
- **Selective rollback** for specific functions
- **Deployment history** and audit trail

**Backup Features:**
- File integrity verification with checksums
- Git commit and branch tracking
- Tagged rollback points
- Deployment history tracking

### 4. `edge-functions-ci.yml`
GitHub Actions workflow template:
- **Automated validation** on pull requests
- **Staging deployment** on develop branch
- **Production deployment** on main branch
- **Rollback workflows** for emergency situations

## Environment Setup

### Required Environment Variables

```bash
# Staging
export SUPABASE_STAGING_PROJECT_REF="your-staging-ref"
export SUPABASE_STAGING_URL="https://staging.supabase.co"
export SUPABASE_STAGING_ANON_KEY="staging-anon-key"

# Production
export SUPABASE_PROJECT_REF="your-production-ref"
export REACT_APP_SUPABASE_URL="https://production.supabase.co"
export REACT_APP_SUPABASE_ANON_KEY="production-anon-key"

# Testing (optional)
export TEST_AUTH_TOKEN="jwt-token-for-testing"
```

### Supabase CLI Setup

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Verify access
supabase projects list
```

## Usage Examples

### Basic Deployment

```bash
# Deploy all functions to staging
node scripts/deploy-edge-functions.js deploy staging

# Deploy specific function
node scripts/deploy-edge-functions.js deploy staging coaching-insights

# Parallel deployment (faster)
node scripts/deploy-edge-functions.js deploy staging --parallel

# Dry run (preview only)
node scripts/deploy-edge-functions.js deploy staging --dry-run
```

### Verification and Testing

```bash
# Basic connectivity test
node scripts/edge-functions-verification.js connectivity staging

# Authentication test (requires TEST_AUTH_TOKEN)
node scripts/edge-functions-verification.js auth staging

# Load test specific function
node scripts/edge-functions-verification.js load staging process-workout 10 50

# Comprehensive test suite
node scripts/edge-functions-verification.js comprehensive staging --load-test
```

### Backup and Rollback

```bash
# Create backup
node scripts/edge-functions-rollback.js backup production "Pre-deployment backup"

# List available backups
node scripts/edge-functions-rollback.js list production

# Rollback to previous version
node scripts/edge-functions-rollback.js restore production backup-2024-01-15

# Dry run rollback (preview)
node scripts/edge-functions-rollback.js restore production v1.1.0 --dry-run
```

## NPM Scripts

### Deployment Scripts
- `edge-functions:deploy:staging` - Deploy to staging
- `edge-functions:deploy:production` - Deploy to production
- `edge-functions:deploy:dry-run` - Preview deployment

### Verification Scripts
- `edge-functions:verify:staging` - Verify staging deployment
- `edge-functions:verify:production` - Verify production deployment
- `edge-functions:health-check` - Run health checks

### Backup and Rollback Scripts
- `edge-functions:backup:staging` - Backup staging functions
- `edge-functions:backup:production` - Backup production functions
- `edge-functions:rollback:list` - List available backups
- `edge-functions:rollback:history` - Show deployment history

## CI/CD Integration

### GitHub Actions Setup

1. Copy `edge-functions-ci.yml` to `.github/workflows/`
2. Configure repository secrets:
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_STAGING_PROJECT_REF`
   - `SUPABASE_PROJECT_REF`
   - Environment URLs and keys

### Workflow Triggers

- **Pull Requests**: Validation and staging deployment
- **Main Branch**: Production deployment
- **Manual Trigger**: Emergency rollback

## Monitoring and Maintenance

### Health Checks

Set up automated health checks:

```bash
# Add to crontab for regular monitoring
0 */6 * * * /path/to/project/scripts/deploy-edge-functions.js health-check production
```

### Log Monitoring

```bash
# View function logs
supabase functions logs coaching-insights --project-ref $SUPABASE_PROJECT_REF

# Follow logs in real-time
supabase functions logs coaching-insights --project-ref $SUPABASE_PROJECT_REF --follow
```

### Performance Monitoring

Key metrics to monitor:
- Response time < 2 seconds
- Success rate > 99%
- Error rate < 1%
- Concurrent connections

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   ```bash
   supabase login
   supabase projects list
   ```

2. **Function Deployment Errors**
   ```bash
   # Check function syntax
   npx tsc --noEmit --skipLibCheck supabase/functions/**/*.ts
   
   # Deploy single function for debugging
   node scripts/deploy-edge-functions.js deploy staging coaching-insights
   ```

3. **Verification Failures**
   ```bash
   # Check function logs
   supabase functions logs function-name --project-ref $PROJECT_REF
   
   # Test locally
   supabase functions serve function-name
   ```

### Emergency Procedures

1. **Quick Rollback**
   ```bash
   node scripts/edge-functions-rollback.js list production
   node scripts/edge-functions-rollback.js restore production last-good-backup
   ```

2. **Function Disable**
   ```bash
   # Deploy empty function or remove from routing
   # Contact Supabase support for immediate function disable
   ```

## Documentation

- **Comprehensive Guide**: `docs/edge-functions-deployment-guide.md`
- **Production Deployment**: `docs/production-deployment-guide.md`
- **Supabase Functions**: [Official Documentation](https://supabase.com/docs/guides/functions)

## Support

- **Internal Team**: Contact development team for project-specific issues
- **Supabase Community**: [Discord](https://discord.supabase.com)
- **GitHub Issues**: [Supabase Repository](https://github.com/supabase/supabase)

---

**Note**: Always test deployments in staging before production. Keep backups current and test rollback procedures regularly.