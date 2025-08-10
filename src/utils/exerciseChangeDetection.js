/**
 * Exercise Change Detection Algorithm
 * 
 * Provides intelligent comparison and change detection for workout exercises
 * to enable efficient upsert operations instead of delete-and-recreate.
 */

/**
 * @typedef {Object} ExerciseChanges
 * @property {ExerciseData[]} toInsert - Exercises to be inserted
 * @property {ExerciseData[]} toUpdate - Exercises to be updated
 * @property {string[]} toDelete - Exercise IDs to be deleted
 * @property {boolean} orderChanged - Whether exercise order has changed
 * @property {Object} metadata - Change detection metadata
 * @property {number} metadata.totalChanges - Total number of changes detected
 * @property {string} metadata.changeTypes - Types of changes detected
 * @property {string} metadata.timestamp - When changes were detected
 */

/**
 * @typedef {Object} ExerciseComparisonResult
 * @property {boolean} hasChanges - Whether any changes were detected
 * @property {ExerciseChanges} changes - Detailed change information
 * @property {Object} summary - Summary of changes
 * @property {number} summary.inserted - Number of exercises to insert
 * @property {number} summary.updated - Number of exercises to update
 * @property {number} summary.deleted - Number of exercises to delete
 * @property {boolean} summary.orderChanged - Whether order changed
 */

/**
 * Exercise Change Detection Class
 * Handles comparison and change classification for workout exercises
 */
export class ExerciseChangeDetector {
  constructor(options = {}) {
    this.options = {
      // Whether to consider order changes as significant
      trackOrderChanges: true,
      // Whether to deep compare exercise data
      deepCompare: true,
      // Whether to log change detection operations
      logOperations: false,
      // Tolerance for floating point comparisons
      floatTolerance: 0.001,
      ...options
    };
  }

  /**
   * Compare existing and updated exercises to detect changes
   * @param {ExerciseData[]} existingExercises - Current exercises from database
   * @param {ExerciseData[]} updatedExercises - New exercises from user input
   * @returns {ExerciseComparisonResult} Comparison result with changes
   */
  compareExercises(existingExercises = [], updatedExercises = []) {
    const startTime = Date.now();
    
    if (this.options.logOperations) {
      console.log('🔍 EXERCISE CHANGE DETECTION START:', {
        existingCount: existingExercises.length,
        updatedCount: updatedExercises.length,
        options: this.options
      });
    }

    try {
      // Normalize inputs
      const existing = this._normalizeExercises(existingExercises);
      const updated = this._normalizeExercises(updatedExercises);

      // Create lookup maps for efficient comparison
      const existingMap = this._createExerciseMap(existing);
      const updatedMap = this._createExerciseMap(updated);

      // Detect changes
      const changes = this._detectChanges(existing, updated, existingMap, updatedMap);
      
      // Calculate summary
      const summary = this._calculateSummary(changes);
      
      // Check if any changes exist
      const hasChanges = summary.inserted > 0 || summary.updated > 0 || 
                        summary.deleted > 0 || summary.orderChanged;

      const result = {
        hasChanges,
        changes,
        summary,
        metadata: {
          detectionTime: Date.now() - startTime,
          existingCount: existing.length,
          updatedCount: updated.length,
          timestamp: new Date().toISOString()
        }
      };

      if (this.options.logOperations) {
        console.log('✅ EXERCISE CHANGE DETECTION COMPLETE:', {
          hasChanges,
          summary,
          detectionTime: result.metadata.detectionTime,
          changeTypes: changes.metadata.changeTypes
        });
      }

      return result;
    } catch (error) {
      console.error('❌ EXERCISE CHANGE DETECTION ERROR:', {
        error: error.message,
        existingCount: existingExercises.length,
        updatedCount: updatedExercises.length,
        stack: error.stack
      });
      
      throw new Error(`Exercise change detection failed: ${error.message}`);
    }
  }

  /**
   * Normalize exercise data for consistent comparison
   * @param {ExerciseData[]} exercises - Raw exercise data
   * @returns {ExerciseData[]} Normalized exercise data
   * @private
   */
  _normalizeExercises(exercises) {
    if (!Array.isArray(exercises)) {
      console.warn('⚠️ Invalid exercises input, expected array:', typeof exercises);
      return [];
    }

    return exercises.map((exercise, index) => {
      // Ensure required fields exist
      const normalized = {
        // Database ID (null for new exercises)
        id: exercise.id || null,
        
        // Required fields
        exerciseId: exercise.exerciseId || exercise.exercise_id,
        sets: Number(exercise.sets) || 1,
        
        // Arrays (ensure they exist and are properly sized)
        reps: this._normalizeArray(exercise.reps, exercise.sets || 1),
        weights: this._normalizeArray(exercise.weights, exercise.sets || 1),
        completed: this._normalizeArray(exercise.completed, exercise.sets || 1, false),
        
        // Optional fields
        orderIndex: exercise.orderIndex !== undefined ? exercise.orderIndex : index,
        notes: exercise.notes || '',
        bodyweight: exercise.bodyweight ? Number(exercise.bodyweight) : null,
        
        // Change tracking fields
        isModified: exercise.isModified || false,
        isNew: exercise.isNew || false,
        isDeleted: exercise.isDeleted || false,
        
        // Additional metadata
        isAdded: exercise.isAdded || false,
        addedType: exercise.addedType || null,
        originalIndex: exercise.originalIndex !== undefined ? exercise.originalIndex : -1
      };

      // Validate required fields
      if (!normalized.exerciseId) {
        throw new Error(`Exercise at index ${index} missing exerciseId`);
      }

      const originalSets = exercise.sets;
      if (originalSets !== undefined && (isNaN(Number(originalSets)) || Number(originalSets) <= 0)) {
        throw new Error(`Exercise at index ${index} has invalid sets: ${originalSets}`);
      }

      return normalized;
    });
  }

  /**
   * Normalize array to match expected length
   * @param {Array} array - Input array
   * @param {number} expectedLength - Expected array length
   * @param {*} defaultValue - Default value for missing elements
   * @returns {Array} Normalized array
   * @private
   */
  _normalizeArray(array, expectedLength, defaultValue = null) {
    if (!Array.isArray(array)) {
      return new Array(expectedLength).fill(defaultValue);
    }

    const normalized = [...array];
    
    // Pad with default values if too short
    while (normalized.length < expectedLength) {
      normalized.push(defaultValue);
    }
    
    // Trim if too long
    if (normalized.length > expectedLength) {
      normalized.length = expectedLength;
    }
    
    return normalized;
  }

  /**
   * Create lookup map for exercises
   * @param {ExerciseData[]} exercises - Exercise array
   * @returns {Map} Exercise lookup map
   * @private
   */
  _createExerciseMap(exercises) {
    const map = new Map();
    
    exercises.forEach((exercise, index) => {
      // Use database ID as primary key if available
      if (exercise.id) {
        map.set(exercise.id, { exercise, index, keyType: 'id' });
      }
      
      // Also create composite key for exercises without ID
      const compositeKey = `${exercise.exerciseId}_${exercise.orderIndex}`;
      if (!map.has(compositeKey)) {
        map.set(compositeKey, { exercise, index, keyType: 'composite' });
      }
    });
    
    return map;
  }

  /**
   * Detect changes between existing and updated exercises
   * @param {ExerciseData[]} existing - Existing exercises
   * @param {ExerciseData[]} updated - Updated exercises
   * @param {Map} existingMap - Existing exercises lookup map
   * @param {Map} updatedMap - Updated exercises lookup map
   * @returns {ExerciseChanges} Detected changes
   * @private
   */
  _detectChanges(existing, updated, existingMap, updatedMap) {
    const changes = {
      toInsert: [],
      toUpdate: [],
      toDelete: [],
      orderChanged: false,
      metadata: {
        totalChanges: 0,
        changeTypes: [],
        timestamp: new Date().toISOString()
      }
    };

    // Track processed exercises to avoid duplicates
    const processedExisting = new Set();
    const processedUpdated = new Set();

    // Find updates and matches
    updated.forEach((updatedExercise, updatedIndex) => {
      let matchFound = false;
      
      // Try to find match by database ID first
      if (updatedExercise.id) {
        const existingMatch = existingMap.get(updatedExercise.id);
        if (existingMatch) {
          matchFound = true;
          processedExisting.add(existingMatch.index);
          processedUpdated.add(updatedIndex);
          
          // Check if exercise needs update
          if (this._exerciseNeedsUpdate(existingMatch.exercise, updatedExercise)) {
            changes.toUpdate.push({
              ...updatedExercise,
              id: existingMatch.exercise.id // Ensure ID is preserved
            });
            changes.metadata.totalChanges++;
          }
          
          // Check for order change
          if (this.options.trackOrderChanges && 
              existingMatch.index !== updatedIndex) {
            changes.orderChanged = true;
          }
        }
      }
      
      // If no ID match, try composite key match
      if (!matchFound) {
        const compositeKey = `${updatedExercise.exerciseId}_${updatedExercise.orderIndex}`;
        const existingMatch = existingMap.get(compositeKey);
        
        if (existingMatch && !processedExisting.has(existingMatch.index)) {
          matchFound = true;
          processedExisting.add(existingMatch.index);
          processedUpdated.add(updatedIndex);
          
          // Check if exercise needs update
          if (this._exerciseNeedsUpdate(existingMatch.exercise, updatedExercise)) {
            changes.toUpdate.push({
              ...updatedExercise,
              id: existingMatch.exercise.id // Preserve existing ID
            });
            changes.metadata.totalChanges++;
          }
        }
      }
      
      // If no match found, it's a new exercise
      if (!matchFound) {
        changes.toInsert.push(updatedExercise);
        changes.metadata.totalChanges++;
        processedUpdated.add(updatedIndex);
      }
    });

    // Find deletions (existing exercises not in updated)
    existing.forEach((existingExercise, existingIndex) => {
      if (!processedExisting.has(existingIndex)) {
        changes.toDelete.push(existingExercise.id);
        changes.metadata.totalChanges++;
      }
    });

    // Determine change types
    const changeTypes = [];
    if (changes.toInsert.length > 0) changeTypes.push('INSERT');
    if (changes.toUpdate.length > 0) changeTypes.push('UPDATE');
    if (changes.toDelete.length > 0) changeTypes.push('DELETE');
    if (changes.orderChanged) changeTypes.push('REORDER');
    
    changes.metadata.changeTypes = changeTypes.join(', ') || 'NONE';

    return changes;
  }

  /**
   * Check if an exercise needs to be updated
   * @param {ExerciseData} existing - Existing exercise
   * @param {ExerciseData} updated - Updated exercise
   * @returns {boolean} Whether exercise needs update
   * @private
   */
  _exerciseNeedsUpdate(existing, updated) {
    // Compare basic fields
    if (existing.exerciseId !== updated.exerciseId) return true;
    if (existing.sets !== updated.sets) return true;
    if (existing.notes !== updated.notes) return true;
    if (existing.orderIndex !== updated.orderIndex) return true;
    
    // Compare bodyweight (handle null/undefined)
    const existingBodyweight = existing.bodyweight || null;
    const updatedBodyweight = updated.bodyweight || null;
    if (!this._numbersEqual(existingBodyweight, updatedBodyweight)) return true;
    
    // Compare arrays
    if (!this._arraysEqual(existing.reps, updated.reps)) return true;
    if (!this._arraysEqual(existing.weights, updated.weights)) return true;
    if (!this._arraysEqual(existing.completed, updated.completed)) return true;
    
    return false;
  }

  /**
   * Compare two numbers with tolerance for floating point precision
   * @param {number|null} a - First number
   * @param {number|null} b - Second number
   * @returns {boolean} Whether numbers are equal
   * @private
   */
  _numbersEqual(a, b) {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    
    const numA = Number(a);
    const numB = Number(b);
    
    if (isNaN(numA) && isNaN(numB)) return true;
    if (isNaN(numA) || isNaN(numB)) return false;
    
    return Math.abs(numA - numB) <= this.options.floatTolerance;
  }

  /**
   * Compare two arrays for equality
   * @param {Array} a - First array
   * @param {Array} b - Second array
   * @returns {boolean} Whether arrays are equal
   * @private
   */
  _arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    
    for (let i = 0; i < a.length; i++) {
      const valueA = a[i];
      const valueB = b[i];
      
      // Handle different types
      if (typeof valueA !== typeof valueB) return false;
      
      if (typeof valueA === 'number') {
        if (!this._numbersEqual(valueA, valueB)) return false;
      } else {
        if (valueA !== valueB) return false;
      }
    }
    
    return true;
  }

  /**
   * Calculate summary statistics for changes
   * @param {ExerciseChanges} changes - Detected changes
   * @returns {Object} Summary statistics
   * @private
   */
  _calculateSummary(changes) {
    return {
      inserted: changes.toInsert.length,
      updated: changes.toUpdate.length,
      deleted: changes.toDelete.length,
      orderChanged: changes.orderChanged,
      totalOperations: changes.toInsert.length + changes.toUpdate.length + changes.toDelete.length
    };
  }

  /**
   * Validate exercise data structure
   * @param {ExerciseData} exercise - Exercise to validate
   * @returns {boolean} Whether exercise is valid
   */
  validateExerciseData(exercise) {
    try {
      if (!exercise || typeof exercise !== 'object') return false;
      
      // Required fields
      if (!exercise.exerciseId || typeof exercise.exerciseId !== 'string') return false;
      if (typeof exercise.sets !== 'number' || exercise.sets <= 0) return false;
      
      // Arrays
      if (!Array.isArray(exercise.reps) || 
          !Array.isArray(exercise.weights) || 
          !Array.isArray(exercise.completed)) return false;
      
      // Array lengths should match sets
      if (exercise.reps.length !== exercise.sets ||
          exercise.weights.length !== exercise.sets ||
          exercise.completed.length !== exercise.sets) return false;
      
      return true;
    } catch (error) {
      console.warn('⚠️ Exercise validation error:', error.message);
      return false;
    }
  }

  /**
   * Get change detection statistics
   * @returns {Object} Statistics about change detection operations
   */
  getStatistics() {
    return {
      options: this.options,
      version: '1.0.0',
      features: [
        'deep_comparison',
        'order_tracking',
        'floating_point_tolerance',
        'composite_key_matching',
        'change_classification'
      ]
    };
  }
}

/**
 * Utility functions for exercise change detection
 */
export const ExerciseChangeUtils = {
  /**
   * Create a new ExerciseChangeDetector with default options
   * @param {Object} options - Configuration options
   * @returns {ExerciseChangeDetector} New detector instance
   */
  createDetector(options = {}) {
    return new ExerciseChangeDetector(options);
  },

  /**
   * Quick comparison function for simple use cases
   * @param {ExerciseData[]} existing - Existing exercises
   * @param {ExerciseData[]} updated - Updated exercises
   * @param {Object} options - Detector options
   * @returns {ExerciseComparisonResult} Comparison result
   */
  compareExercises(existing, updated, options = {}) {
    const detector = new ExerciseChangeDetector(options);
    return detector.compareExercises(existing, updated);
  },

  /**
   * Check if exercises have any changes
   * @param {ExerciseData[]} existing - Existing exercises
   * @param {ExerciseData[]} updated - Updated exercises
   * @returns {boolean} Whether changes exist
   */
  hasChanges(existing, updated) {
    const result = this.compareExercises(existing, updated);
    return result.hasChanges;
  },

  /**
   * Get only the changes without full comparison result
   * @param {ExerciseData[]} existing - Existing exercises
   * @param {ExerciseData[]} updated - Updated exercises
   * @returns {ExerciseChanges} Just the changes object
   */
  getChanges(existing, updated) {
    const result = this.compareExercises(existing, updated);
    return result.changes;
  }
};

// Export the main class and utilities
export default ExerciseChangeDetector;