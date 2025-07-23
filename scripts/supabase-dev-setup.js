#!/usr/bin/env node

/**
 * Supabase Development Setup Script
 * Helps set up and manage the local Supabase development environment
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SupabaseDevSetup {
  constructor() {
    this.supabaseConfigPath = path.join(process.cwd(), 'supabase', 'config.toml');
    this.envPath = path.join(process.cwd(), '.env.development');
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

  checkSupabaseInstalled() {
    try {
      execSync('npx supabase --version', { stdio: 'pipe' });
      this.log('Supabase CLI is available', 'success');
      return true;
    } catch (error) {
      this.log('Supabase CLI is not available. Please install it first:', 'error');
      this.log('npm install supabase', 'info');
      return false;
    }
  }

  checkDockerRunning() {
    try {
      execSync('docker ps', { stdio: 'pipe' });
      this.log('Docker is running', 'success');
      return true;
    } catch (error) {
      this.log('Docker is not running. Please start Docker first.', 'error');
      return false;
    }
  }

  startSupabase() {
    try {
      this.log('Starting Supabase local development environment...', 'info');
      execSync('npx supabase start', { stdio: 'inherit' });
      this.log('Supabase started successfully!', 'success');
      return true;
    } catch (error) {
      this.log('Failed to start Supabase', 'error');
      return false;
    }
  }

  stopSupabase() {
    try {
      this.log('Stopping Supabase local development environment...', 'info');
      execSync('npx supabase stop', { stdio: 'inherit' });
      this.log('Supabase stopped successfully!', 'success');
      return true;
    } catch (error) {
      this.log('Failed to stop Supabase', 'error');
      return false;
    }
  }

  getStatus() {
    try {
      this.log('Getting Supabase status...', 'info');
      execSync('npx supabase status', { stdio: 'inherit' });
      return true;
    } catch (error) {
      this.log('Failed to get Supabase status', 'error');
      return false;
    }
  }

  resetDatabase() {
    try {
      this.log('Resetting Supabase database...', 'warning');
      execSync('npx supabase db reset', { stdio: 'inherit' });
      this.log('Database reset successfully!', 'success');
      return true;
    } catch (error) {
      this.log('Failed to reset database', 'error');
      return false;
    }
  }

  generateTypes() {
    try {
      this.log('Generating TypeScript types...', 'info');
      
      // Ensure types directory exists
      const typesDir = path.join(process.cwd(), 'src', 'types');
      if (!fs.existsSync(typesDir)) {
        fs.mkdirSync(typesDir, { recursive: true });
      }
      
      execSync('npx supabase gen types typescript --local > src/types/supabase.ts', { stdio: 'inherit' });
      this.log('TypeScript types generated successfully!', 'success');
      return true;
    } catch (error) {
      this.log('Failed to generate types', 'error');
      return false;
    }
  }

  openStudio() {
    try {
      this.log('Opening Supabase Studio...', 'info');
      execSync('npx supabase studio', { stdio: 'inherit' });
      return true;
    } catch (error) {
      this.log('Failed to open Supabase Studio', 'error');
      return false;
    }
  }

  setup() {
    this.log('Setting up Supabase development environment...', 'info');
    
    if (!this.checkSupabaseInstalled()) {
      return false;
    }
    
    if (!this.checkDockerRunning()) {
      return false;
    }
    
    if (!this.startSupabase()) {
      return false;
    }
    
    this.log('Supabase development environment is ready!', 'success');
    this.log('You can now:', 'info');
    this.log('- View Supabase Studio at: http://localhost:54323', 'info');
    this.log('- Connect to the API at: http://localhost:54321', 'info');
    this.log('- View emails at: http://localhost:54324', 'info');
    
    return true;
  }

  run() {
    const command = process.argv[2];
    
    switch (command) {
      case 'setup':
        this.setup();
        break;
      case 'start':
        this.startSupabase();
        break;
      case 'stop':
        this.stopSupabase();
        break;
      case 'status':
        this.getStatus();
        break;
      case 'reset':
        this.resetDatabase();
        break;
      case 'types':
        this.generateTypes();
        break;
      case 'studio':
        this.openStudio();
        break;
      default:
        this.log('Available commands:', 'info');
        this.log('  setup  - Set up and start Supabase development environment', 'info');
        this.log('  start  - Start Supabase services', 'info');
        this.log('  stop   - Stop Supabase services', 'info');
        this.log('  status - Show Supabase services status', 'info');
        this.log('  reset  - Reset database with fresh migrations and seed data', 'info');
        this.log('  types  - Generate TypeScript types from database schema', 'info');
        this.log('  studio - Open Supabase Studio in browser', 'info');
        break;
    }
  }
}

const setup = new SupabaseDevSetup();
setup.run();