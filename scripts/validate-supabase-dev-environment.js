#!/usr/bin/env node

/**
 * Supabase Development Environment Validation Script
 * 
 * This script validates that the Supabase local development environment
 * is properly configured and working correctly.
 */

const { getSupabaseClient, validateSupabaseConnection, checkSupabaseHealth } = require('./seed/utils/supabase-helpers');
const { getSupabaseResetStatistics } = require('./seed/utils/supabase-reset-helpers');
const { execSync } = require('child_process');

class SupabaseDevValidator {
  constructor() {
    this.results = {
      cli: false,
      docker: false,
      services: false,
      database: false,
      auth: false,
      seeding: false,
      overall: false
    };
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      reset: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[type]}[${type.toUpperCase()}]${colors.reset} ${message}`);
  }

  async validateSupabaseCLI() {
    this.log('Validating Supabase CLI...', 'info');
    
    try {
      const version = execSync('npx supabase --version', { encoding: 'utf8' }).trim();
      this.log(`✅ Supabase CLI is installed (version: ${version})`, 'success');
      this.results.cli = true;
      return true;
    } catch (error) {
      this.log('❌ Supabase CLI is not available', 'error');
      this.log('Install with: npm install supabase', 'info');
      return false;
    }
  }

  async validateDocker() {
    this.log('Validating Docker...', 'info');
    
    try {
      execSync('docker ps', { stdio: 'pipe' });
      this.log('✅ Docker is running', 'success');
      this.results.docker = true;
      return true;
    } catch (error) {
      this.log('❌ Docker is not running', 'error');
      this.log('Please start Docker Desktop', 'info');
      return false;
    }
  }

  async validateSupabaseServices() {
    this.log('Validating Supabase services...', 'info');
    
    try {
      const status = execSync('npx supabase status', { encoding: 'utf8' });
      
      if (status.includes('RUNNING') || status.includes('UP')) {
        this.log('✅ Supabase services are running', 'success');
        this.results.services = true;
        return true;
      } else {
        this.log('❌ Supabase services are not running', 'error');
        this.log('Start with: npm run supabase:start', 'info');
        return false;
      }
    } catch (error) {
      this.log('❌ Could not check Supabase services status', 'error');
      this.log('Start with: npm run supabase:start', 'info');
      return false;
    }
  }

  async validateDatabaseConnection() {
    this.log('Validating database connection...', 'info');
    
    try {
      await validateSupabaseConnection();
      this.log('✅ Database connection is working', 'success');
      this.results.database = true;
      return true;
    } catch (error) {
      this.log(`❌ Database connection failed: ${error.message}`, 'error');
      return false;
    }
  }

  async validateAuthService() {
    this.log('Validating auth service...', 'info');
    
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.getSession();
      
      if (!error) {
        this.log('✅ Auth service is working', 'success');
        this.results.auth = true;
        return true;
      } else {
        this.log(`❌ Auth service error: ${error.message}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Auth service validation failed: ${error.message}`, 'error');
      return false;
    }
  }

  async validateSeedingSystem() {
    this.log('Validating seeding system...', 'info');
    
    try {
      const stats = await getSupabaseResetStatistics();
      
      this.log(`Database contains:`, 'info');
      this.log(`  - Users: ${stats.users}`, 'info');
      this.log(`  - Programs: ${stats.programs}`, 'info');
      this.log(`  - Workout Logs: ${stats.workoutLogs}`, 'info');
      this.log(`  - Exercises: ${stats.exercises}`, 'info');
      
      this.log('✅ Seeding system is accessible', 'success');
      this.results.seeding = true;
      return true;
    } catch (error) {
      this.log(`❌ Seeding system validation failed: ${error.message}`, 'error');
      return false;
    }
  }

  async validateHealthChecks() {
    this.log('Running comprehensive health checks...', 'info');
    
    try {
      const health = await checkSupabaseHealth();
      
      if (health.overall) {
        this.log('✅ All health checks passed', 'success');
        return true;
      } else {
        this.log('❌ Some health checks failed:', 'error');
        this.log(`  - Database: ${health.database ? '✅' : '❌'}`, health.database ? 'success' : 'error');
        this.log(`  - Auth: ${health.auth ? '✅' : '❌'}`, health.auth ? 'success' : 'error');
        
        if (health.error) {
          this.log(`  Error: ${health.error}`, 'error');
        }
        
        return false;
      }
    } catch (error) {
      this.log(`❌ Health check failed: ${error.message}`, 'error');
      return false;
    }
  }

  async runValidation() {
    this.log('🔍 Validating Supabase Development Environment', 'info');
    this.log('=' .repeat(50), 'info');
    
    // Run all validations
    await this.validateSupabaseCLI();
    await this.validateDocker();
    await this.validateSupabaseServices();
    await this.validateDatabaseConnection();
    await this.validateAuthService();
    await this.validateSeedingSystem();
    await this.validateHealthChecks();
    
    // Calculate overall result
    this.results.overall = Object.values(this.results).every(result => result === true);
    
    // Show summary
    this.log('=' .repeat(50), 'info');
    this.log('Validation Summary:', 'info');
    this.log(`  CLI: ${this.results.cli ? '✅' : '❌'}`, this.results.cli ? 'success' : 'error');
    this.log(`  Docker: ${this.results.docker ? '✅' : '❌'}`, this.results.docker ? 'success' : 'error');
    this.log(`  Services: ${this.results.services ? '✅' : '❌'}`, this.results.services ? 'success' : 'error');
    this.log(`  Database: ${this.results.database ? '✅' : '❌'}`, this.results.database ? 'success' : 'error');
    this.log(`  Auth: ${this.results.auth ? '✅' : '❌'}`, this.results.auth ? 'success' : 'error');
    this.log(`  Seeding: ${this.results.seeding ? '✅' : '❌'}`, this.results.seeding ? 'success' : 'error');
    
    if (this.results.overall) {
      this.log('🎉 Supabase development environment is ready!', 'success');
      this.log('You can now:', 'info');
      this.log('  - Start development: npm run dev', 'info');
      this.log('  - Seed test data: npm run supabase:seed', 'info');
      this.log('  - Open Studio: npm run supabase:studio', 'info');
    } else {
      this.log('❌ Supabase development environment has issues', 'error');
      this.log('Please fix the issues above and try again', 'info');
    }
    
    return this.results.overall;
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new SupabaseDevValidator();
  validator.runValidation()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}

module.exports = { SupabaseDevValidator };