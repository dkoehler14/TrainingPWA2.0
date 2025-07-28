#!/usr/bin/env node

/**
 * Production Environment Validation Script
 * 
 * This script validates that the production environment is properly configured
 * and ready for deployment. It checks all aspects of the Supabase setup.
 */

const fs = require('fs');
const path = require('path');

class ProductionValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.passed = [];
  }

  log(message, type = 'info') {
    const colors = {
      error: '\x1b[31m',
      warning: '\x1b[33m',
      success: '\x1b[32m',
      info: '\x1b[36m',
      reset: '\x1b[0m'
    };
    
    const color = colors[type] || colors.info;
    console.log(`${color}${message}${colors.reset}`);
    
    if (type === 'error') this.errors.push(message);
    if (type === 'warning') this.warnings.push(message);
    if (type === 'success') this.passed.push(message);
  }

  async validateEnvironmentVariables() {
    this.log('\n🔍 Validating Environment Variables...', 'info');
    
    const requiredVars = [
      'REACT_APP_SUPABASE_URL',
      'REACT_APP_SUPABASE_ANON_KEY',
      'NODE_ENV'
    ];
    
    const recommendedVars = [
      'REACT_APP_SUPABASE_SERVICE_ROLE_KEY',
      'SENDGRID_API_KEY',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET'
    ];
    
    // Check required variables
    for (const envVar of requiredVars) {
      if (process.env[envVar]) {
        this.log(`✅ ${envVar} is set`, 'success');
      } else {
        this.log(`❌ Missing required environment variable: ${envVar}`, 'error');
      }
    }
    
    // Check recommended variables
    for (const envVar of recommendedVars) {
      if (process.env[envVar]) {
        this.log(`✅ ${envVar} is set`, 'success');
      } else {
        this.log(`⚠️  Recommended environment variable not set: ${envVar}`, 'warning');
      }
    }
    
    // Validate URL format
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
    if (supabaseUrl) {
      if (supabaseUrl.startsWith('https://') && supabaseUrl.includes('.supabase.co')) {
        this.log('✅ Supabase URL format is valid', 'success');
      } else {
        this.log('❌ Invalid Supabase URL format', 'error');
      }
    }
    
    // Check NODE_ENV
    if (process.env.NODE_ENV === 'production') {
      this.log('✅ NODE_ENV is set to production', 'success');
    } else {
      this.log(`⚠️  NODE_ENV is ${process.env.NODE_ENV}, expected 'production'`, 'warning');
    }
  }

  async validateConfigurationFiles() {
    this.log('\n📋 Validating Configuration Files...', 'info');
    
    const requiredFiles = [
      'src/config/production.js',
      'supabase/config.production.toml',
      '.env.production'
    ];
    
    const optionalFiles = [
      'scripts/backup-production.sh',
      'scripts/production-setup.js',
      'docs/production-deployment-guide.md'
    ];
    
    // Check required files
    for (const file of requiredFiles) {
      if (fs.existsSync(file)) {
        this.log(`✅ Found required file: ${file}`, 'success');
      } else {
        this.log(`❌ Missing required file: ${file}`, 'error');
      }
    }
    
    // Check optional files
    for (const file of optionalFiles) {
      if (fs.existsSync(file)) {
        this.log(`✅ Found optional file: ${file}`, 'success');
      } else {
        this.log(`⚠️  Optional file not found: ${file}`, 'warning');
      }
    }
  }

  async validateSupabaseConnection() {
    this.log('\n🔗 Validating Supabase Connection...', 'info');
    
    try {
      // Import and test production configuration
      const { checkProductionHealth, validateProductionEnvironment } = require('../src/config/production.js');
      
      // Validate environment first
      try {
        validateProductionEnvironment();
        this.log('✅ Production environment validation passed', 'success');
      } catch (error) {
        this.log(`❌ Production environment validation failed: ${error.message}`, 'error');
        return;
      }
      
      // Test connection
      const health = await checkProductionHealth();
      
      if (health.status === 'healthy') {
        this.log('✅ Supabase connection is healthy', 'success');
        
        if (health.services) {
          if (health.services.database.status === 'healthy') {
            this.log(`✅ Database connection OK (${health.services.database.responseTime}ms)`, 'success');
          } else {
            this.log(`❌ Database connection failed: ${health.services.database.error}`, 'error');
          }
          
          if (health.services.auth.status === 'healthy') {
            this.log(`✅ Auth service OK (${health.services.auth.responseTime}ms)`, 'success');
          } else {
            this.log(`❌ Auth service failed: ${health.services.auth.error}`, 'error');
          }
        }
        
        // Check performance
        if (health.performance && health.performance.totalResponseTime > 5000) {
          this.log(`⚠️  Slow response time: ${health.performance.totalResponseTime}ms`, 'warning');
        }
        
      } else {
        this.log(`❌ Supabase connection is unhealthy: ${health.error}`, 'error');
      }
      
    } catch (error) {
      this.log(`❌ Connection test failed: ${error.message}`, 'error');
    }
  }

  async validateDatabaseSchema() {
    this.log('\n🗄️  Validating Database Schema...', 'info');
    
    // Check for migration files
    const migrationsDir = 'supabase/migrations';
    if (fs.existsSync(migrationsDir)) {
      const migrations = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
      
      if (migrations.length > 0) {
        this.log(`✅ Found ${migrations.length} migration files`, 'success');
        migrations.forEach(migration => {
          this.log(`   - ${migration}`, 'info');
        });
      } else {
        this.log('⚠️  No migration files found', 'warning');
      }
    } else {
      this.log('❌ Migrations directory not found', 'error');
    }
    
    // Check seed files (should be minimal in production)
    const seedFile = 'supabase/seed.sql';
    if (fs.existsSync(seedFile)) {
      const seedContent = fs.readFileSync(seedFile, 'utf8');
      if (seedContent.trim().length > 0) {
        this.log('⚠️  Seed file contains data - ensure this is intended for production', 'warning');
      } else {
        this.log('✅ Seed file is empty (good for production)', 'success');
      }
    }
  }

  async validateSecurityConfiguration() {
    this.log('\n🔒 Validating Security Configuration...', 'info');
    
    // Check HTTPS usage
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
    if (supabaseUrl && supabaseUrl.startsWith('https://')) {
      this.log('✅ Using HTTPS for Supabase connection', 'success');
    } else {
      this.log('❌ Supabase URL must use HTTPS in production', 'error');
    }
    
    // Check production config file
    const prodConfigPath = 'supabase/config.production.toml';
    if (fs.existsSync(prodConfigPath)) {
      const configContent = fs.readFileSync(prodConfigPath, 'utf8');
      
      // Security checks
      const securityChecks = [
        {
          pattern: /enable_confirmations = true/,
          message: 'Email confirmations enabled',
          required: true
        },
        {
          pattern: /minimum_password_length = [8-9]\d*/,
          message: 'Strong password requirements (8+ characters)',
          required: true
        },
        {
          pattern: /enabled = true.*captcha/,
          message: 'CAPTCHA protection enabled',
          required: false
        },
        {
          pattern: /enable_refresh_token_rotation = true/,
          message: 'Token rotation enabled',
          required: true
        },
        {
          pattern: /enabled = true.*network_restrictions/,
          message: 'Network restrictions enabled',
          required: false
        }
      ];
      
      for (const check of securityChecks) {
        if (check.pattern.test(configContent)) {
          this.log(`✅ Security: ${check.message}`, 'success');
        } else {
          const level = check.required ? 'error' : 'warning';
          const icon = check.required ? '❌' : '⚠️ ';
          this.log(`${icon} Security: ${check.message} - not configured`, level);
        }
      }
    }
    
    // Check for sensitive data in environment files
    const envFiles = ['.env', '.env.production', '.env.local'];
    for (const envFile of envFiles) {
      if (fs.existsSync(envFile)) {
        const content = fs.readFileSync(envFile, 'utf8');
        
        // Check for placeholder values
        const placeholders = [
          'your_project_ref',
          'your_production_anon_key',
          'your_sendgrid_api_key',
          'your_google_client_id'
        ];
        
        for (const placeholder of placeholders) {
          if (content.includes(placeholder)) {
            this.log(`⚠️  Found placeholder value in ${envFile}: ${placeholder}`, 'warning');
          }
        }
      }
    }
  }

  async validatePerformanceConfiguration() {
    this.log('\n⚡ Validating Performance Configuration...', 'info');
    
    const prodConfigPath = 'supabase/config.production.toml';
    if (fs.existsSync(prodConfigPath)) {
      const configContent = fs.readFileSync(prodConfigPath, 'utf8');
      
      const performanceChecks = [
        {
          pattern: /enabled = true.*pooler/,
          message: 'Connection pooling enabled'
        },
        {
          pattern: /default_pool_size = \d+/,
          message: 'Connection pool size configured'
        },
        {
          pattern: /max_rows = \d+/,
          message: 'Query result limits configured'
        },
        {
          pattern: /policy = "per_worker"/,
          message: 'Edge Functions optimized for production'
        }
      ];
      
      for (const check of performanceChecks) {
        if (check.pattern.test(configContent)) {
          this.log(`✅ Performance: ${check.message}`, 'success');
        } else {
          this.log(`⚠️  Performance: ${check.message} - not configured`, 'warning');
        }
      }
    }
  }

  async validateBackupConfiguration() {
    this.log('\n💾 Validating Backup Configuration...', 'info');
    
    // Check backup script
    const backupScript = 'scripts/backup-production.sh';
    if (fs.existsSync(backupScript)) {
      const stats = fs.statSync(backupScript);
      if (stats.mode & parseInt('111', 8)) {
        this.log('✅ Backup script exists and is executable', 'success');
      } else {
        this.log('⚠️  Backup script exists but is not executable', 'warning');
      }
    } else {
      this.log('❌ Backup script not found', 'error');
    }
    
    // Check for backup directory configuration
    const backupDir = process.env.BACKUP_DIR || '/backups/supabase';
    this.log(`ℹ️  Backup directory configured: ${backupDir}`, 'info');
    
    // Check environment variables for backup
    const backupEnvVars = ['SUPABASE_PROJECT_REF'];
    for (const envVar of backupEnvVars) {
      if (process.env[envVar]) {
        this.log(`✅ Backup environment variable set: ${envVar}`, 'success');
      } else {
        this.log(`⚠️  Backup environment variable not set: ${envVar}`, 'warning');
      }
    }
  }

  async validateDeploymentReadiness() {
    this.log('\n🚀 Validating Deployment Readiness...', 'info');
    
    // Check build configuration
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    if (packageJson.scripts['prod:build']) {
      this.log('✅ Production build script configured', 'success');
    } else {
      this.log('⚠️  Production build script not found', 'warning');
    }
    
    if (packageJson.scripts['prod:setup']) {
      this.log('✅ Production setup script configured', 'success');
    } else {
      this.log('⚠️  Production setup script not found', 'warning');
    }
    
    // Check for deployment guide
    const deploymentGuide = 'docs/production-deployment-guide.md';
    if (fs.existsSync(deploymentGuide)) {
      this.log('✅ Deployment guide exists', 'success');
    } else {
      this.log('⚠️  Deployment guide not found', 'warning');
    }
    
    // Check for monitoring setup
    const monitoringScript = 'scripts/monitor-production.js';
    if (fs.existsSync(monitoringScript)) {
      this.log('✅ Production monitoring script exists', 'success');
    } else {
      this.log('⚠️  Production monitoring script not found', 'warning');
    }
  }

  async generateReport() {
    this.log('\n📊 Validation Summary', 'info');
    this.log('='.repeat(50), 'info');
    
    this.log(`✅ Passed: ${this.passed.length}`, 'success');
    this.log(`⚠️  Warnings: ${this.warnings.length}`, 'warning');
    this.log(`❌ Errors: ${this.errors.length}`, 'error');
    
    if (this.errors.length > 0) {
      this.log('\n❌ Critical Issues (must be fixed):', 'error');
      this.errors.forEach(error => this.log(`   - ${error}`, 'error'));
    }
    
    if (this.warnings.length > 0) {
      this.log('\n⚠️  Warnings (should be addressed):', 'warning');
      this.warnings.forEach(warning => this.log(`   - ${warning}`, 'warning'));
    }
    
    // Overall status
    if (this.errors.length === 0) {
      this.log('\n🎉 Production environment validation PASSED!', 'success');
      this.log('Your environment is ready for production deployment.', 'success');
      
      if (this.warnings.length > 0) {
        this.log('Consider addressing the warnings above for optimal production setup.', 'info');
      }
      
      return true;
    } else {
      this.log('\n💥 Production environment validation FAILED!', 'error');
      this.log('Please fix the errors above before deploying to production.', 'error');
      return false;
    }
  }

  async run() {
    this.log('🔍 Starting Production Environment Validation...', 'info');
    this.log('='.repeat(50), 'info');
    
    try {
      await this.validateEnvironmentVariables();
      await this.validateConfigurationFiles();
      await this.validateSupabaseConnection();
      await this.validateDatabaseSchema();
      await this.validateSecurityConfiguration();
      await this.validatePerformanceConfiguration();
      await this.validateBackupConfiguration();
      await this.validateDeploymentReadiness();
      
      const success = await this.generateReport();
      process.exit(success ? 0 : 1);
      
    } catch (error) {
      this.log(`\n💥 Validation failed with error: ${error.message}`, 'error');
      console.error(error);
      process.exit(1);
    }
  }
}

// Run validation if script is executed directly
if (require.main === module) {
  const validator = new ProductionValidator();
  validator.run();
}

module.exports = ProductionValidator;