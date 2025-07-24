#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Test configuration
const TEST_CONFIG = {
  timeout: 30000, // 30 seconds
  retries: 3,
  functions: {
    'process-workout': {
      method: 'POST',
      body: {
        workoutLogId: 'test-workout-id'
      },
      expectedStatus: [200, 404], // 404 is acceptable for test data
      requiresAuth: true
    },
    'coaching-insights': {
      method: 'POST',
      body: {},
      expectedStatus: [200],
      requiresAuth: true
    },
    'data-validation': {
      method: 'POST',
      body: {
        type: 'workout',
        data: {
          date: new Date().toISOString(),
          exercises: []
        }
      },
      expectedStatus: [200],
      requiresAuth: true
    },
    'workout-triggers': {
      method: 'POST',
      body: {
        type: 'UPDATE',
        table: 'workout_logs',
        record: { id: 'test', is_finished: true },
        old_record: { id: 'test', is_finished: false }
      },
      expectedStatus: [200],
      requiresAuth: false
    }
  }
};

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

function getSupabaseStatus() {
  try {
    const output = execSync('supabase status --output json', { encoding: 'utf8' });
    return JSON.parse(output);
  } catch (error) {
    log('❌ Failed to get Supabase status', 'red');
    log('Make sure Supabase is running locally: supabase start', 'yellow');
    process.exit(1);
  }
}

function getAuthToken() {
  try {
    // For testing, we'll create a test user or use an existing one
    // In practice, you'd want to use a dedicated test user
    const output = execSync('supabase auth get-session --format json', { encoding: 'utf8' });
    const session = JSON.parse(output);
    return session.access_token;
  } catch (error) {
    log('⚠️  No auth session found. Some tests may fail.', 'yellow');
    return null;
  }
}

async function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function testFunction(functionName, config, baseUrl, authToken) {
  log(`🧪 Testing function: ${functionName}`, 'cyan');
  
  const url = `${baseUrl}/${functionName}`;
  const headers = {
    'Content-Type': 'application/json'
  };

  if (config.requiresAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const options = {
    method: config.method,
    headers,
    timeout: TEST_CONFIG.timeout
  };

  if (config.body) {
    options.body = JSON.stringify(config.body);
  }

  let lastError;
  
  for (let attempt = 1; attempt <= TEST_CONFIG.retries; attempt++) {
    try {
      log(`  Attempt ${attempt}/${TEST_CONFIG.retries}...`, 'blue');
      
      const response = await makeRequest(url, options);
      
      // Check if status code is expected
      if (config.expectedStatus.includes(response.status)) {
        log(`  ✅ Status: ${response.status} (expected)`, 'green');
        
        // Try to parse JSON response
        try {
          const jsonBody = JSON.parse(response.body);
          log(`  📄 Response: ${JSON.stringify(jsonBody, null, 2).substring(0, 200)}...`, 'blue');
        } catch (e) {
          log(`  📄 Response: ${response.body.substring(0, 200)}...`, 'blue');
        }
        
        return { success: true, status: response.status, body: response.body };
      } else {
        log(`  ❌ Unexpected status: ${response.status} (expected: ${config.expectedStatus.join(' or ')})`, 'red');
        log(`  📄 Response: ${response.body}`, 'red');
        lastError = new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error) {
      log(`  ❌ Request failed: ${error.message}`, 'red');
      lastError = error;
      
      if (attempt < TEST_CONFIG.retries) {
        log(`  ⏳ Retrying in 2 seconds...`, 'yellow');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  return { success: false, error: lastError };
}

async function testCorsHeaders(functionName, baseUrl) {
  log(`🔒 Testing CORS for: ${functionName}`, 'cyan');
  
  const url = `${baseUrl}/${functionName}`;
  const options = {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:3000',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type'
    }
  };

  try {
    const response = await makeRequest(url, options);
    
    if (response.status === 200) {
      const corsHeaders = [
        'access-control-allow-origin',
        'access-control-allow-methods',
        'access-control-allow-headers'
      ];
      
      const missingHeaders = corsHeaders.filter(header => !response.headers[header]);
      
      if (missingHeaders.length === 0) {
        log(`  ✅ CORS headers present`, 'green');
        return true;
      } else {
        log(`  ❌ Missing CORS headers: ${missingHeaders.join(', ')}`, 'red');
        return false;
      }
    } else {
      log(`  ❌ OPTIONS request failed: ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`  ❌ CORS test failed: ${error.message}`, 'red');
    return false;
  }
}

async function runHealthChecks(baseUrl, authToken) {
  log('🏥 Running health checks...', 'magenta');
  
  const healthChecks = [
    {
      name: 'Base URL accessibility',
      test: async () => {
        try {
          await makeRequest(baseUrl, { method: 'GET' });
          return true;
        } catch (error) {
          return false;
        }
      }
    },
    {
      name: 'Authentication token validity',
      test: async () => {
        return authToken !== null;
      }
    }
  ];

  for (const check of healthChecks) {
    const result = await check.test();
    log(`  ${result ? '✅' : '❌'} ${check.name}`, result ? 'green' : 'red');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const specificFunction = args[0];
  const skipCors = args.includes('--skip-cors');
  
  log('🧪 Edge Functions Testing Framework', 'magenta');
  log('===================================', 'magenta');
  
  // Get Supabase status
  const status = getSupabaseStatus();
  const edgeFunctionsUrl = status.find(service => service.name === 'Edge Functions')?.url;
  
  if (!edgeFunctionsUrl) {
    log('❌ Edge Functions service not found in Supabase status', 'red');
    log('Make sure Supabase is running: supabase start', 'yellow');
    process.exit(1);
  }
  
  log(`🔗 Edge Functions URL: ${edgeFunctionsUrl}`, 'blue');
  
  // Get auth token
  const authToken = getAuthToken();
  
  // Run health checks
  await runHealthChecks(edgeFunctionsUrl, authToken);
  
  // Determine which functions to test
  const functionsToTest = specificFunction 
    ? [specificFunction] 
    : Object.keys(TEST_CONFIG.functions);
  
  if (specificFunction && !TEST_CONFIG.functions[specificFunction]) {
    log(`❌ Unknown function: ${specificFunction}`, 'red');
    log(`Available functions: ${Object.keys(TEST_CONFIG.functions).join(', ')}`, 'yellow');
    process.exit(1);
  }
  
  let passedTests = 0;
  let failedTests = 0;
  
  // Test each function
  for (const functionName of functionsToTest) {
    const config = TEST_CONFIG.functions[functionName];
    
    log(`\n📋 Testing: ${functionName}`, 'magenta');
    log('─'.repeat(50), 'magenta');
    
    // Test main functionality
    const result = await testFunction(functionName, config, edgeFunctionsUrl, authToken);
    
    if (result.success) {
      passedTests++;
    } else {
      failedTests++;
    }
    
    // Test CORS headers
    if (!skipCors) {
      const corsResult = await testCorsHeaders(functionName, edgeFunctionsUrl);
      if (!corsResult) {
        failedTests++;
      } else {
        passedTests++;
      }
    }
  }
  
  // Summary
  log('\n📊 Test Summary:', 'magenta');
  log('================', 'magenta');
  log(`✅ Passed: ${passedTests}`, 'green');
  log(`❌ Failed: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
  
  if (failedTests > 0) {
    log('\n⚠️  Some tests failed. Check the logs above for details.', 'yellow');
    process.exit(1);
  } else {
    log('\n🎉 All tests passed!', 'green');
  }
}

// Handle script execution
if (require.main === module) {
  main().catch(error => {
    log(`❌ Test runner failed: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = {
  testFunction,
  testCorsHeaders,
  runHealthChecks
};