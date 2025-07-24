#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');
const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkPrerequisites() {
  log('🔍 Checking prerequisites...', 'blue');
  
  // Check if Supabase CLI is installed
  try {
    execSync('supabase --version', { stdio: 'pipe' });
    log('✅ Supabase CLI is installed', 'green');
  } catch (error) {
    log('❌ Supabase CLI is not installed. Please install it first:', 'red');
    log('npm install -g supabase', 'yellow');
    process.exit(1);
  }

  // Check if we're in a Supabase project
  if (!fs.existsSync(path.join(__dirname, '..', 'supabase', 'config.toml'))) {
    log('❌ Not in a Supabase project directory', 'red');
    process.exit(1);
  }

  // Check environment variables
  const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    log('❌ Missing required environment variables:', 'red');
    missingVars.forEach(varName => log(`  - ${varName}`, 'yellow'));
    log('Please set these variables before deploying', 'yellow');
    process.exit(1);
  }

  log('✅ All prerequisites met', 'green');
}

function getFunctionDirectories() {
  const functions = [];
  const items = fs.readdirSync(FUNCTIONS_DIR);
  
  for (const item of items) {
    const itemPath = path.join(FUNCTIONS_DIR, item);
    if (fs.statSync(itemPath).isDirectory() && !item.startsWith('_')) {
      // Check if it has an index.ts file
      const indexPath = path.join(itemPath, 'index.ts');
      if (fs.existsSync(indexPath)) {
        functions.push(item);
      }
    }
  }
  
  return functions;
}

function deployFunction(functionName) {
  log(`🚀 Deploying function: ${functionName}`, 'cyan');
  
  try {
    const command = `supabase functions deploy ${functionName}`;
    execSync(command, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    log(`✅ Successfully deployed: ${functionName}`, 'green');
    return true;
  } catch (error) {
    log(`❌ Failed to deploy: ${functionName}`, 'red');
    log(`Error: ${error.message}`, 'red');
    return false;
  }
}

function testFunction(functionName) {
  log(`🧪 Testing function: ${functionName}`, 'cyan');
  
  // Basic health check test
  try {
    const testCommand = `curl -X POST "$(supabase status | grep 'Edge Functions' | awk '{print $3}')/${functionName}" \\
      -H "Authorization: Bearer $(supabase auth get-session --format json | jq -r '.access_token')" \\
      -H "Content-Type: application/json" \\
      -d '{"test": true}' \\
      --max-time 10`;
    
    // Note: This is a basic test. In practice, you'd want more comprehensive testing
    log(`Test command: ${testCommand}`, 'yellow');
    log(`⚠️  Manual testing required for function: ${functionName}`, 'yellow');
    return true;
  } catch (error) {
    log(`❌ Test failed for: ${functionName}`, 'red');
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const specificFunction = args[0];
  const skipTests = args.includes('--skip-tests');
  
  log('🎯 Edge Functions Deployment Script', 'magenta');
  log('=====================================', 'magenta');
  
  checkPrerequisites();
  
  const functions = getFunctionDirectories();
  
  if (functions.length === 0) {
    log('❌ No Edge Functions found to deploy', 'red');
    process.exit(1);
  }
  
  log(`📦 Found ${functions.length} functions:`, 'blue');
  functions.forEach(fn => log(`  - ${fn}`, 'cyan'));
  
  const functionsTodeploy = specificFunction ? [specificFunction] : functions;
  
  if (specificFunction && !functions.includes(specificFunction)) {
    log(`❌ Function '${specificFunction}' not found`, 'red');
    process.exit(1);
  }
  
  let successCount = 0;
  let failCount = 0;
  
  for (const functionName of functionsTodeploy) {
    if (deployFunction(functionName)) {
      successCount++;
      
      if (!skipTests) {
        testFunction(functionName);
      }
    } else {
      failCount++;
    }
    
    log(''); // Empty line for readability
  }
  
  // Summary
  log('📊 Deployment Summary:', 'magenta');
  log(`✅ Successful: ${successCount}`, 'green');
  log(`❌ Failed: ${failCount}`, failCount > 0 ? 'red' : 'green');
  
  if (failCount > 0) {
    log('⚠️  Some deployments failed. Check the logs above.', 'yellow');
    process.exit(1);
  } else {
    log('🎉 All functions deployed successfully!', 'green');
  }
}

// Handle script execution
if (require.main === module) {
  main();
}

module.exports = {
  deployFunction,
  getFunctionDirectories,
  checkPrerequisites
};