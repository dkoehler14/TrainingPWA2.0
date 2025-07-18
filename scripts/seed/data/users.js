/**
 * Test user creation module
 * 
 * This module handles creating test users in Firebase Auth emulator
 * and their corresponding profile documents in Firestore.
 */

const { getAuth, getFirestore } = require('../utils/firebase-config');
const { logProgress, logError } = require('../utils/logger');
const { getSeedingConfig, getScenarios, USER_SCENARIOS } = require('../config/scenarios');
const { UserValidator } = require('../utils/validation');
const { SeedingError, handleValidationErrors } = require('../utils/error-handling');

/**
 * Seed test users into Firebase Auth and Firestore emulators
 * @param {Object} options - Seeding options
 * @param {string|Array<string>} options.scenarios - Scenario selection (scenario ID, group name, or array)
 * @param {boolean} options.verbose - Whether to show detailed progress
 * @returns {Promise<Array>} - Array of created user objects
 */
async function seedUsers(options = {}) {
  const { scenarios = 'basic', verbose = false } = options;
  const auth = getAuth();
  const db = getFirestore();
  const createdUsers = [];
  const validator = new UserValidator();

  try {
    // Get seeding configuration based on scenario selection
    const seedingConfig = getSeedingConfig(scenarios, { verbose });
    const scenarioConfigs = seedingConfig.scenarioConfigs;

    if (verbose) {
      logProgress(`Creating ${scenarioConfigs.length} test user(s) for scenarios: ${seedingConfig.scenarios.join(', ')}`, 'info');
      logProgress(`Scenario details:`, 'info');
      scenarioConfigs.forEach(config => {
        console.log(`  - ${config.name}: ${config.description}`);
      });
    }

    // Validate all scenario configurations before creating users
    for (const scenarioConfig of scenarioConfigs) {
      if (!validator.validateUserScenario(scenarioConfig)) {
        const validationError = handleValidationErrors(validator.getErrors(), `user scenario ${scenarioConfig.id}`);
        throw validationError;
      }
      validator.clearErrors();
    }

    // Create each user scenario
    for (const scenarioConfig of scenarioConfigs) {
      try {
        if (verbose) {
          logProgress(`Creating ${scenarioConfig.id} user: ${scenarioConfig.email}`, 'info');
        }

        // Create user in Firebase Auth emulator with validation
        const userRecord = await createAuthUser(auth, scenarioConfig);
        
        // Create user profile document in Firestore with scenario-specific data patterns
        await createUserProfile(db, userRecord.uid, scenarioConfig.profile, scenarioConfig.dataPatterns);
        
        const createdUser = {
          uid: userRecord.uid,
          email: scenarioConfig.email,
          scenario: scenarioConfig.id,
          scenarioName: scenarioConfig.name,
          profile: scenarioConfig.profile,
          dataPatterns: scenarioConfig.dataPatterns
        };
        
        // Validate created user object
        if (!validator.validateCreatedUser(createdUser)) {
          const validationError = handleValidationErrors(validator.getErrors(), `created user ${scenarioConfig.id}`);
          throw validationError;
        }
        
        createdUsers.push(createdUser);
        
        if (verbose) {
          logProgress(`✅ Created ${scenarioConfig.name} user successfully (UID: ${userRecord.uid})`, 'success');
        }
        
      } catch (error) {
        const seedingError = new SeedingError(
          `Failed to create ${scenarioConfig.name} user: ${error.message}`,
          'createUser',
          { scenarioId: scenarioConfig.id, email: scenarioConfig.email },
          error
        );
        
        logError(seedingError, 'User Creation', verbose);
        throw seedingError;
      }
    }

    // Final validation of all created users
    if (createdUsers.length === 0) {
      throw new SeedingError('No users were created', 'seedUsers', { scenarios });
    }

    logProgress(`Successfully created ${createdUsers.length} test users`, 'success');
    
    if (verbose) {
      logProgress('Test user credentials:', 'info');
      createdUsers.forEach(user => {
        console.log(`  📧 ${user.email} (${user.scenarioName}) - Password: test123`);
      });
    }

    return createdUsers;
    
  } catch (error) {
    if (error instanceof SeedingError) {
      throw error;
    }
    
    const seedingError = new SeedingError(
      `User seeding failed: ${error.message}`,
      'seedUsers',
      { scenarios, createdCount: createdUsers.length },
      error
    );
    
    logError(seedingError, 'User Seeding', verbose);
    throw seedingError;
  }
}

/**
 * Create a user in Firebase Auth emulator
 * @param {Object} auth - Firebase Auth instance
 * @param {Object} userScenario - User scenario configuration
 * @returns {Promise<Object>} - Created user record
 */
async function createAuthUser(auth, userScenario) {
  try {
    // Check if user already exists
    try {
      const existingUser = await auth.getUserByEmail(userScenario.email);
      // If user exists, delete it first to ensure clean state
      await auth.deleteUser(existingUser.uid);
    } catch (error) {
      // User doesn't exist, which is expected for clean seeding
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Create new user
    const userRecord = await auth.createUser({
      email: userScenario.email,
      password: userScenario.password,
      displayName: userScenario.profile.name,
      emailVerified: true, // Mark as verified for testing
    });

    return userRecord;
  } catch (error) {
    throw new Error(`Failed to create Auth user: ${error.message}`);
  }
}

/**
 * Create user profile document in Firestore
 * @param {Object} db - Firestore instance
 * @param {string} uid - User UID
 * @param {Object} profile - User profile data
 * @param {Object} dataPatterns - Scenario-specific data patterns
 * @returns {Promise<void>}
 */
async function createUserProfile(db, uid, profile, dataPatterns = {}) {
  try {
    const userDocument = {
      email: profile.email || `user-${uid}@test.com`,
      name: profile.name,
      createdAt: new Date(),
      experienceLevel: profile.experienceLevel,
      goals: profile.goals,
      preferredUnits: profile.preferredUnits,
      age: profile.age,
      weight: profile.weight,
      height: profile.height,
      fitnessBackground: profile.fitnessBackground,
      workoutFrequency: profile.workoutFrequency,
      availableEquipment: profile.availableEquipment,
      injuries: profile.injuries,
      preferences: profile.preferences,
      // Additional fields for app functionality
      isActive: true,
      lastLoginAt: new Date(),
      profileCompletedAt: new Date(),
      settings: {
        notifications: true,
        publicProfile: false,
        shareProgress: false
      },
      // Scenario-specific data patterns for seeding
      testDataPatterns: dataPatterns
    };

    await db.collection('users').doc(uid).set(userDocument);
  } catch (error) {
    throw new Error(`Failed to create user profile: ${error.message}`);
  }
}

/**
 * Get user scenarios configuration
 * @returns {Object} User scenarios object
 */
function getUserScenarios() {
  return USER_SCENARIOS;
}

/**
 * Validate user scenario exists
 * @param {string} scenario - Scenario name to validate
 * @returns {boolean} Whether scenario exists
 */
function isValidScenario(scenario) {
  return scenario === 'all' || Object.keys(USER_SCENARIOS).includes(scenario);
}

/**
 * Reset all test users (Auth and Firestore)
 * @param {Object} options - Reset options
 * @returns {Promise<number>} Number of users cleared
 */
async function resetUsers(options = {}) {
  const auth = getAuth();
  const db = getFirestore();
  
  try {
    let totalCleared = 0;
    
    // Get all users from Firestore first (to count them)
    const usersSnapshot = await db.collection('users').get();
    const firestoreUserCount = usersSnapshot.size;
    
    // Clear Firestore user documents
    if (firestoreUserCount > 0) {
      const batch = db.batch();
      usersSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      totalCleared += firestoreUserCount;
      
      if (options.verbose) {
        logProgress(`Cleared ${firestoreUserCount} user documents from Firestore`, 'info');
      }
    }
    
    // Clear Auth users
    try {
      // List all users in Auth emulator
      const listUsersResult = await auth.listUsers();
      const authUserCount = listUsersResult.users.length;
      
      if (authUserCount > 0) {
        // Delete users in batches (Auth has limits)
        const deletePromises = listUsersResult.users.map(user => 
          auth.deleteUser(user.uid)
        );
        
        await Promise.all(deletePromises);
        
        if (options.verbose) {
          logProgress(`Cleared ${authUserCount} users from Auth emulator`, 'info');
        }
      }
    } catch (authError) {
      // Auth errors are not critical for reset, just log them
      if (options.verbose) {
        logProgress(`Warning: Could not clear Auth users: ${authError.message}`, 'warning');
      }
    }
    
    if (totalCleared === 0 && options.verbose) {
      logProgress('No user data found to clear', 'info');
    }
    
    return totalCleared;
  } catch (error) {
    throw new Error(`Failed to reset users: ${error.message}`);
  }
}

module.exports = {
  seedUsers,
  getUserScenarios,
  isValidScenario,
  resetUsers,
  USER_SCENARIOS
};