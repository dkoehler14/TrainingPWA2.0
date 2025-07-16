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
  handleEmulatorFallback,
  initializeDevelopmentErrorHandling,
  attemptServiceRecovery
} from "./utils/developmentErrorHandler";

// Initialize development error handling system
if (process.env.NODE_ENV === 'development') {
  initializeDevelopmentErrorHandling();
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
  db = getFirestore(app);
  auth = getAuth(app);
  functions = getFunctions(app);

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
      // Check if emulator is available before attempting connection
      const isAvailable = await attemptServiceRecovery(service.name);
      
      if (!isAvailable) {
        const fallback = handleEmulatorFallback(service.name, new Error(`${service.name} emulator not available`));
        failedServices.push({ service: service.name, fallback });
        updateServiceStatus(service.name, false, new Error(`Port ${service.port} not available`));
        continue;
      }

      // Attempt to connect to the emulator
      service.connect();
      console.log(`✅ Connected to ${service.name} emulator on localhost:${service.port}`);
      updateServiceStatus(service.name, true);
      connectedServices++;
      
    } catch (emulatorError) {
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
      
      const fallback = handleEmulatorFallback(service.name, emulatorError);
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
