#!/usr/bin/env node

/**
 * Comprehensive Supabase Seeding System
 * 
 * This is the main entry point for the PostgreSQL-compatible seeding system
 * that provides unified access to all seeding, reset, and development utilities.
 */

const { seedSupabaseAll, resetSupabaseAll } = require('./seeder');
const { seedDatabase } = require('./seed-database');
const { generateAdvancedTestData } = require('./data-generator');
const { resetDatabase, getDatabaseStatistics } = require('./database-reset');
const { executeScenario, listScenarios, SCENARIOS } = require('./seeding-scenarios');
const { validateDatabaseIntegrity, cleanupAndOptimize } = require('./dev-utilities');
const { validateSupabaseConnection } = require('../utils/supabase-helpers');
const { logProgress, logSection, logSummary, logError } = require('../utils/logger');

/**
 * Main seeding system controller
 */
class SupabaseSeedingSystem {
  constructor(options = {}) {
    this.options = {
      verbose: false,
      dryRun: false,
      force: false,
      ...options
    };
  }

  /**
   * Initialize the seeding system
   */
  async initialize() {
    if (this.options.verbose) {
      logSection('Supabase Seeding System Initialization');
    }

    try {
      // Validate Supabase connection
      if (!this.options.dryRun) {
        await validateSupabaseConnection();
        if (this.options.verbose) {
          logProgress('✅ Supabase connection validated', 'success');
        }
      }

      return { success: true };
    } catch (error) {
      logError(error, 'System initialization', this.options.verbose);
      return { success: false, error: error.message };
    }
  }

  /**
   * Seed database with specified method and options
   */
  async seed(method = 'basic', seedOptions = {}) {
    const startTime = Date.now();
    
    if (this.options.verbose) {
      logSection(`Database Seeding - ${method.toUpperCase()}`);
    }

    try {
      let result;
      const options = { ...this.options, ...seedOptions };

      switch (method) {
        case 'basic':
          result = await seedSupabaseAll(options);
          break;
        
        case 'comprehensive':
          result = await seedDatabase(options);
          break;
        
        case 'advanced':
          result = await generateAdvancedTestData(options);
          break;
        
        case 'scenario':
          const scenario = seedOptions.scenario || 'basic';
          result = await executeScenario(scenario, options);
          break;
        
        default:
          throw new Error(`Unknown seeding method: ${method}`);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (result.success) {
        if (this.options.verbose) {
          logProgress(`✅ Seeding completed successfully in ${duration}s`, 'success');
          if (result.summary) {
            logSummary('Seeding Results', result.summary);
          }
        }
      }

      return { ...result, duration };
    } catch (error) {
      logError(error, 'Database seeding', this.options.verbose);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset database with specified method
   */
  async reset(method = 'full', resetOptions = {}) {
    const startTime = Date.now();
    
    if (this.options.verbose) {
      logSection(`Database Reset - ${method.toUpperCase()}`);
    }

    try {
      let result;
      const options = { ...this.options, ...resetOptions };

      switch (method) {
        case 'basic':
          result = await resetSupabaseAll(options);
          break;
        
        case 'full':
        case 'user-data':
        case 'selective':
          result = await resetDatabase({ mode: method, ...options });
          break;
        
        default:
          throw new Error(`Unknown reset method: ${method}`);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (result.success && !result.cancelled) {
        if (this.options.verbose) {
          logProgress(`✅ Reset completed successfully in ${duration}s`, 'success');
          if (result.statistics) {
            logSummary('Reset Results', result.statistics);
          }
        }
      }

      return { ...result, duration };
    } catch (error) {
      logError(error, 'Database reset', this.options.verbose);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current database status and statistics
   */
  async getStatus() {
    if (this.options.verbose) {
      logSection('Database Status Check');
    }

    try {
      const stats = await getDatabaseStatistics({ verbose: this.options.verbose });
      
      if (stats.success) {
        const summary = {
          totalRecords: stats.totalRecords,
          timestamp: stats.timestamp
        };

        Object.entries(stats.statistics).forEach(([table, stat]) => {
          summary[table] = stat.count;
        });

        if (this.options.verbose) {
          logSummary('Database Statistics', summary);
        }

        return {
          success: true,
          statistics: stats.statistics,
          totalRecords: stats.totalRecords,
          isEmpty: stats.totalRecords === 0
        };
      }

      return stats;
    } catch (error) {
      logError(error, 'Status check', this.options.verbose);
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate database integrity
   */
  async validate(validationOptions = {}) {
    if (this.options.verbose) {
      logSection('Database Integrity Validation');
    }

    try {
      const options = { ...this.options, ...validationOptions };
      const result = await validateDatabaseIntegrity(options);

      if (result.success) {
        if (this.options.verbose) {
          const summary = {
            totalIssues: result.issues.length,
            isHealthy: result.isHealthy,
            orphanedRecords: result.issues.filter(i => i.type === 'orphaned_records').length,
            consistencyIssues: result.issues.filter(i => i.type === 'consistency').length,
            performanceIssues: result.issues.filter(i => i.type === 'performance').length
          };
          
          logSummary('Validation Results', summary);

          if (result.issues.length > 0) {
            console.log('\nIssues Found:');
            result.issues.forEach((issue, index) => {
              console.log(`${index + 1}. ${issue.check}: ${issue.error || issue.issue || `Found ${issue.count} records`}`);
            });
          }
        }
      }

      return result;
    } catch (error) {
      logError(error, 'Database validation', this.options.verbose);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up and optimize database
   */
  async cleanup(cleanupOptions = {}) {
    if (this.options.verbose) {
      logSection('Database Cleanup and Optimization');
    }

    try {
      const options = { ...this.options, ...cleanupOptions };
      const result = await cleanupAndOptimize(options);

      if (result.success && this.options.verbose) {
        logSummary('Cleanup Results', result.cleanupResults);
      }

      return result;
    } catch (error) {
      logError(error, 'Database cleanup', this.options.verbose);
      return { success: false, error: error.message };
    }
  }

  /**
   * List available scenarios
   */
  listScenarios() {
    listScenarios({ verbose: this.options.verbose });
    return { success: true, scenarios: Object.keys(SCENARIOS) };
  }

  /**
   * Execute a complete workflow (reset + seed + validate)
   */
  async executeWorkflow(workflow = 'development', workflowOptions = {}) {
    const startTime = Date.now();
    
    if (this.options.verbose) {
      logSection(`Executing Workflow: ${workflow.toUpperCase()}`);
    }

    try {
      const results = {};
      const options = { ...this.options, ...workflowOptions };

      // Define workflows
      const workflows = {
        development: async () => {
          results.reset = await this.reset('user-data', { force: true });
          if (results.reset.success) {
            results.seed = await this.seed('comprehensive', { scenarios: ['basic', 'intermediate'] });
          }
          return results.reset.success && results.seed.success;
        },

        testing: async () => {
          results.reset = await this.reset('full', { force: true });
          if (results.reset.success) {
            results.seed = await this.seed('scenario', { scenario: 'comprehensive' });
            if (results.seed.success) {
              results.validate = await this.validate();
            }
          }
          return results.reset.success && results.seed.success && (results.validate?.success !== false);
        },

        performance: async () => {
          results.reset = await this.reset('full', { force: true });
          if (results.reset.success) {
            results.seed = await this.seed('advanced', { 
              userCount: 50, 
              weeksOfHistory: 12,
              generateAnalytics: true 
            });
            if (results.seed.success) {
              results.validate = await this.validate();
            }
          }
          return results.reset.success && results.seed.success && (results.validate?.success !== false);
        },

        cleanup: async () => {
          results.validate = await this.validate();
          results.cleanup = await this.cleanup();
          return results.validate.success && results.cleanup.success;
        }
      };

      if (!workflows[workflow]) {
        throw new Error(`Unknown workflow: ${workflow}. Available: ${Object.keys(workflows).join(', ')}`);
      }

      const success = await workflows[workflow]();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (this.options.verbose) {
        logSummary('Workflow Results', {
          workflow,
          success,
          duration: `${duration}s`,
          steps: Object.keys(results).join(', ')
        });
      }

      return {
        success,
        workflow,
        duration,
        results
      };
    } catch (error) {
      logError(error, 'Workflow execution', this.options.verbose);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Command line interface
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force') || args.includes('-f'),
    quiet: args.includes('--quiet') || args.includes('-q')
  };

  // Suppress output in quiet mode
  if (options.quiet) {
    console.log = () => {};
  }

  const system = new SupabaseSeedingSystem(options);

  try {
    // Initialize system
    const initResult = await system.initialize();
    if (!initResult.success) {
      console.error('❌ System initialization failed:', initResult.error);
      process.exit(1);
    }

    let result;

    switch (command) {
      case 'seed':
        const method = args[1] || 'basic';
        const seedOptions = {
          scenario: args.find(arg => arg.startsWith('--scenario='))?.split('=')[1],
          userCount: parseInt(args.find(arg => arg.startsWith('--users='))?.split('=')[1]) || undefined,
          weeksOfHistory: parseInt(args.find(arg => arg.startsWith('--weeks='))?.split('=')[1]) || undefined
        };
        result = await system.seed(method, seedOptions);
        break;

      case 'reset':
        const resetMethod = args[1] || 'full';
        result = await system.reset(resetMethod);
        break;

      case 'status':
        result = await system.getStatus();
        break;

      case 'validate':
        result = await system.validate();
        break;

      case 'cleanup':
        result = await system.cleanup();
        break;

      case 'scenarios':
        result = system.listScenarios();
        break;

      case 'workflow':
        const workflow = args[1] || 'development';
        result = await system.executeWorkflow(workflow);
        break;

      case 'help':
      default:
        showHelp();
        return;
    }

    if (result.success) {
      if (!options.quiet) {
        console.log(`✅ ${command} completed successfully`);
      }
    } else {
      console.error(`❌ ${command} failed:`, result.error);
      process.exit(1);
    }

  } catch (error) {
    console.error(`❌ Error executing ${command}:`, error.message);
    if (options.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
🌱 Supabase Seeding System - Comprehensive Database Management

USAGE:
  node seeding-system.js [command] [method] [options]

COMMANDS:
  seed [method]           Seed database with test data
  reset [method]          Reset database
  status                  Show current database status
  validate                Validate database integrity
  cleanup                 Clean up and optimize database
  scenarios               List available seeding scenarios
  workflow [name]         Execute predefined workflow
  help                    Show this help message

SEED METHODS:
  basic                   Basic seeding with simple test data
  comprehensive           Full seeding with realistic data
  advanced                Advanced data generation with patterns
  scenario                Use predefined scenario

RESET METHODS:
  basic                   Basic reset using simple method
  full                    Complete database reset
  user-data               Reset only user data, preserve exercises
  selective               Selective reset based on criteria

WORKFLOWS:
  development             Reset + seed for development
  testing                 Full reset + comprehensive seed + validate
  performance             Reset + advanced seed for performance testing
  cleanup                 Validate + cleanup + optimize

OPTIONS:
  --scenario=<name>       Use specific scenario for seeding
  --users=<count>         Number of users for advanced seeding
  --weeks=<count>         Weeks of history for advanced seeding
  --dry-run               Show what would be done without executing
  -f, --force             Skip confirmation prompts
  -v, --verbose           Show detailed progress information
  -q, --quiet             Suppress most output

EXAMPLES:
  # Basic development setup
  node seeding-system.js workflow development

  # Comprehensive testing setup
  node seeding-system.js workflow testing --verbose

  # Advanced performance testing data
  node seeding-system.js seed advanced --users=100 --weeks=16

  # Reset and seed specific scenario
  node seeding-system.js reset full --force
  node seeding-system.js seed scenario --scenario=comprehensive

  # Database maintenance
  node seeding-system.js validate --verbose
  node seeding-system.js cleanup

  # Quick status check
  node seeding-system.js status
  `);
}

// Export for use as module
module.exports = {
  SupabaseSeedingSystem,
  main
};

// Execute if run directly
if (require.main === module) {
  main();
}