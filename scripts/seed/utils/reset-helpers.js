/**
 * Reset helper utilities
 * 
 * This module provides utilities for confirming and managing the reset process.
 */

const readline = require('readline');
const { logProgress } = require('./logger');

/**
 * Confirm reset operation with user
 * @param {Object} options - Reset options
 * @param {boolean} options.force - Skip confirmation if true
 * @param {boolean} options.verbose - Show detailed information
 * @returns {Promise<boolean>} Whether the user confirmed the reset
 */
async function confirmReset(options = {}) {
  // Skip confirmation if force flag is set
  if (options.force) {
    logProgress('Force flag detected, skipping confirmation', 'warning');
    return true;
  }

  console.log('\n⚠️  WARNING: This will permanently delete ALL test data from Firebase emulators!');
  console.log('\nThe following data will be cleared:');
  console.log('  • All test user accounts (Auth emulator)');
  console.log('  • All user profile documents');
  console.log('  • All workout programs');
  console.log('  • All workout logs');
  console.log('  • All exercise data');
  console.log('  • All exercise metadata');
  
  console.log('\n🔍 This operation will:');
  console.log('  • Return emulators to a clean state');
  console.log('  • Allow fresh seeding of test data');
  console.log('  • Not affect production data (emulators only)');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('\nDo you want to continue? (yes/no): ', (answer) => {
      rl.close();
      
      const confirmed = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
      
      if (confirmed) {
        logProgress('Reset confirmed by user', 'info');
      } else {
        logProgress('Reset cancelled by user', 'warning');
      }
      
      resolve(confirmed);
    });
  });
}

/**
 * Get collection statistics before reset
 * @param {Object} db - Firestore instance
 * @returns {Promise<Object>} Statistics about collections
 */
async function getResetStatistics(db) {
  const stats = {};
  
  try {
    // Count documents in each collection
    const collections = ['users', 'programs', 'workoutLogs', 'exercises', 'exercises_metadata'];
    
    for (const collectionName of collections) {
      try {
        const snapshot = await db.collection(collectionName).get();
        stats[collectionName] = snapshot.size;
      } catch (error) {
        // Collection might not exist, that's okay
        stats[collectionName] = 0;
      }
    }
    
    return stats;
  } catch (error) {
    logProgress(`Warning: Could not gather reset statistics: ${error.message}`, 'warning');
    // Return empty object when there's a general error
    return {};
  }
}

/**
 * Report reset completion with statistics
 * @param {Object} beforeStats - Statistics before reset
 * @param {Object} afterStats - Statistics after reset
 * @param {Object} options - Reset options
 */
function reportResetCompletion(beforeStats = {}, afterStats = {}, options = {}) {
  console.log('\n📊 Reset Summary:');
  console.log('================');
  
  const collections = ['users', 'programs', 'workoutLogs', 'exercises', 'exercises_metadata'];
  
  for (const collection of collections) {
    const before = beforeStats[collection] || 0;
    const after = afterStats[collection] || 0;
    const cleared = before - after;
    
    if (before > 0) {
      console.log(`  ${collection}: ${cleared} documents cleared (${before} → ${after})`);
    }
  }
  
  console.log('\n✅ Emulators are now in a clean state and ready for fresh seeding');
  console.log('💡 Run the seed command to populate with new test data');
}

module.exports = {
  confirmReset,
  getResetStatistics,
  reportResetCompletion
};