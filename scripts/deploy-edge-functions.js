#!/usr/bin/env node

/**
 * Edge Functions Deployment Pipeline
 * 
 * This script provides automated deployment for Supabase Edge Functions
 * with support for staging and production environments, verification,
 * and rollback capabilities.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class EdgeFunctionDeployer {
  constructor() {
    this.environments = {
      staging: {
        projectRef: process.env.SUPABASE_STAGING_PROJECT_REF,
        url: process.env.SUPABASE_STAGING_URL,
        anonKey: process.env.SUPABASE_STAGING_ANON_KEY
      },
      production: {
        projectRef: process.env.SUPABASE_PROJECT_REF,
        url: process.env.REACT_APP_SUPABASE_URL,
        anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY
      }
    };

    this.functions = [
      'coaching-insights',
      'data-validation',
      'process-workout',
      'workout-triggers'
    ];

    this.deploymentHistory = [];
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

  async validateEnvironment(env) {
    this.log(`🔍 Validating ${env} environment...`, 'info');
    
    const config = this.environments[env];
    if (!config.projectRef) {
      throw new Error(`Missing project reference for ${env} environment`);
    }

    // Test Supabase CLI connectivity
    try {
      execSync(`supabase projects list`, { stdio: 'pipe' });
      this.log('✅ Supabase CLI is authenticated', 'success');
    } catch (error) {
      throw new Error('Supabase CLI not authenticated. Run: supabase login');
    }

    // Verify project exists
    try {
      const projects = execSync('supabase projects list --output json', { encoding: 'utf8' });
      const projectList = JSON.parse(projects);
      const project = projectList.find(p => p.id === config.projectRef);
      
      if (!project) {
        throw new Error(`Project ${config.projectRef} not found`);
      }
      
      this.log(`✅ Project found: ${project.name}`, 'success');
    } catch (error) {
      throw new Error(`Failed to verify project: ${error.message}`);
    }

    return true;
  }

  async validateFunctions() {
    this.log('🔍 Validating Edge Functions...', 'info');
    
    const functionsDir = 'supabase/functions';
    const errors = [];

    for (const functionName of this.functions) {
      const functionPath = path.join(functionsDir, functionName, 'index.ts');
      
      if (!fs.existsSync(functionPath)) {
        errors.push(`Function ${functionName} not found at ${functionPath}`);
        continue;
      }

      // Basic TypeScript syntax check
      try {
        const content = fs.readFileSync(functionPath, 'utf8');
        
        // Check for required imports
        if (!content.includes('serve')) {
          errors.push(`Function ${functionName} missing serve import`);
        }
        
        if (!content.includes('corsHeaders')) {
          errors.push(`Function ${functionName} missing CORS headers`);
        }

        this.log(`✅ Function ${functionName} validated`, 'success');
      } catch (error) {
        errors.push(`Error reading function ${functionName}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Function validation failed:\n${errors.join('\n')}`);
    }

    return true;
  }

  async deployFunction(functionName, environment, options = {}) {
    const { dryRun = false, verify = true } = options;
    const config = this.environments[environment];
    
    this.log(`🚀 ${dryRun ? 'DRY RUN: ' : ''}Deploying ${functionName} to ${environment}...`, 'info');

    if (dryRun) {
      this.log(`Would deploy: supabase functions deploy ${functionName} --project-ref ${config.projectRef}`, 'info');
      return { success: true, dryRun: true };
    }

    try {
      const startTime = Date.now();
      
      // Deploy the function
      const deployCommand = `supabase functions deploy ${functionName} --project-ref ${config.projectRef}`;
      execSync(deployCommand, { stdio: 'inherit' });
      
      const deployTime = Date.now() - startTime;
      this.log(`✅ Function ${functionName} deployed successfully (${deployTime}ms)`, 'success');

      // Record deployment
      const deployment = {
        functionName,
        environment,
        timestamp: new Date().toISOString(),
        deployTime,
        success: true
      };

      this.deploymentHistory.push(deployment);

      // Verify deployment if requested
      if (verify) {
        await this.verifyFunction(functionName, environment);
      }

      return deployment;

    } catch (error) {
      const deployment = {
        functionName,
        environment,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      };

      this.deploymentHistory.push(deployment);
      throw new Error(`Failed to deploy ${functionName}: ${error.message}`);
    }
  }

  async deployAllFunctions(environment, options = {}) {
    const { dryRun = false, parallel = false, verify = true } = options;
    
    this.log(`🚀 ${dryRun ? 'DRY RUN: ' : ''}Deploying all functions to ${environment}...`, 'info');

    await this.validateEnvironment(environment);
    await this.validateFunctions();

    const deployments = [];
    const errors = [];

    if (parallel && !dryRun) {
      // Deploy functions in parallel
      const deployPromises = this.functions.map(functionName => 
        this.deployFunction(functionName, environment, { dryRun, verify: false })
          .catch(error => ({ functionName, error: error.message }))
      );

      const results = await Promise.all(deployPromises);
      
      for (const result of results) {
        if (result.error) {
          errors.push(`${result.functionName}: ${result.error}`);
        } else {
          deployments.push(result);
        }
      }

      // Verify all functions after parallel deployment
      if (verify && errors.length === 0) {
        for (const functionName of this.functions) {
          try {
            await this.verifyFunction(functionName, environment);
          } catch (error) {
            errors.push(`Verification failed for ${functionName}: ${error.message}`);
          }
        }
      }

    } else {
      // Deploy functions sequentially
      for (const functionName of this.functions) {
        try {
          const deployment = await this.deployFunction(functionName, environment, { dryRun, verify });
          deployments.push(deployment);
        } catch (error) {
          errors.push(`${functionName}: ${error.message}`);
          
          // Stop on first error in sequential mode unless continuing
          if (!options.continueOnError) {
            break;
          }
        }
      }
    }

    // Generate deployment report
    const report = {
      environment,
      timestamp: new Date().toISOString(),
      totalFunctions: this.functions.length,
      successfulDeployments: deployments.length,
      failedDeployments: errors.length,
      deployments,
      errors,
      dryRun
    };

    this.saveDeploymentReport(report);

    if (errors.length > 0) {
      this.log(`❌ Deployment completed with ${errors.length} errors:`, 'error');
      errors.forEach(error => this.log(`   - ${error}`, 'error'));
      
      if (errors.length === this.functions.length) {
        throw new Error('All function deployments failed');
      }
    } else {
      this.log(`✅ All functions deployed successfully to ${environment}`, 'success');
    }

    return report;
  }

  async verifyFunction(functionName, environment) {
    const config = this.environments[environment];
    this.log(`🔍 Verifying function ${functionName} in ${environment}...`, 'info');

    try {
      // Get function URL
      const functionUrl = `${config.url}/functions/v1/${functionName}`;
      
      // Test basic connectivity with OPTIONS request (CORS preflight)
      const response = await fetch(functionUrl, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://localhost:3000',
          'Access-Control-Request-Method': 'POST'
        }
      });

      if (response.ok) {
        this.log(`✅ Function ${functionName} is responding`, 'success');
        return true;
      } else {
        throw new Error(`Function returned status ${response.status}`);
      }

    } catch (error) {
      this.log(`❌ Function ${functionName} verification failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async verifyAllFunctions(environment) {
    this.log(`🔍 Verifying all functions in ${environment}...`, 'info');
    
    const results = [];
    const errors = [];

    for (const functionName of this.functions) {
      try {
        await this.verifyFunction(functionName, environment);
        results.push({ functionName, status: 'healthy' });
      } catch (error) {
        errors.push({ functionName, error: error.message });
        results.push({ functionName, status: 'unhealthy', error: error.message });
      }
    }

    const report = {
      environment,
      timestamp: new Date().toISOString(),
      totalFunctions: this.functions.length,
      healthyFunctions: results.filter(r => r.status === 'healthy').length,
      unhealthyFunctions: errors.length,
      results
    };

    this.log(`📊 Verification complete: ${report.healthyFunctions}/${report.totalFunctions} functions healthy`, 
      errors.length === 0 ? 'success' : 'warning');

    return report;
  }

  async rollbackFunction(functionName, environment, version) {
    this.log(`🔄 Rolling back ${functionName} in ${environment} to version ${version}...`, 'warning');
    
    // Note: Supabase doesn't have built-in rollback, so this would require
    // maintaining deployment history and redeploying previous versions
    
    throw new Error('Rollback functionality requires implementation of version management');
  }

  async createDeploymentPlan(environment, options = {}) {
    const { includeVerification = true, parallel = false } = options;
    
    const plan = {
      environment,
      functions: this.functions,
      steps: [],
      estimatedTime: 0
    };

    // Pre-deployment validation
    plan.steps.push({
      name: 'Environment Validation',
      type: 'validation',
      estimatedTime: 5000
    });

    plan.steps.push({
      name: 'Function Validation',
      type: 'validation',
      estimatedTime: 3000
    });

    // Deployment steps
    if (parallel) {
      plan.steps.push({
        name: 'Deploy All Functions (Parallel)',
        type: 'deployment',
        functions: this.functions,
        estimatedTime: 30000
      });
    } else {
      this.functions.forEach(functionName => {
        plan.steps.push({
          name: `Deploy ${functionName}`,
          type: 'deployment',
          function: functionName,
          estimatedTime: 15000
        });
      });
    }

    // Verification steps
    if (includeVerification) {
      plan.steps.push({
        name: 'Verify All Functions',
        type: 'verification',
        estimatedTime: 10000
      });
    }

    plan.estimatedTime = plan.steps.reduce((total, step) => total + step.estimatedTime, 0);

    return plan;
  }

  saveDeploymentReport(report) {
    const reportsDir = 'deployment-reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filename = `edge-functions-${report.environment}-${Date.now()}.json`;
    const filepath = path.join(reportsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    this.log(`📄 Deployment report saved: ${filepath}`, 'info');
  }

  async runHealthCheck(environment) {
    this.log(`🏥 Running health check for ${environment}...`, 'info');
    
    const healthReport = await this.verifyAllFunctions(environment);
    
    // Save health check report
    const reportsDir = 'deployment-reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filename = `health-check-${environment}-${Date.now()}.json`;
    const filepath = path.join(reportsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(healthReport, null, 2));
    this.log(`📄 Health check report saved: ${filepath}`, 'info');

    return healthReport;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const deployer = new EdgeFunctionDeployer();

  try {
    const command = args[0];
    const environment = args[1] || 'staging';

    switch (command) {
      case 'deploy':
        const functionName = args[2];
        const dryRun = args.includes('--dry-run');
        const parallel = args.includes('--parallel');
        const continueOnError = args.includes('--continue-on-error');

        if (functionName) {
          await deployer.deployFunction(functionName, environment, { dryRun });
        } else {
          await deployer.deployAllFunctions(environment, { 
            dryRun, 
            parallel, 
            continueOnError 
          });
        }
        break;

      case 'verify':
        const verifyFunction = args[2];
        if (verifyFunction) {
          await deployer.verifyFunction(verifyFunction, environment);
        } else {
          await deployer.verifyAllFunctions(environment);
        }
        break;

      case 'health-check':
        await deployer.runHealthCheck(environment);
        break;

      case 'plan':
        const plan = await deployer.createDeploymentPlan(environment, {
          parallel: args.includes('--parallel')
        });
        console.log(JSON.stringify(plan, null, 2));
        break;

      case 'rollback':
        const rollbackFunction = args[2];
        const version = args[3];
        if (!rollbackFunction || !version) {
          throw new Error('Usage: rollback <environment> <function> <version>');
        }
        await deployer.rollbackFunction(rollbackFunction, environment, version);
        break;

      default:
        console.log(`
Edge Functions Deployment Pipeline

Usage:
  node scripts/deploy-edge-functions.js <command> [environment] [options]

Commands:
  deploy [function]     Deploy all functions or specific function
  verify [function]     Verify all functions or specific function
  health-check         Run comprehensive health check
  plan                 Show deployment plan
  rollback <function> <version>  Rollback function to previous version

Environments:
  staging              Deploy to staging environment
  production           Deploy to production environment

Options:
  --dry-run           Show what would be deployed without deploying
  --parallel          Deploy functions in parallel (faster)
  --continue-on-error Continue deployment even if some functions fail

Examples:
  node scripts/deploy-edge-functions.js deploy staging --dry-run
  node scripts/deploy-edge-functions.js deploy production --parallel
  node scripts/deploy-edge-functions.js verify staging
  node scripts/deploy-edge-functions.js health-check production
        `);
        process.exit(1);
    }

  } catch (error) {
    console.error(`\n❌ Deployment failed: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
module.exports = EdgeFunctionDeployer;

// Run CLI if script is executed directly
if (require.main === module) {
  main();
}