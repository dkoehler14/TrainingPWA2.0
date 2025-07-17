#!/usr/bin/env node

/**
 * Quick Development Environment Validator
 * 
 * A lightweight script to quickly validate that the development environment
 * is properly configured and all services are accessible.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const EMULATOR_PORTS = {
  firestore: 8080,
  auth: 9099,
  functions: 5001,
  ui: 4000
};

const TIMEOUT = 5000; // 5 seconds

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkPort(port, serviceName) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: port,
      method: 'GET',
      timeout: TIMEOUT
    }, (res) => {
      resolve({ service: serviceName, port, available: true, status: res.statusCode });
    });

    req.on('error', (error) => {
      resolve({ service: serviceName, port, available: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ service: serviceName, port, available: false, error: 'timeout' });
    });

    req.end();
  });
}

async function checkEmulators() {
  log('\n🔍 Checking Firebase Emulators...', 'cyan');
  
  const checks = Object.entries(EMULATOR_PORTS).map(([service, port]) => 
    checkPort(port, service)
  );
  
  const results = await Promise.all(checks);
  let allRunning = true;
  
  results.forEach(({ service, port, available, status, error }) => {
    if (available) {
      log(`✅ ${service} emulator: Running on port ${port} (status: ${status})`, 'green');
    } else {
      log(`❌ ${service} emulator: Not running on port ${port} (${error})`, 'red');
      allRunning = false;
    }
  });
  
  return allRunning;
}

function checkEnvironmentFiles() {
  log('\n📁 Checking Environment Files...', 'cyan');
  
  const requiredFiles = [
    '.env.development',
    'firebase.json',
    'src/config/environment.js',
    'src/firebase.js'
  ];
  
  let allPresent = true;
  
  requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
      log(`✅ ${file}: Found`, 'green');
    } else {
      log(`❌ ${file}: Missing`, 'red');
      allPresent = false;
    }
  });
  
  return allPresent;
}

function checkPackageScripts() {
  log('\n📦 Checking Package Scripts...', 'cyan');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const requiredScripts = [
      'dev',
      'dev:react',
      'dev:firebase'
    ];
    
    let allPresent = true;
    
    requiredScripts.forEach(script => {
      if (packageJson.scripts && packageJson.scripts[script]) {
        log(`✅ npm run ${script}: Available`, 'green');
      } else {
        log(`❌ npm run ${script}: Missing`, 'red');
        allPresent = false;
      }
    });
    
    return allPresent;
  } catch (error) {
    log(`❌ Error reading package.json: ${error.message}`, 'red');
    return false;
  }
}

function checkDependencies() {
  log('\n🔧 Checking Dependencies...', 'cyan');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const requiredDeps = [
      'concurrently',
      'cross-env'
    ];
    
    let allPresent = true;
    
    requiredDeps.forEach(dep => {
      const inDeps = packageJson.dependencies && packageJson.dependencies[dep];
      const inDevDeps = packageJson.devDependencies && packageJson.devDependencies[dep];
      
      if (inDeps || inDevDeps) {
        log(`✅ ${dep}: Installed`, 'green');
      } else {
        log(`❌ ${dep}: Missing`, 'red');
        allPresent = false;
      }
    });
    
    return allPresent;
  } catch (error) {
    log(`❌ Error checking dependencies: ${error.message}`, 'red');
    return false;
  }
}

function checkEnvironmentVariables() {
  log('\n🌍 Checking Environment Variables...', 'cyan');
  
  // Load .env.development if it exists
  if (fs.existsSync('.env.development')) {
    const envContent = fs.readFileSync('.env.development', 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        envVars[key.trim()] = value.trim();
      }
    });
    
    const requiredVars = [
      'REACT_APP_USE_EMULATORS',
      'REACT_APP_FIREBASE_PROJECT_ID'
    ];
    
    let allPresent = true;
    
    requiredVars.forEach(varName => {
      if (envVars[varName]) {
        log(`✅ ${varName}: ${envVars[varName]}`, 'green');
      } else {
        log(`❌ ${varName}: Missing`, 'red');
        allPresent = false;
      }
    });
    
    return allPresent;
  } else {
    log('❌ .env.development file not found', 'red');
    return false;
  }
}

function provideTroubleshootingTips() {
  log('\n🔧 Troubleshooting Tips:', 'yellow');
  log('1. Start Firebase emulators: firebase emulators:start', 'blue');
  log('2. Install missing dependencies: npm install', 'blue');
  log('3. Check Firebase CLI: firebase --version', 'blue');
  log('4. Verify project setup: firebase projects:list', 'blue');
  log('5. Start development server: npm run dev', 'blue');
}

async function main() {
  log('🚀 Development Environment Validator', 'cyan');
  log('=====================================', 'cyan');
  
  const checks = [
    { name: 'Environment Files', fn: checkEnvironmentFiles },
    { name: 'Package Scripts', fn: checkPackageScripts },
    { name: 'Dependencies', fn: checkDependencies },
    { name: 'Environment Variables', fn: checkEnvironmentVariables },
    { name: 'Firebase Emulators', fn: checkEmulators }
  ];
  
  let allPassed = true;
  
  for (const check of checks) {
    const result = await check.fn();
    if (!result) {
      allPassed = false;
    }
  }
  
  log('\n📊 Summary:', 'cyan');
  if (allPassed) {
    log('✅ All checks passed! Your development environment is ready.', 'green');
    log('\n🎉 You can now run: npm run dev', 'green');
  } else {
    log('❌ Some checks failed. Please fix the issues above.', 'red');
    provideTroubleshootingTips();
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    log(`❌ Validator failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { checkEmulators, checkEnvironmentFiles, checkPackageScripts };