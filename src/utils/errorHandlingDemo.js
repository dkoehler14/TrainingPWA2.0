/**
 * Development Error Handling Demonstration
 * 
 * This file demonstrates the enhanced error handling capabilities
 * for the local development environment.
 */

import {
  reportDevelopmentError,
  ERROR_TYPES,
  performFirebaseHealthCheck,
  handleServiceInitializationFallback,
  retryEmulatorConnection,
  checkEmulatorAvailability
} from './developmentErrorHandler';

/**
 * Demonstrate error reporting functionality
 */
export const demonstrateErrorReporting = () => {
  console.log('🎭 Demonstrating enhanced error reporting...');
  
  // Simulate different types of errors
  const errors = [
    {
      error: new Error('Firestore emulator connection failed'),
      type: ERROR_TYPES.EMULATOR_CONNECTION,
      service: 'firestore',
      context: { port: 8080, host: 'localhost' }
    },
    {
      error: new Error('Invalid Firebase configuration'),
      type: ERROR_TYPES.CONFIGURATION,
      service: null,
      context: { configFile: '.env.development' }
    },
    {
      error: new Error('Network timeout during service startup'),
      type: ERROR_TYPES.NETWORK,
      service: 'auth',
      context: { timeout: 5000 }
    }
  ];

  errors.forEach(({ error, type, service, context }) => {
    reportDevelopmentError(error, type, service, context);
  });
};

/**
 * Demonstrate service initialization fallback
 */
export const demonstrateServiceFallback = () => {
  console.log('🎭 Demonstrating service initialization fallback...');
  
  const services = ['firestore', 'auth', 'functions'];
  
  services.forEach(service => {
    const error = new Error(`${service} initialization failed`);
    const fallback = handleServiceInitializationFallback(service, error);
    
    console.log(`${service} fallback:`, {
      canContinue: fallback.canContinue,
      criticalityLevel: fallback.criticalityLevel,
      hasFallbackService: !!fallback.fallbackService
    });
  });
};

/**
 * Demonstrate health check functionality
 */
export const demonstrateHealthCheck = async () => {
  console.log('🎭 Demonstrating Firebase health check...');
  
  try {
    const healthResults = await performFirebaseHealthCheck();
    console.log('Health check results:', {
      healthy: healthResults.healthy,
      servicesCount: Object.keys(healthResults.services).length,
      recommendationsCount: healthResults.recommendations.length
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
};

/**
 * Demonstrate emulator availability checking
 */
export const demonstrateEmulatorCheck = async () => {
  console.log('🎭 Demonstrating emulator availability check...');
  
  const emulatorPorts = [8080, 9099, 5001];
  
  for (const port of emulatorPorts) {
    const isAvailable = await checkEmulatorAvailability('localhost', port);
    console.log(`Port ${port}: ${isAvailable ? '✅ Available' : '❌ Not available'}`);
  }
};

/**
 * Demonstrate retry mechanism
 */
export const demonstrateRetryMechanism = async () => {
  console.log('🎭 Demonstrating retry mechanism...');
  
  try {
    const success = await retryEmulatorConnection('firestore', 2, 1000);
    console.log(`Retry result: ${success ? '✅ Success' : '❌ Failed'}`);
  } catch (error) {
    console.error('Retry demonstration failed:', error.message);
  }
};

/**
 * Run all demonstrations
 */
export const runAllDemonstrations = async () => {
  if (process.env.NODE_ENV !== 'development') {
    console.log('Demonstrations only run in development mode');
    return;
  }

  console.log('🚀 Starting Enhanced Error Handling Demonstrations...\n');
  
  demonstrateErrorReporting();
  console.log('\n');
  
  demonstrateServiceFallback();
  console.log('\n');
  
  await demonstrateHealthCheck();
  console.log('\n');
  
  await demonstrateEmulatorCheck();
  console.log('\n');
  
  await demonstrateRetryMechanism();
  
  console.log('\n✅ All demonstrations completed!');
};

// Auto-run demonstrations if this file is imported in development
if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_DEMO_ERROR_HANDLING === 'true') {
  runAllDemonstrations();
}