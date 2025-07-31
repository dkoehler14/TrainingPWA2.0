import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { 
  getFirebaseConfig, 
  validateEnvironmentConfig, 
  shouldUseEmulators,
  getEnvironmentInfo 
} from "./config/environment";
import {
  reportDevelopmentError,
  ERROR_TYPES,
  updateServiceStatus,
  handleSupabaseFallback,
  initializeDevelopmentErrorHandling,
  attemptServiceRecovery,
  handleServiceInitializationFallback
} from "./utils/developmentErrorHandler";
import {
  initializeDevelopmentDebugging,
  serviceStatusLogger,
  developmentLogger
} from "./utils/developmentDebugger";

// Initialize development debugging and error handling systems
if (process.env.NODE_ENV === 'development') {
  initializeDevelopmentErrorHandling();
  initializeDevelopmentDebugging();
  developmentLogger.info('🚀 Starting Firebase initialization with enhanced debugging');
}

// Validate environment configuration with enhanced error handling
try {
  validateEnvironmentConfig();
} catch (configError) {
  reportDevelopmentError(configError, ERROR_TYPES.CONFIGURATION);
  throw configError;
}

// Get appropriate Firebase configuration based on environment
const firebaseConfig = getFirebaseConfig();

// Log environment information in development
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 Environment Info:', getEnvironmentInfo());
}

let app;
let db;
let auth;
let functions;

// Track emulator connection status to avoid duplicate connections
let emulatorsConnected = false;

// Enhanced Firebase initialization with error handling
try {
  app = initializeApp(firebaseConfig);
  
  // Initialize Firebase services with enhanced debugging and error handling
  try {
    serviceStatusLogger.logServiceInitialization('firestore', {
      emulatorMode: shouldUseEmulators()
    });
    db = getFirestore(app);
    serviceStatusLogger.logServiceSuccess('firestore', { initialized: true });
    updateServiceStatus('firestore', true);
  } catch (firestoreError) {
    serviceStatusLogger.logServiceFailure('firestore', firestoreError);
    reportDevelopmentError(firestoreError, ERROR_TYPES.FIREBASE_INIT, 'firestore');
    const fallback = handleServiceInitializationFallback('firestore', firestoreError);
    if (!fallback.canContinue) {
      throw firestoreError;
    }
    db = fallback.fallbackService;
  }

  try {
    serviceStatusLogger.logServiceInitialization('auth', {
      emulatorMode: shouldUseEmulators()
    });
    auth = getAuth(app);
    serviceStatusLogger.logServiceSuccess('auth', { initialized: true });
    updateServiceStatus('auth', true);
  } catch (authError) {
    serviceStatusLogger.logServiceFailure('auth', authError);
    reportDevelopmentError(authError, ERROR_TYPES.FIREBASE_INIT, 'auth');
    const fallback = handleServiceInitializationFallback('auth', authError);
    if (!fallback.canContinue) {
      throw authError;
    }
    auth = fallback.fallbackService;
  }

  try {
    serviceStatusLogger.logServiceInitialization('functions', {
      emulatorMode: shouldUseEmulators()
    });
    functions = getFunctions(app);
    serviceStatusLogger.logServiceSuccess('functions', { initialized: true });
    updateServiceStatus('functions', true);
  } catch (functionsError) {
    serviceStatusLogger.logServiceFailure('functions', functionsError);
    reportDevelopmentError(functionsError, ERROR_TYPES.FIREBASE_INIT, 'functions');
    const fallback = handleServiceInitializationFallback('functions', functionsError);
    if (!fallback.canContinue) {
      throw functionsError;
    }
    functions = fallback.fallbackService;
  }

  console.log('✅ Firebase services initialized successfully');

  // Connect to emulators if in development mode with enhanced error handling
  if (shouldUseEmulators() && !emulatorsConnected) {
    console.log('🔧 Connecting to Firebase emulators...');
    
    // Enhanced emulator connection with individual service error handling
    connectToEmulatorsWithErrorHandling().catch(error => {
      reportDevelopmentError(error, ERROR_TYPES.EMULATOR_CONNECTION, null, {
        phase: 'initialization'
      });
    });
  }
  
} catch (error) {
  reportDevelopmentError(error, ERROR_TYPES.FIREBASE_INIT, null, {
    firebaseConfig: firebaseConfig ? 'present' : 'missing',
    nodeEnv: process.env.NODE_ENV
  });
  
  console.error('❌ Critical Firebase initialization error:', error.message);
  throw new Error(`Failed to initialize Firebase: ${error.message}`);
}

/**
 * Enhanced emulator connection with individual service error handling
 */
async function connectToEmulatorsWithErrorHandling() {
  const services = [
    {
      name: 'firestore',
      connect: () => connectFirestoreEmulator(db, 'localhost', 8080),
      port: 8080
    },
    {
      name: 'auth',
      connect: () => connectAuthEmulator(auth, 'http://localhost:9099'),
      port: 9099
    },
    {
      name: 'functions',
      connect: () => connectFunctionsEmulator(functions, 'localhost', 5001),
      port: 5001
    }
  ];

  let connectedServices = 0;
  const failedServices = [];

  for (const service of services) {
    try {
      // Log emulator connection attempt with enhanced debugging
      serviceStatusLogger.logEmulatorConnection(service.name, 'localhost', service.port);
      
      // Check if emulator is available before attempting connection
      const isAvailable = await attemptServiceRecovery(service.name);
      
      if (!isAvailable) {
        const fallback = handleSupabaseFallback(service.name, new Error(`${service.name} emulator not available`));
        serviceStatusLogger.logEmulatorFailure(service.name, 'localhost', service.port, 
          new Error(`Port ${service.port} not available`));
        failedServices.push({ service: service.name, fallback });
        updateServiceStatus(service.name, false, new Error(`Port ${service.port} not available`));
        continue;
      }

      // Attempt to connect to the emulator
      service.connect();
      serviceStatusLogger.logEmulatorSuccess(service.name, 'localhost', service.port);
      updateServiceStatus(service.name, true);
      connectedServices++;
      
    } catch (emulatorError) {
      serviceStatusLogger.logEmulatorFailure(service.name, 'localhost', service.port, emulatorError);
      reportDevelopmentError(
        emulatorError, 
        ERROR_TYPES.EMULATOR_CONNECTION, 
        service.name,
        { 
          port: service.port,
          host: 'localhost',
          attemptedConnection: true
        }
      );
      
      const fallback = handleSupabaseFallback(service.name, emulatorError);
      failedServices.push({ service: service.name, fallback, error: emulatorError });
      updateServiceStatus(service.name, false, emulatorError);
    }
  }

  // Report overall connection status
  if (connectedServices === services.length) {
    emulatorsConnected = true;
    console.log('🎉 All Firebase emulators connected successfully!');
  } else if (connectedServices > 0) {
    console.warn(`⚠️  Partial emulator connection: ${connectedServices}/${services.length} services connected`);
    console.warn('Some features may not work correctly until all emulators are running');
    
    // Provide recovery suggestions
    if (failedServices.length > 0) {
      console.group('🔧 Failed Services Recovery:');
      failedServices.forEach(({ service, fallback, error }) => {
        console.warn(`${service}: ${fallback.message}`);
        console.warn(`Action: ${fallback.action}`);
      });
      console.groupEnd();
    }
  } else {
    console.error('❌ No emulators could be connected');
    console.error('🔧 Make sure Firebase emulators are running: firebase emulators:start');
    
    // In development, we can continue without emulators but warn the user
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  Continuing without emulators - some features will not work');
      console.warn('💡 Start emulators and refresh the page to enable full functionality');
    }
  }
}

export { db, auth, functions };
