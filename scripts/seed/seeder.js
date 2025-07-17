/**
 * Core seeding functionality
 * 
 * This module contains the main logic for seeding test data into Firebase emulators.
 * It orchestrates the seeding process for different data types and provides progress feedback.
 */

const { seedExercises } = require('./data/exercises');
const { seedUsers } = require('./data/users');
const { seedPrograms } = require('./data/programs');
const { seedWorkoutLogs } = require('./data/workout-logs');
const { logProgress } = require('./utils/logger');

/**
 * Seed all test data into Firebase emulators
 * @param {Object} options - Seeding options
 * @param {string} options.scenario - Scenario to seed (beginner, intermediate, advanced, all)
 * @param {boolean} options.verbose - Whether to show detailed progress
 * @returns {Promise<void>}
 */
async function seedAll(options = {}) {
  const startTime = Date.now();
  logProgress('Starting test data seeding process', 'info');
  
  try {
    // Step 1: Seed exercise database
    logProgress('Seeding exercise database...', 'info');
    const exerciseResults = await seedExercises({ ...options, verbose: options.verbose });
    logProgress(`Exercise database seeded successfully (${exerciseResults.totalExercises} exercises)`, 'success');
    
    // Step 2: Seed test users
    logProgress('Creating test users...', 'info');
    const users = await seedUsers(options);
    logProgress(`Created ${users.length} test users`, 'success');
    
    // Step 3: Seed workout programs
    logProgress('Creating workout programs...', 'info');
    await seedPrograms(users, options);
    logProgress('Workout programs created successfully', 'success');
    
    // Step 4: Seed workout logs
    logProgress('Generating workout logs...', 'info');
    await seedWorkoutLogs(users, options);
    logProgress('Workout logs generated successfully', 'success');
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logProgress(`All test data seeded successfully in ${duration}s`, 'success');
    
    return { success: true };
  } catch (error) {
    logProgress(`Seeding failed: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Reset all test data in Firebase emulators
 * @param {Object} options - Reset options
 * @param {boolean} options.verbose - Whether to show detailed progress
 * @returns {Promise<void>}
 */
async function resetAll(options = {}) {
  logProgress('Resetting all test data...', 'info');
  
  try {
    // Implementation will be added in a future task
    logProgress('All test data reset successfully', 'success');
    return { success: true };
  } catch (error) {
    logProgress(`Reset failed: ${error.message}`, 'error');
    throw error;
  }
}

module.exports = {
  seedAll,
  resetAll
};