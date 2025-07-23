#!/usr/bin/env node

/**
 * Supabase Setup Verification Script
 * Verifies that the Supabase development environment is properly configured
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SupabaseSetupVerifier {
  constructor() {
    this.checks = [];
    this.passed = 0;
    this.failed = 0;
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      reset: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[type]}${message}${colors.reset}`);
  }

  check(description, testFn) {
    try {
      const result = testFn();
      if (result) {
        this.log(`✓ ${description}`, 'success');
        this.passed++;
        return true;
      } else {
        this.log(`✗ ${description}`, 'error');
        this.failed++;
        return false;
      }
    } catch (error) {
      this.log(`✗ ${description} - ${error.message}`, 'error');
      this.failed++;
      return false;
    }
  }

  checkFileExists(filePath, description) {
    return this.check(description, () => {
      return fs.existsSync(filePath);
    });
  }

  checkCommandExists(command, description) {
    return this.check(description, () => {
      try {
        execSync(command, { stdio: 'pipe' });
        return true;
      } catch (error) {
        return false;
      }
    });
  }

  checkEnvironmentVariable(varName, description) {
    return this.check(description, () => {
      const envFile = path.join(process.cwd(), '.env.development');
      if (!fs.existsSync(envFile)) return false;
      
      const content = fs.readFileSync(envFile, 'utf8');
      return content.includes(varName);
    });
  }

  runAllChecks() {
    this.log('🔍 Verifying Supabase Development Environment Setup\n', 'info');

    // Check prerequisites
    this.log('Prerequisites:', 'info');
    this.checkCommandExists('docker --version', 'Docker is installed');
    this.checkCommandExists('npx supabase --version', 'Supabase CLI is available');
    
    console.log();

    // Check project structure
    this.log('Project Structure:', 'info');
    this.checkFileExists('supabase/config.toml', 'Supabase config exists');
    this.checkFileExists('supabase/seed.sql', 'Database seed file exists');
    this.checkFileExists('src/config/supabase.js', 'Supabase client config exists');
    
    console.log();

    // Check migrations
    this.log('Database Migrations:', 'info');
    this.checkFileExists('supabase/migrations', 'Migrations directory exists');
    this.checkFileExists('supabase/migrations/20240101000000_initial_schema.sql', 'Initial schema migration exists');
    this.checkFileExists('supabase/migrations/20240101000001_create_indexes.sql', 'Indexes migration exists');
    this.checkFileExists('supabase/migrations/20240101000002_row_level_security.sql', 'RLS migration exists');
    this.checkFileExists('supabase/migrations/20240101000003_auth_triggers.sql', 'Auth triggers migration exists');
    
    console.log();

    // Check environment variables
    this.log('Environment Configuration:', 'info');
    this.checkEnvironmentVariable('REACT_APP_SUPABASE_URL', 'Supabase URL is configured');
    this.checkEnvironmentVariable('REACT_APP_SUPABASE_ANON_KEY', 'Supabase anon key is configured');
    
    console.log();

    // Check package.json scripts
    this.log('Package Scripts:', 'info');
    this.check('Supabase scripts are configured', () => {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const scripts = packageJson.scripts;
      return scripts['supabase:start'] && 
             scripts['supabase:stop'] && 
             scripts['supabase:status'] &&
             scripts['dev:supabase'];
    });

    // Check dependencies
    this.log('Dependencies:', 'info');
    this.check('Supabase JS client is installed', () => {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      return packageJson.dependencies['@supabase/supabase-js'] || 
             packageJson.devDependencies['@supabase/supabase-js'];
    });

    this.check('Supabase CLI is installed', () => {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      return packageJson.devDependencies['supabase'];
    });

    console.log();

    // Summary
    this.log('📊 Verification Summary:', 'info');
    this.log(`Passed: ${this.passed}`, 'success');
    this.log(`Failed: ${this.failed}`, this.failed > 0 ? 'error' : 'success');
    
    if (this.failed === 0) {
      this.log('\n🎉 Supabase development environment is properly configured!', 'success');
      this.log('\nNext steps:', 'info');
      this.log('1. Start Docker Desktop', 'info');
      this.log('2. Run: npm run supabase:start', 'info');
      this.log('3. Run: npm run dev', 'info');
    } else {
      this.log('\n❌ Some checks failed. Please review the setup.', 'error');
      this.log('Refer to docs/SUPABASE_SETUP.md for detailed instructions.', 'info');
    }

    return this.failed === 0;
  }
}

const verifier = new SupabaseSetupVerifier();
const success = verifier.runAllChecks();
process.exit(success ? 0 : 1);