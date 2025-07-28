#!/usr/bin/env node

/**
 * Edge Functions Verification and Testing Script
 * 
 * This script provides comprehensive verification and testing
 * capabilities for deployed Edge Functions.
 */

const fs = require('fs');
const path = require('path');

class EdgeFunctionVerifier {
  constructor() {
    this.environments = {
      staging: {
        url: process.env.SUPABASE_STAGING_URL,
        anonKey: process.env.SUPABASE_STAGING_ANON_KEY
      },
      production: {
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

    this.testResults = [];
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

  async testFunctionConnectivity(functionName, environment) {
    const config = this.environments[environment];
    const functionUrl = `${config.url}/functions/v1/${functionName}`;
    
    this.log(`🔍 Testing connectivity for ${functionName} in ${environment}...`, 'info');

    const tests = [
      {
        name: 'CORS Preflight',
        test: async () => {
          const response = await fetch(functionUrl, {
            method: 'OPTIONS',
            headers: {
              'Origin': 'https://localhost:3000',
              'Access-Control-Request-Method': 'POST',
              'Access-Control-Request-Headers': 'authorization,content-type'
            }
          });

          return {
            success: response.ok,
            status: response.status,
            headers: Object.fromEntries(response.headers.entries())
          };
        }
      },
      {
        name: 'Unauthorized Request',
        test: async () => {
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ test: true })
          });

          return {
            success: response.status === 401, // Should return 401 for unauthorized
            status: response.status,
            body: await response.text()
          };
        }
      },
      {
        name: 'Response Time',
        test: async () => {
          const startTime = Date.now();
          
          const response = await fetch(functionUrl, {
            method: 'OPTIONS',
            headers: {
              'Origin': 'https://localhost:3000'
            }
          });

          const responseTime = Date.now() - startTime;

          return {
            success: responseTime < 5000, // Should respond within 5 seconds
            responseTime,
            status: response.status
          };
        }
      }
    ];

    const results = [];

    for (const test of tests) {
      try {
        const result = await test.test();
        results.push({
          name: test.name,
          ...result,
          error: null
        });

        if (result.success) {
          this.log(`  ✅ ${test.name}: PASS`, 'success');
        } else {
          this.log(`  ❌ ${test.name}: FAIL`, 'error');
        }

      } catch (error) {
        results.push({
          name: test.name,
          success: false,
          error: error.message
        });
        this.log(`  ❌ ${test.name}: ERROR - ${error.message}`, 'error');
      }
    }

    return {
      functionName,
      environment,
      timestamp: new Date().toISOString(),
      tests: results,
      overallSuccess: results.every(r => r.success)
    };
  }

  async testFunctionWithAuth(functionName, environment, authToken) {
    const config = this.environments[environment];
    const functionUrl = `${config.url}/functions/v1/${functionName}`;
    
    this.log(`🔐 Testing ${functionName} with authentication...`, 'info');

    try {
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(this.getTestPayload(functionName))
      });

      const responseBody = await response.text();
      let parsedBody;
      
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        parsedBody = responseBody;
      }

      return {
        functionName,
        environment,
        success: response.ok,
        status: response.status,
        responseTime: response.headers.get('x-response-time'),
        body: parsedBody,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        functionName,
        environment,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  getTestPayload(functionName) {
    const payloads = {
      'coaching-insights': {},
      'data-validation': {
        type: 'user_profile',
        data: {
          name: 'Test User',
          email: 'test@example.com',
          experience_level: 'beginner'
        }
      },
      'process-workout': {
        workoutLogId: 'test-workout-id'
      },
      'workout-triggers': {
        type: 'test',
        data: {}
      }
    };

    return payloads[functionName] || {};
  }

  async runLoadTest(functionName, environment, options = {}) {
    const { 
      concurrency = 5, 
      requests = 20, 
      authToken = null 
    } = options;

    this.log(`⚡ Running load test for ${functionName} (${concurrency} concurrent, ${requests} total)...`, 'info');

    const config = this.environments[environment];
    const functionUrl = `${config.url}/functions/v1/${functionName}`;
    
    const results = {
      functionName,
      environment,
      concurrency,
      totalRequests: requests,
      startTime: Date.now(),
      responses: [],
      errors: []
    };

    // Create batches of concurrent requests
    const batches = [];
    for (let i = 0; i < requests; i += concurrency) {
      const batchSize = Math.min(concurrency, requests - i);
      batches.push(batchSize);
    }

    for (const batchSize of batches) {
      const batchPromises = [];
      
      for (let j = 0; j < batchSize; j++) {
        const requestPromise = this.makeLoadTestRequest(functionUrl, authToken, functionName);
        batchPromises.push(requestPromise);
      }

      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.responses.push(result.value);
        } else {
          results.errors.push(result.reason.message);
        }
      }
    }

    results.endTime = Date.now();
    results.totalTime = results.endTime - results.startTime;
    results.avgResponseTime = results.responses.reduce((sum, r) => sum + r.responseTime, 0) / results.responses.length;
    results.successRate = (results.responses.filter(r => r.success).length / results.responses.length) * 100;

    this.log(`📊 Load test complete: ${results.successRate.toFixed(1)}% success rate, ${results.avgResponseTime.toFixed(0)}ms avg response`, 
      results.successRate > 95 ? 'success' : 'warning');

    return results;
  }

  async makeLoadTestRequest(functionUrl, authToken, functionName) {
    const startTime = Date.now();
    
    try {
      const headers = {
        'Content-Type': 'application/json'
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(functionUrl, {
        method: authToken ? 'POST' : 'OPTIONS',
        headers,
        body: authToken ? JSON.stringify(this.getTestPayload(functionName)) : undefined
      });

      const responseTime = Date.now() - startTime;

      return {
        success: response.ok,
        status: response.status,
        responseTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  async runComprehensiveTest(environment, options = {}) {
    const { 
      includeLoadTest = false, 
      authToken = null,
      saveReport = true 
    } = options;

    this.log(`🧪 Running comprehensive test suite for ${environment}...`, 'info');

    const testSuite = {
      environment,
      startTime: new Date().toISOString(),
      functions: {},
      summary: {
        totalFunctions: this.functions.length,
        passedFunctions: 0,
        failedFunctions: 0,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0
      }
    };

    // Test each function
    for (const functionName of this.functions) {
      this.log(`\n🔍 Testing function: ${functionName}`, 'info');
      
      const functionTests = {
        connectivity: null,
        authentication: null,
        loadTest: null
      };

      // Connectivity test
      try {
        functionTests.connectivity = await this.testFunctionConnectivity(functionName, environment);
        testSuite.summary.totalTests += functionTests.connectivity.tests.length;
        testSuite.summary.passedTests += functionTests.connectivity.tests.filter(t => t.success).length;
        testSuite.summary.failedTests += functionTests.connectivity.tests.filter(t => !t.success).length;
      } catch (error) {
        this.log(`❌ Connectivity test failed: ${error.message}`, 'error');
        functionTests.connectivity = { error: error.message };
      }

      // Authentication test (if token provided)
      if (authToken) {
        try {
          functionTests.authentication = await this.testFunctionWithAuth(functionName, environment, authToken);
          testSuite.summary.totalTests += 1;
          if (functionTests.authentication.success) {
            testSuite.summary.passedTests += 1;
          } else {
            testSuite.summary.failedTests += 1;
          }
        } catch (error) {
          this.log(`❌ Authentication test failed: ${error.message}`, 'error');
          functionTests.authentication = { error: error.message };
        }
      }

      // Load test (if enabled)
      if (includeLoadTest) {
        try {
          functionTests.loadTest = await this.runLoadTest(functionName, environment, { authToken });
          testSuite.summary.totalTests += 1;
          if (functionTests.loadTest.successRate > 95) {
            testSuite.summary.passedTests += 1;
          } else {
            testSuite.summary.failedTests += 1;
          }
        } catch (error) {
          this.log(`❌ Load test failed: ${error.message}`, 'error');
          functionTests.loadTest = { error: error.message };
        }
      }

      testSuite.functions[functionName] = functionTests;

      // Determine if function passed overall
      const connectivityPassed = functionTests.connectivity?.overallSuccess !== false;
      const authPassed = !authToken || functionTests.authentication?.success !== false;
      const loadPassed = !includeLoadTest || (functionTests.loadTest?.successRate || 0) > 95;

      if (connectivityPassed && authPassed && loadPassed) {
        testSuite.summary.passedFunctions += 1;
        this.log(`✅ Function ${functionName}: PASSED`, 'success');
      } else {
        testSuite.summary.failedFunctions += 1;
        this.log(`❌ Function ${functionName}: FAILED`, 'error');
      }
    }

    testSuite.endTime = new Date().toISOString();
    testSuite.duration = Date.now() - new Date(testSuite.startTime).getTime();

    // Generate summary
    this.log(`\n📊 Test Suite Summary:`, 'info');
    this.log(`   Functions: ${testSuite.summary.passedFunctions}/${testSuite.summary.totalFunctions} passed`, 
      testSuite.summary.failedFunctions === 0 ? 'success' : 'warning');
    this.log(`   Tests: ${testSuite.summary.passedTests}/${testSuite.summary.totalTests} passed`,
      testSuite.summary.failedTests === 0 ? 'success' : 'warning');
    this.log(`   Duration: ${(testSuite.duration / 1000).toFixed(1)}s`, 'info');

    // Save report
    if (saveReport) {
      this.saveTestReport(testSuite);
    }

    return testSuite;
  }

  saveTestReport(testSuite) {
    const reportsDir = 'test-reports';
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filename = `edge-functions-test-${testSuite.environment}-${Date.now()}.json`;
    const filepath = path.join(reportsDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(testSuite, null, 2));
    this.log(`📄 Test report saved: ${filepath}`, 'info');

    // Also save a summary report
    const summaryFilename = `test-summary-${testSuite.environment}-${Date.now()}.md`;
    const summaryFilepath = path.join(reportsDir, summaryFilename);
    
    const summaryContent = this.generateMarkdownReport(testSuite);
    fs.writeFileSync(summaryFilepath, summaryContent);
    this.log(`📄 Summary report saved: ${summaryFilepath}`, 'info');
  }

  generateMarkdownReport(testSuite) {
    const { summary, functions, environment, startTime, endTime, duration } = testSuite;
    
    let markdown = `# Edge Functions Test Report

**Environment:** ${environment}  
**Start Time:** ${startTime}  
**End Time:** ${endTime}  
**Duration:** ${(duration / 1000).toFixed(1)}s  

## Summary

- **Functions:** ${summary.passedFunctions}/${summary.totalFunctions} passed
- **Tests:** ${summary.passedTests}/${summary.totalTests} passed
- **Success Rate:** ${((summary.passedTests / summary.totalTests) * 100).toFixed(1)}%

## Function Results

`;

    for (const [functionName, tests] of Object.entries(functions)) {
      const connectivityPassed = tests.connectivity?.overallSuccess !== false;
      const authPassed = !tests.authentication || tests.authentication?.success !== false;
      const loadPassed = !tests.loadTest || (tests.loadTest?.successRate || 0) > 95;
      const overallPassed = connectivityPassed && authPassed && loadPassed;

      markdown += `### ${functionName} ${overallPassed ? '✅' : '❌'}

`;

      if (tests.connectivity) {
        markdown += `**Connectivity Tests:**
`;
        for (const test of tests.connectivity.tests || []) {
          markdown += `- ${test.name}: ${test.success ? '✅' : '❌'}`;
          if (test.responseTime) {
            markdown += ` (${test.responseTime}ms)`;
          }
          if (test.error) {
            markdown += ` - ${test.error}`;
          }
          markdown += `
`;
        }
      }

      if (tests.authentication) {
        markdown += `
**Authentication Test:** ${tests.authentication.success ? '✅' : '❌'}`;
        if (tests.authentication.error) {
          markdown += ` - ${tests.authentication.error}`;
        }
        markdown += `
`;
      }

      if (tests.loadTest) {
        markdown += `
**Load Test:** ${tests.loadTest.successRate > 95 ? '✅' : '❌'}
- Success Rate: ${tests.loadTest.successRate.toFixed(1)}%
- Average Response Time: ${tests.loadTest.avgResponseTime.toFixed(0)}ms
- Total Requests: ${tests.loadTest.totalRequests}
- Errors: ${tests.loadTest.errors.length}
`;
      }

      markdown += `
`;
    }

    return markdown;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const verifier = new EdgeFunctionVerifier();

  try {
    const command = args[0];
    const environment = args[1] || 'staging';

    switch (command) {
      case 'connectivity':
        const functionName = args[2];
        if (functionName) {
          const result = await verifier.testFunctionConnectivity(functionName, environment);
          console.log(JSON.stringify(result, null, 2));
        } else {
          for (const func of verifier.functions) {
            await verifier.testFunctionConnectivity(func, environment);
          }
        }
        break;

      case 'auth':
        const authToken = process.env.TEST_AUTH_TOKEN || args[3];
        if (!authToken) {
          throw new Error('Auth token required. Set TEST_AUTH_TOKEN or provide as argument.');
        }
        
        const authFunction = args[2];
        if (authFunction) {
          const result = await verifier.testFunctionWithAuth(authFunction, environment, authToken);
          console.log(JSON.stringify(result, null, 2));
        } else {
          for (const func of verifier.functions) {
            await verifier.testFunctionWithAuth(func, environment, authToken);
          }
        }
        break;

      case 'load':
        const loadFunction = args[2];
        const concurrency = parseInt(args[3]) || 5;
        const requests = parseInt(args[4]) || 20;
        const loadAuthToken = process.env.TEST_AUTH_TOKEN;

        if (!loadFunction) {
          throw new Error('Function name required for load test');
        }

        const loadResult = await verifier.runLoadTest(loadFunction, environment, {
          concurrency,
          requests,
          authToken: loadAuthToken
        });
        console.log(JSON.stringify(loadResult, null, 2));
        break;

      case 'comprehensive':
        const includeLoadTest = args.includes('--load-test');
        const compAuthToken = process.env.TEST_AUTH_TOKEN;
        
        const compResult = await verifier.runComprehensiveTest(environment, {
          includeLoadTest,
          authToken: compAuthToken
        });
        
        process.exit(compResult.summary.failedFunctions > 0 ? 1 : 0);
        break;

      default:
        console.log(`
Edge Functions Verification and Testing

Usage:
  node scripts/edge-functions-verification.js <command> [environment] [options]

Commands:
  connectivity [function]    Test basic connectivity for all or specific function
  auth [function] [token]    Test authentication for all or specific function
  load <function> [concurrency] [requests]  Run load test on specific function
  comprehensive             Run full test suite

Environments:
  staging                   Test staging environment
  production               Test production environment

Environment Variables:
  TEST_AUTH_TOKEN          Authentication token for testing

Options:
  --load-test              Include load testing in comprehensive test

Examples:
  node scripts/edge-functions-verification.js connectivity staging
  node scripts/edge-functions-verification.js auth staging coaching-insights
  node scripts/edge-functions-verification.js load staging process-workout 10 50
  node scripts/edge-functions-verification.js comprehensive production --load-test
        `);
        process.exit(1);
    }

  } catch (error) {
    console.error(`\n❌ Verification failed: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
module.exports = EdgeFunctionVerifier;

// Run CLI if script is executed directly
if (require.main === module) {
  main();
}