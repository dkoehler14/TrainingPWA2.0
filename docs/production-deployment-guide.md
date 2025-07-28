# Production Deployment Guide

This guide provides comprehensive instructions for deploying the Exercise Tracker application to production with Supabase.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Supabase Project Configuration](#supabase-project-configuration)
4. [Database Setup](#database-setup)
5. [Security Configuration](#security-configuration)
6. [Backup and Disaster Recovery](#backup-and-disaster-recovery)
7. [Monitoring and Alerting](#monitoring-and-alerting)
8. [Deployment Process](#deployment-process)
9. [Post-Deployment Verification](#post-deployment-verification)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

Before starting the production deployment, ensure you have:

- [ ] Supabase account with billing enabled
- [ ] Domain name configured with SSL certificate
- [ ] Access to your deployment platform (Vercel, Netlify, etc.)
- [ ] Email service provider account (SendGrid, etc.)
- [ ] Monitoring service accounts (Sentry, etc.)

## Environment Setup

### 1. Create Production Environment Variables

Copy the `.env.production` template and configure with your production values:

```bash
cp .env.production .env.production.local
```

Configure the following required variables:

```env
# Core Supabase Configuration
REACT_APP_SUPABASE_URL=https://your-project-ref.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_production_anon_key
REACT_APP_SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key

# Application Settings
NODE_ENV=production
REACT_APP_USE_SUPABASE=true
REACT_APP_VERSION=1.0.0

# External Services
SENDGRID_API_KEY=your_sendgrid_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### 2. Validate Environment Configuration

Run the production setup script to validate your configuration:

```bash
node scripts/production-setup.js
```

This script will:
- Validate all required environment variables
- Check configuration file syntax
- Test Supabase connectivity
- Verify security settings
- Generate deployment checklist

## Supabase Project Configuration

### 1. Create Production Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click "New Project"
3. Choose your organization
4. Set project name: `exercise-tracker-prod`
5. Set database password (store securely)
6. Choose region closest to your users
7. Click "Create new project"

### 2. Configure Project Settings

#### Authentication Settings
```bash
# Navigate to Authentication > Settings
- Site URL: https://your-production-domain.com
- Redirect URLs: Add your production domain
- JWT expiry: 3600 seconds (1 hour)
- Enable email confirmations: Yes
- Minimum password length: 8 characters
```

#### API Settings
```bash
# Navigate to Settings > API
- Copy your project URL and anon key
- Configure rate limiting
- Set up CORS for your domain
```

### 3. Configure OAuth Providers

#### Google OAuth (if enabled)
1. Go to Authentication > Providers
2. Enable Google provider
3. Add your Google Client ID and Secret
4. Configure authorized domains

## Database Setup

### 1. Run Database Migrations

Apply all database migrations to your production database:

```bash
# Using Supabase CLI
supabase db push --project-ref your-project-ref

# Or apply migrations manually through the dashboard
```

### 2. Set Up Row Level Security (RLS)

Ensure RLS is enabled on all tables:

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
-- ... repeat for all tables
```

### 3. Create Database Indexes

Apply performance indexes:

```sql
-- User lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Workout log lookups
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON workout_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_finished ON workout_logs(user_id, is_finished);

-- Add other indexes as defined in the migration files
```

### 4. Configure Database Backups

Enable automatic backups in Supabase Dashboard:
1. Go to Settings > Database
2. Enable automatic backups
3. Set backup frequency to daily
4. Configure retention period (30 days recommended)

## Security Configuration

### 1. Configure Authentication Security

```toml
# In supabase/config.production.toml
[auth]
enable_confirmations = true
minimum_password_length = 8
password_requirements = "lower_upper_letters_digits"
enable_refresh_token_rotation = true

[auth.rate_limit]
email_sent = 10
token_refresh = 300
sign_in_sign_ups = 60
```

### 2. Set Up CAPTCHA Protection

1. Create hCaptcha account
2. Get site key and secret key
3. Configure in Supabase:

```toml
[auth.captcha]
enabled = true
provider = "hcaptcha"
secret = "env(HCAPTCHA_SECRET_KEY)"
```

### 3. Configure Network Security

```toml
[db.network_restrictions]
enabled = true
# Configure with your actual allowed IP ranges
allowed_cidrs = ["your.allowed.ip.range/24"]
```

### 4. Set Up SSL/TLS

Ensure all connections use HTTPS:
- Configure SSL certificate for your domain
- Set up HTTPS redirects
- Configure HSTS headers

## Backup and Disaster Recovery

### 1. Automated Database Backups

The production setup script creates a backup script at `scripts/backup-production.sh`. Set up a cron job to run it regularly:

```bash
# Add to crontab (run daily at 2 AM)
0 2 * * * /path/to/your/app/scripts/backup-production.sh
```

### 2. Point-in-Time Recovery

Enable point-in-time recovery in Supabase:
1. Go to Settings > Database
2. Enable point-in-time recovery
3. Configure retention period

### 3. Backup Verification

Regularly test backup restoration:
```bash
# Test backup restoration (use a test environment)
supabase db reset --project-ref your-test-project
psql -h your-test-db -U postgres -d postgres < backup_file.sql
```

### 4. Disaster Recovery Plan

Document your disaster recovery procedures:
- Recovery time objectives (RTO)
- Recovery point objectives (RPO)
- Emergency contact information
- Step-by-step recovery procedures

## Monitoring and Alerting

### 1. Application Performance Monitoring

Configure error tracking and performance monitoring:

```javascript
// In your application
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: "production",
  tracesSampleRate: 0.1,
});
```

### 2. Database Monitoring

Set up monitoring for:
- Database connection count
- Query performance
- Storage usage
- Backup status

### 3. Health Check Endpoints

Implement health check endpoints:

```javascript
// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await checkProductionHealth();
    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});
```

### 4. Alerting Configuration

Set up alerts for:
- Application errors (>1% error rate)
- Slow database queries (>2 seconds)
- High memory usage (>80%)
- Failed authentication attempts (>10/minute)
- Backup failures

## Deployment Process

### 1. Pre-Deployment Checklist

Run through the deployment checklist:
```bash
# Generate and review checklist
node scripts/production-setup.js
cat docs/production-deployment-checklist.md
```

### 2. Deploy Edge Functions

Deploy Supabase Edge Functions:
```bash
# Deploy all functions
supabase functions deploy --project-ref your-project-ref

# Or deploy individual functions
supabase functions deploy coaching-insights --project-ref your-project-ref
supabase functions deploy data-validation --project-ref your-project-ref
```

### 3. Deploy Application

Deploy your React application to your chosen platform:

#### Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

#### Netlify Deployment
```bash
# Build for production
npm run build

# Deploy to Netlify (or use their dashboard)
netlify deploy --prod --dir=build
```

### 4. Configure Domain and SSL

1. Point your domain to your deployment platform
2. Configure SSL certificate
3. Set up HTTPS redirects
4. Update Supabase site URL and redirect URLs

## Post-Deployment Verification

### 1. Functional Testing

Test all critical user flows:
- [ ] User registration and email confirmation
- [ ] User login and logout
- [ ] Password reset
- [ ] Create and manage programs
- [ ] Log workouts
- [ ] View workout history
- [ ] Real-time updates

### 2. Performance Testing

Monitor application performance:
- [ ] Page load times
- [ ] Database query performance
- [ ] API response times
- [ ] Real-time connection stability

### 3. Security Testing

Verify security configurations:
- [ ] HTTPS enforcement
- [ ] Authentication flows
- [ ] Authorization checks
- [ ] Rate limiting
- [ ] CAPTCHA functionality

### 4. Monitoring Verification

Ensure monitoring is working:
- [ ] Error tracking is capturing issues
- [ ] Performance metrics are being collected
- [ ] Health checks are responding
- [ ] Alerts are configured and working

## Troubleshooting

### Common Issues

#### 1. Environment Variable Issues
```bash
# Check environment variables are loaded
node -e "console.log(process.env.REACT_APP_SUPABASE_URL)"

# Validate configuration
node scripts/production-setup.js
```

#### 2. Database Connection Issues
```bash
# Test database connectivity
supabase db ping --project-ref your-project-ref

# Check connection pooling settings
# Review supabase/config.production.toml
```

#### 3. Authentication Issues
```bash
# Check auth configuration
# Review Supabase Dashboard > Authentication > Settings
# Verify redirect URLs and site URL
```

#### 4. Performance Issues
```bash
# Check database performance
# Review Supabase Dashboard > Database > Query Performance
# Analyze slow queries and add indexes if needed
```

### Emergency Procedures

#### 1. Rollback Deployment
```bash
# Rollback application deployment
vercel rollback  # or your platform's rollback command

# Rollback database if needed (use with extreme caution)
# Restore from backup if necessary
```

#### 2. Scale Resources
```bash
# Upgrade Supabase plan if needed
# Increase connection pool size
# Add read replicas if available
```

#### 3. Emergency Contacts

Document emergency contacts:
- Development team lead
- DevOps/Infrastructure team
- Supabase support
- Domain/DNS provider support

### Monitoring and Maintenance

#### Daily Tasks
- [ ] Review error logs
- [ ] Check performance metrics
- [ ] Verify backup completion

#### Weekly Tasks
- [ ] Review security alerts
- [ ] Analyze performance trends
- [ ] Update dependencies if needed

#### Monthly Tasks
- [ ] Review and test disaster recovery procedures
- [ ] Analyze usage patterns and optimize
- [ ] Update documentation

## Support and Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Community](https://github.com/supabase/supabase/discussions)
- [Production Best Practices](https://supabase.com/docs/guides/platform/going-to-prod)

---

**Note**: This guide should be customized based on your specific deployment requirements and infrastructure setup. Always test procedures in a staging environment before applying to production.