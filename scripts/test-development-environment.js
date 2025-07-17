#!/usr/bin/env node

/**
 * Development Environment Test Runner
 * 
 * This script runs comprehensive tests to validate the local development environment
 * including emulator connectivity, hot-reloading, and service integration.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Test configuration
const testConfig = {
  testFiles: [
    'src/utils/__tests__/developmentEnvironment.test.js',
    'src/utils/__tests__/hotReloading.test.js',
    'src/utils/__tests__/serviceIntegration.test.js'
  ],
  emulatorPorts: {
    firestore: 8080,
    auth: 9099,
    functions: 5001,
    ui: 4000
  },
  timeout: 30000 // 30 seconds
};

class DevelopmentEnvironmentTester {
  constructor() {
    this.results = {
      emulatorConnectivity: false,
      hotReloading: false,
      serviceIntegration: false,
      environmentSwitching: false
    };
    this.startTime = Date.now();
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  logSection(title) {
    this.log(`\n${'='.repeat(60)}`, 'cyan');
    this.log(`${title}`, 'bright');
    this.log(`${'='.repeat(60)}`, 'cyan');
  }

  logSuccess(message) {
    this.log(`✅ ${message}`, 'green');
  }

  logError(message) {
    this.log(`❌ ${message}`, 'red');
  }

  logWarning(message) {
    this.log(`⚠️  ${message}`, 'yellow');
  }

  logInfo(message) {
    this.log(`ℹ️  ${message}`, 'blue');
  }

  async checkEmulatorAvailability() {
    this.logSection('CHECKING EMULATOR AVAILABILITY');
    
    const emulatorChecks = Object.entries(testConfig.emulatorPorts).map(
      async ([service, port]) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(`http://localhost:${port}`, {
            method: 'GET',
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok || response.status < 500) {
            this.logSuccess(`${service} emulator is running on port ${port}`);
            return { service, available: true, port };
          } else {
            this.logWarning(`${service} emulator responded with status ${response.status}`);
            return { service, available: false, port, status: response.status };
          }
        } catch (error) {
          if (error.name === 'AbortError') {
            this.logError(`${service} emulator connection timeout on port ${port}`);
          } else {
            this.logError(`${service} emulator not available on port ${port}: ${error.message}`);
          }
          return { service, available: false, port, error: error.message };
        }
      }
    );

    const results = await Promise.all(emulatorChecks);
    const availableServices = results.filter(r => r.available);
    
    this.results.emulatorConnectivity = availableServices.length === results.length;
    
    if (this.results.emulatorConnectivity) {
      this.logSuccess(`All ${results.length} emulators are running`);
    } else {
      this.logWarning(`${availableServices.length}/${results.length} emulators are running`);
      this.logInfo('Run "firebase emulators:start" to start missing emulators');
    }

    return results;
  }

  async runTests() {
    this.logSection('RUNNING DEVELOPMENT ENVIRONMENT TESTS');
    
    return new Promise((resolve, reject) => {
      const testProcess = spawn('npm', ['test', '--', '--watchAll=false', '--verbose'], {
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          REACT_APP_USE_EMULATORS: 'true',
          CI: 'true'
        }
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);
      });

      testProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        process.stderr.write(text);
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          this.logSuccess('All tests passed');
          this.results.hotReloading = true;
          this.results.serviceIntegration = true;
          this.results.environmentSwitching = true;
          resolve({ success: true, output, errorOutput });
        } else {
          this.logError(`Tests failed with exit code ${code}`);
          resolve({ success: false, output, errorOutput, exitCode: code });
        }
      });

      testProcess.on('error', (error) => {
        this.logError(`Failed to run tests: ${error.message}`);
        reject(error);
      });

      // Set timeout
      setTimeout(() => {
        testProcess.kill();
        this.logError('Tests timed out');
        reject(new Error('Test timeout'));
      }, testConfig.timeout);
    });
  }

  async validateEnvironmentSwitching() {
    this.logSection('VALIDATING ENVIRONMENT SWITCHING');
    
    try {
      // Test development environment
      process.env.NODE_ENV = 'development';
      process.env.REACT_APP_USE_EMULATORS = 'true';
      
      const { getFirebaseConfig, shouldUseEmulators } = require('../src/config/environment');
      
      const devConfig = getFirebaseConfig();
      const shouldUseEmulatorsResult = shouldUseEmulators();
      
      if (shouldUseEmulatorsResult && devConfig.apiKey === 'demo-key') {
        this.logSuccess('Development environment configuration is correct');
      } else {
        this.logError('Development environment configuration is incorrect');
        return false;
      }

      // Test production environment
      process.env.NODE_ENV = 'production';
      process.env.REACT_APP_USE_EMULATORS = 'false';
      process.env.REACT_APP_FIREBASE_API_KEY = 'test-api-key';
      process.env.REACT_APP_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
      process.env.REACT_APP_FIREBASE_PROJECT_ID = 'test-project';
      process.env.REACT_APP_FIREBASE_STORAGE_BUCKET = 'test.appspot.com';
      process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID = '123456789';
      process.env.REACT_APP_FIREBASE_APP_ID = 'test-app-id';

      // Clear require cache to get fresh config
      delete require.cache[require.resolve('../src/config/environment')];
      const { getFirebaseConfig: getProdConfig, shouldUseEmulators: shouldUseProdEmulators } = require('../src/config/environment');
      
      const prodConfig = getProdConfig();
      const shouldUseProdEmulatorsResult = shouldUseProdEmulators();
      
      if (!shouldUseProdEmulatorsResult && prodConfig.apiKey === 'test-api-key') {
        this.logSuccess('Production environment configuration is correct');
        this.results.environmentSwitching = true;
        return true;
      } else {
        this.logError('Production environment configuration is incorrect');
        return false;
      }
    } catch (error) {
      this.logError(`Environment switching validation failed: ${error.message}`);
      return false;
    }
  }

  async validateHotReloading() {
    this.logSection('VALIDATING HOT RELOADING SETUP');
    
    try {
      // Check if webpack dev server is configured for hot reloading
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      
      if (packageJson.scripts && packageJson.scripts['dev:react']) {
        this.logSuccess('React development script is configured');
      } else {
        this.logError('React development script is missing');
        return false;
      }

      // Check if source maps are enabled
      if (process.env.GENERATE_SOURCEMAP === 'true') {
        this.logSuccess('Source maps are enabled for debugging');
      } else {
        this.logWarning('Source maps are not explicitly enabled');
      }

      // Check if Fast Refresh is enabled (default in React Scripts)
      if (process.env.FAST_REFRESH !== 'false') {
        this.logSuccess('Fast Refresh is enabled');
      } else {
        this.logWarning('Fast Refresh is disabled');
      }

      this.results.hotReloading = true;
      return true;
    } catch (error) {
      this.logError(`Hot reloading validation failed: ${error.message}`);
      return false;
    }
  }

  generateReport() {
    this.logSection('TEST RESULTS SUMMARY');
    
    const duration = Date.now() - this.startTime;
    const passed = Object.values(this.results).filter(Boolean).length;
    const total = Object.keys(this.results).length;
    
    this.logInfo(`Test Duration: ${duration}ms`);
    this.logInfo(`Tests Passed: ${passed}/${total}`);
    
    Object.entries(this.results).forEach(([test, passed]) => {
      if (passed) {
        this.logSuccess(`${test}: PASSED`);
      } else {
        this.logError(`${test}: FAILED`);
      }
    });

    if (passed === total) {
      this.logSuccess('\n🎉 All development environment tests passed!');
      this.logInfo('Your local development environment is ready to use.');
      return true;
    } else {
      this.logError('\n❌ Some development environment tests failed.');
      this.logInfo('Please check the errors above and fix the issues.');
      return false;
    }
  }

  async run() {
    try {
      this.log('🚀 Starting Development Environment Validation', 'bright');
      
      // Check emulator availability
      await this.checkEmulatorAvailability();
      
      // Validate hot reloading setup
      await this.validateHotReloading();
      
      // Validate environment switching
      await this.validateEnvironmentSwitching();
      
      // Run comprehensive tests
      const testResults = await this.runTests();
      
      // Generate final report
      const allPassed = this.generateReport();
      
      process.exit(allPassed ? 0 : 1);
      
    } catch (error) {
      this.logError(`Test runner failed: ${error.message}`);
      console.error(error);
      process.exit(1);
    }
  }
}

// Run the tests if this script is executed directly
if (require.main === module) {
  const tester = new DevelopmentEnvironmentTester();
  tester.run();
}

module.exports = DevelopmentEnvironmentTester;