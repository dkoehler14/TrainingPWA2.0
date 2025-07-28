#!/usr/bin/env node

/**
 * Edge Functions Rollback Management
 * 
 * This script provides rollback capabilities for Edge Functions
 * by maintaining deployment history and enabling quick restoration.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class EdgeFunctionRollbackManager {
  constructor() {
    this.backupDir = 'edge-functions-backups';
    this.deploymentHistoryFile = 'deployment-history.json';
    this.environments = {
      staging: {
        projectRef: process.env.SUPABASE_STAGING_PROJECT_REF
      },
      production: {
        projectRef: process.env.SUPABASE_PROJECT_REF
      }
    };

    this.functions = [
      'coaching-insights',
      'data-validation',
      'process-workout',
      'workout-triggers'
    ];

    this.ensureDirectories();
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
    const timestamp = new Date().toISOString();
    console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
  }

  ensureDirectories() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async createBackup(environment, options = {}) {
    const { tag = null, description = '' } = options;
    
    this.log(`📦 Creating backup for ${environment} environment...`, 'info');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = tag || `backup-${timestamp}`;
    const backupPath = path.join(this.backupDir, environment, backupId);

    // Create backup directory
    fs.mkdirSync(backupPath, { recursive: true });

    // Backup each function
    const backupManifest = {
      backupId,
      environment,
      timestamp: new Date().toISOString(),
      description,
      functions: {},
      git: {
        commit: this.getCurrentGitCommit(),
        branch: this.getCurrentGitBranch()
      }
    };

    for (const functionName of this.functions) {
      const functionDir = path.join('supabase', 'functions', functionName);
      const backupFunctionDir = path.join(backupPath, functionName);

      if (fs.existsSync(functionDir)) {
        // Copy function files
        this.copyDirectory(functionDir, backupFunctionDir);
        
        // Calculate file hashes for integrity
        const files = this.getFileHashes(backupFunctionDir);
        
        backupManifest.functions[functionName] = {
          files,
          hash: this.calculateDirectoryHash(backupFunctionDir)
        };

        this.log(`  ✅ Backed up function: ${functionName}`, 'success');
      } else {
        this.log(`  ⚠️  Function not found: ${functionName}`, 'warning');
      }
    }

    // Save backup manifest
    const manifestPath = path.join(backupPath, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(backupManifest, null, 2));

    // Update deployment history
    this.updateDeploymentHistory(environment, {
      type: 'backup',
      backupId,
      timestamp: backupManifest.timestamp,
      description,
      git: backupManifest.git
    });

    this.log(`✅ Backup created: ${backupId}`, 'success');
    return backupManifest;
  }

  async listBackups(environment) {
    const environmentBackupDir = path.join(this.backupDir, environment);
    
    if (!fs.existsSync(environmentBackupDir)) {
      this.log(`No backups found for ${environment}`, 'info');
      return [];
    }

    const backups = [];
    const backupDirs = fs.readdirSync(environmentBackupDir);

    for (const backupDir of backupDirs) {
      const manifestPath = path.join(environmentBackupDir, backupDir, 'manifest.json');
      
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          backups.push({
            id: manifest.backupId,
            timestamp: manifest.timestamp,
            description: manifest.description,
            git: manifest.git,
            functions: Object.keys(manifest.functions)
          });
        } catch (error) {
          this.log(`Error reading backup manifest: ${backupDir}`, 'warning');
        }
      }
    }

    // Sort by timestamp (newest first)
    backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return backups;
  }

  async restoreFromBackup(environment, backupId, options = {}) {
    const { dryRun = false, functions = null } = options;
    
    this.log(`🔄 ${dryRun ? 'DRY RUN: ' : ''}Restoring from backup ${backupId} to ${environment}...`, 'info');

    const backupPath = path.join(this.backupDir, environment, backupId);
    const manifestPath = path.join(backupPath, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Backup ${backupId} not found for ${environment}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const functionsToRestore = functions || Object.keys(manifest.functions);

    this.log(`Backup details:`, 'info');
    this.log(`  - Created: ${manifest.timestamp}`, 'info');
    this.log(`  - Description: ${manifest.description}`, 'info');
    this.log(`  - Git commit: ${manifest.git.commit}`, 'info');
    this.log(`  - Functions: ${functionsToRestore.join(', ')}`, 'info');

    if (dryRun) {
      this.log('DRY RUN: Would restore the following functions:', 'info');
      functionsToRestore.forEach(func => {
        this.log(`  - ${func}`, 'info');
      });
      return { dryRun: true, functions: functionsToRestore };
    }

    // Create current backup before restoring
    await this.createBackup(environment, {
      tag: `pre-rollback-${Date.now()}`,
      description: `Automatic backup before rollback to ${backupId}`
    });

    // Restore functions
    const restoredFunctions = [];
    const errors = [];

    for (const functionName of functionsToRestore) {
      try {
        const backupFunctionDir = path.join(backupPath, functionName);
        const currentFunctionDir = path.join('supabase', 'functions', functionName);

        if (fs.existsSync(backupFunctionDir)) {
          // Remove current function directory
          if (fs.existsSync(currentFunctionDir)) {
            fs.rmSync(currentFunctionDir, { recursive: true });
          }

          // Restore from backup
          this.copyDirectory(backupFunctionDir, currentFunctionDir);
          
          // Verify integrity
          const restoredHash = this.calculateDirectoryHash(currentFunctionDir);
          const expectedHash = manifest.functions[functionName].hash;
          
          if (restoredHash === expectedHash) {
            restoredFunctions.push(functionName);
            this.log(`  ✅ Restored function: ${functionName}`, 'success');
          } else {
            throw new Error(`Hash mismatch after restore: ${functionName}`);
          }
        } else {
          throw new Error(`Function not found in backup: ${functionName}`);
        }
      } catch (error) {
        errors.push(`${functionName}: ${error.message}`);
        this.log(`  ❌ Failed to restore ${functionName}: ${error.message}`, 'error');
      }
    }

    // Deploy restored functions
    if (restoredFunctions.length > 0) {
      this.log(`🚀 Deploying restored functions...`, 'info');
      
      try {
        const EdgeFunctionDeployer = require('./deploy-edge-functions.js');
        const deployer = new EdgeFunctionDeployer();
        
        for (const functionName of restoredFunctions) {
          await deployer.deployFunction(functionName, environment, { verify: true });
        }

        this.log(`✅ Rollback completed successfully`, 'success');
      } catch (deployError) {
        this.log(`❌ Deployment failed after restore: ${deployError.message}`, 'error');
        errors.push(`Deployment: ${deployError.message}`);
      }
    }

    // Update deployment history
    this.updateDeploymentHistory(environment, {
      type: 'rollback',
      backupId,
      timestamp: new Date().toISOString(),
      restoredFunctions,
      errors
    });

    const result = {
      backupId,
      restoredFunctions,
      errors,
      success: errors.length === 0
    };

    if (errors.length > 0) {
      throw new Error(`Rollback completed with errors:\n${errors.join('\n')}`);
    }

    return result;
  }

  async createRollbackPoint(environment, tag, description = '') {
    this.log(`📍 Creating rollback point: ${tag}`, 'info');
    
    const backup = await this.createBackup(environment, { tag, description });
    
    // Also create a git tag if we're in a git repository
    try {
      const gitTag = `rollback-${environment}-${tag}`;
      execSync(`git tag -a ${gitTag} -m "Rollback point: ${description}"`, { stdio: 'pipe' });
      this.log(`✅ Git tag created: ${gitTag}`, 'success');
    } catch (error) {
      this.log(`⚠️  Could not create git tag: ${error.message}`, 'warning');
    }

    return backup;
  }

  async getDeploymentHistory(environment, limit = 20) {
    const historyFile = path.join(this.backupDir, environment, this.deploymentHistoryFile);
    
    if (!fs.existsSync(historyFile)) {
      return [];
    }

    try {
      const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      return history.slice(0, limit);
    } catch (error) {
      this.log(`Error reading deployment history: ${error.message}`, 'warning');
      return [];
    }
  }

  updateDeploymentHistory(environment, entry) {
    const historyFile = path.join(this.backupDir, environment, this.deploymentHistoryFile);
    const historyDir = path.dirname(historyFile);
    
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    let history = [];
    if (fs.existsSync(historyFile)) {
      try {
        history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      } catch (error) {
        this.log(`Error reading history file, creating new one`, 'warning');
      }
    }

    history.unshift(entry);
    
    // Keep only last 100 entries
    history = history.slice(0, 100);
    
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
  }

  copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  getFileHashes(dir) {
    const files = {};
    
    const processDirectory = (currentDir, relativePath = '') => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativeFilePath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          processDirectory(fullPath, relativeFilePath);
        } else {
          const content = fs.readFileSync(fullPath);
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          files[relativeFilePath] = hash;
        }
      }
    };

    processDirectory(dir);
    return files;
  }

  calculateDirectoryHash(dir) {
    const files = this.getFileHashes(dir);
    const sortedFiles = Object.keys(files).sort();
    const combinedHash = sortedFiles.map(file => `${file}:${files[file]}`).join('|');
    return crypto.createHash('sha256').update(combinedHash).digest('hex');
  }

  getCurrentGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  getCurrentGitBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const rollbackManager = new EdgeFunctionRollbackManager();

  try {
    const command = args[0];
    const environment = args[1] || 'staging';

    switch (command) {
      case 'backup':
        const tag = args[2];
        const description = args.slice(3).join(' ');
        await rollbackManager.createBackup(environment, { tag, description });
        break;

      case 'list':
        const backups = await rollbackManager.listBackups(environment);
        console.log(`\nBackups for ${environment}:`);
        if (backups.length === 0) {
          console.log('  No backups found');
        } else {
          backups.forEach(backup => {
            console.log(`  ${backup.id} (${backup.timestamp})`);
            if (backup.description) {
              console.log(`    Description: ${backup.description}`);
            }
            console.log(`    Git: ${backup.git.commit} (${backup.git.branch})`);
            console.log(`    Functions: ${backup.functions.join(', ')}`);
            console.log('');
          });
        }
        break;

      case 'restore':
        const backupId = args[2];
        if (!backupId) {
          throw new Error('Backup ID is required');
        }
        
        const dryRun = args.includes('--dry-run');
        const functions = args.includes('--functions') ? 
          args[args.indexOf('--functions') + 1].split(',') : null;

        await rollbackManager.restoreFromBackup(environment, backupId, { dryRun, functions });
        break;

      case 'rollback-point':
        const pointTag = args[2];
        const pointDescription = args.slice(3).join(' ');
        if (!pointTag) {
          throw new Error('Tag is required for rollback point');
        }
        await rollbackManager.createRollbackPoint(environment, pointTag, pointDescription);
        break;

      case 'history':
        const limit = parseInt(args[2]) || 20;
        const history = await rollbackManager.getDeploymentHistory(environment, limit);
        console.log(`\nDeployment history for ${environment}:`);
        if (history.length === 0) {
          console.log('  No history found');
        } else {
          history.forEach(entry => {
            console.log(`  ${entry.timestamp} - ${entry.type}`);
            if (entry.backupId) {
              console.log(`    Backup: ${entry.backupId}`);
            }
            if (entry.description) {
              console.log(`    Description: ${entry.description}`);
            }
            if (entry.errors && entry.errors.length > 0) {
              console.log(`    Errors: ${entry.errors.length}`);
            }
            console.log('');
          });
        }
        break;

      default:
        console.log(`
Edge Functions Rollback Management

Usage:
  node scripts/edge-functions-rollback.js <command> [environment] [options]

Commands:
  backup [tag] [description]     Create backup of current functions
  list                          List available backups
  restore <backup-id>           Restore from backup
  rollback-point <tag> [desc]   Create tagged rollback point
  history [limit]               Show deployment history

Environments:
  staging                       Staging environment
  production                   Production environment

Options:
  --dry-run                    Show what would be restored without doing it
  --functions <list>           Comma-separated list of functions to restore

Examples:
  node scripts/edge-functions-rollback.js backup staging v1.2.0 "Release 1.2.0"
  node scripts/edge-functions-rollback.js list production
  node scripts/edge-functions-rollback.js restore staging backup-2024-01-15
  node scripts/edge-functions-rollback.js restore staging v1.1.0 --dry-run
  node scripts/edge-functions-rollback.js rollback-point production v1.2.0 "Stable release"
        `);
        process.exit(1);
    }

  } catch (error) {
    console.error(`\n❌ Rollback operation failed: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
module.exports = EdgeFunctionRollbackManager;

// Run CLI if script is executed directly
if (require.main === module) {
  main();
}