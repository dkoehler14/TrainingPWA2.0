/**
 * Change Detection Service for Workout Log Save Optimization
 * 
 * Analyzes changes between previous and current workout data to determine
 * the optimal save strategy (exercise-only, metadata-only, or full-save).
 * 
 * This service implements the core logic for the workout log save optimization
 * feature by detecting what specific data has changed and classifying changes
 * to enable targeted database updates.
 */

/**
 * Interface definitions for change detection
 */

/**
 * @typedef {Object} ChangeAnalysis
 * @property {boolean} hasExerciseChanges - Whether exercise data has changed
 * @property {boolean} hasMetadataChanges - Whether workout metadata has changed
 * @property {ExerciseChange[]} exerciseChanges - Array of specific exercise changes
 * @property {MetadataChange[]} metadataChanges - Array of specific metadata changes
 * @property {'exercise-only'|'metadata-only'|'full-save'} saveStrategy - Recommended save strategy
 * @property {Object} summary - Summary of changes for logging/debugging
 */

/**
 * @typedef {Object} ExerciseChange
 * @property {number} exerciseIndex - Index of the changed exercise
 * @property {string} exerciseId - ID of the exercise that changed
 * @property {Object} changes - Specific changes within the exercise
 * @property {number[]|null} changes.reps - Changed reps array (if changed)
 * @property {number[]|null} changes.weights - Changed weights array (if changed)
 * @property {boolean[]|null} changes.completed - Changed completed array (if changed)
 * @property {string|null} changes.notes - Changed exercise notes (if changed)
 * @property {number|null} changes.bodyweight - Changed bodyweight (if changed)
 * @property {number|null} changes.sets - Changed sets count (if changed)
 * @property {string[]} changeTypes - Types of changes detected
 */

/**
 * @typedef {Object} MetadataChange
 * @property {'is_finished'|'duration'|'notes'|'completed_date'|'name'|'weight_unit'} field - Changed field name
 * @property {*} oldValue - Previous value
 * @property {*} newValue - New value
 * @property {string} changeType - Type of change (added, modified, removed)
 */

/**
 * @typedef {Object} WorkoutLogData
 * @property {Object} metadata - Workout metadata
 * @property {string} metadata.name - Workout name
 * @property {boolean} metadata.isFinished - Whether workout is finished
 * @property {boolean} metadata.isDraft - Whether workout is a draft
 * @property {number|null} metadata.duration - Workout duration in minutes
 * @property {string} metadata.notes - Workout notes
 * @property {string|null} metadata.completedDate - Completion date
 * @property {string} metadata.weightUnit - Weight unit (LB/KG)
 * @property {ExerciseData[]} exercises - Array of exercise data
 * @property {Object} system - System fields
 * @property {string} system.userId - User ID
 * @property {string} system.programId - Program ID
 * @property {number} system.weekIndex - Week index
 * @property {number} system.dayIndex - Day index
 */

/**
 * @typedef {Object} ExerciseData
 * @property {string} exerciseId - Exercise ID
 * @property {number} sets - Number of sets
 * @property {(number|null)[]} reps - Array of reps per set
 * @property {(number|null)[]} weights - Array of weights per set
 * @property {boolean[]} completed - Array of completion status per set
 * @property {number|null} bodyweight - Bodyweight for bodyweight exercises
 * @property {string} notes - Exercise notes
 * @property {number} orderIndex - Order index in workout
 * @property {boolean} isAdded - Whether exercise was added by user
 * @property {string|null} addedType - Type of added exercise
 * @property {number} originalIndex - Original index before modifications
 */

class ChangeDetectionService {
  constructor() {
    this.METADATA_FIELDS = [
      'name',
      'isFinished', 
      'isDraft',
      'duration',
      'notes',
      'completedDate',
      'weightUnit'
    ];

    this.EXERCISE_FIELDS = [
      'reps',
      'weights', 
      'completed',
      'bodyweight',
      'notes',
      'sets'
    ];

    this.STRUCTURAL_FIELDS = [
      'exerciseId',
      'orderIndex',
      'isAdded',
      'addedType',
      'originalIndex'
    ];
  }

  /**
   * Main method to detect changes between previous and current workout data
   * @param {WorkoutLogData|null} previousData - Previous workout data (null for new workouts)
   * @param {WorkoutLogData} currentData - Current workout data
   * @returns {ChangeAnalysis} Analysis of changes and recommended save strategy
   */
  detectChanges(previousData, currentData) {
    try {
      // Validate input data
      this._validateInputData(currentData);

      // Handle new workout case
      if (!previousData) {
        return this._handleNewWorkout(currentData);
      }

      // Detect metadata changes
      const metadataChanges = this._detectMetadataChanges(
        previousData.metadata || {},
        currentData.metadata || {}
      );

      // Detect exercise changes
      const exerciseChanges = this._detectExerciseChanges(
        previousData.exercises || [],
        currentData.exercises || []
      );

      // Determine save strategy
      const saveStrategy = this._determineSaveStrategy(metadataChanges, exerciseChanges);

      // Create summary
      const summary = this._createChangeSummary(metadataChanges, exerciseChanges, saveStrategy);

      return {
        hasExerciseChanges: exerciseChanges.length > 0,
        hasMetadataChanges: metadataChanges.length > 0,
        exerciseChanges,
        metadataChanges,
        saveStrategy,
        summary
      };
    } catch (error) {
      console.error('Change detection failed:', error);
      
      // Return safe fallback strategy
      return {
        hasExerciseChanges: true,
        hasMetadataChanges: true,
        exerciseChanges: [],
        metadataChanges: [],
        saveStrategy: 'full-save',
        summary: {
          error: error.message,
          fallbackUsed: true,
          totalChanges: 0,
          changeTypes: []
        }
      };
    }
  }

  /**
   * Validate input data structure
   * @private
   */
  _validateInputData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid workout data: data must be an object');
    }

    if (!data.exercises || !Array.isArray(data.exercises)) {
      throw new Error('Invalid workout data: exercises must be an array');
    }

    if (!data.metadata || typeof data.metadata !== 'object') {
      throw new Error('Invalid workout data: metadata must be an object');
    }
  }

  /**
   * Handle new workout case (no previous data)
   * @private
   */
  _handleNewWorkout(currentData) {
    const hasExercises = currentData.exercises && currentData.exercises.length > 0;
    const hasMetadata = this._hasSignificantMetadata(currentData.metadata);

    // For new workouts, if we have exercises, we need a full save
    // If only metadata, we can do metadata-only save
    let saveStrategy = 'full-save';
    if (!hasExercises && hasMetadata) {
      saveStrategy = 'metadata-only';
    } else if (hasExercises && !hasMetadata) {
      saveStrategy = 'exercise-only';
    }

    return {
      hasExerciseChanges: hasExercises,
      hasMetadataChanges: hasMetadata,
      exerciseChanges: [],
      metadataChanges: [],
      saveStrategy,
      summary: {
        isNewWorkout: true,
        hasExercises,
        hasMetadata,
        exerciseCount: currentData.exercises.length,
        totalChanges: hasExercises || hasMetadata ? 1 : 0,
        changeTypes: ['new_workout']
      }
    };
  }

  /**
   * Check if metadata contains significant changes worth saving
   * @private
   */
  _hasSignificantMetadata(metadata) {
    if (!metadata) return false;
    
    // Check for non-default metadata values
    // isDraft: true and isFinished: false are considered default states for new workouts
    return metadata.isFinished === true ||
           (metadata.duration && metadata.duration > 0) ||
           (metadata.notes && metadata.notes.trim().length > 0) ||
           metadata.completedDate ||
           (metadata.name && metadata.name.trim().length > 0 && metadata.name !== 'Untitled Workout');
  }

  /**
   * Detect changes in workout metadata
   * @private
   */
  _detectMetadataChanges(previousMetadata, currentMetadata) {
    const changes = [];

    for (const field of this.METADATA_FIELDS) {
      const oldValue = previousMetadata[field];
      const newValue = currentMetadata[field];

      if (!this._valuesEqual(oldValue, newValue)) {
        changes.push({
          field,
          oldValue,
          newValue,
          changeType: this._getChangeType(oldValue, newValue)
        });
      }
    }

    return changes;
  }

  /**
   * Detect changes in exercise data
   * @private
   */
  _detectExerciseChanges(previousExercises, currentExercises) {
    const changes = [];

    // Handle different array lengths (exercises added/removed)
    const maxLength = Math.max(previousExercises.length, currentExercises.length);

    for (let i = 0; i < maxLength; i++) {
      const prevExercise = previousExercises[i];
      const currExercise = currentExercises[i];

      // Exercise removed
      if (prevExercise && !currExercise) {
        changes.push({
          exerciseIndex: i,
          exerciseId: prevExercise.exerciseId,
          changes: { removed: true },
          changeTypes: ['exercise_removed']
        });
        continue;
      }

      // Exercise added
      if (!prevExercise && currExercise) {
        changes.push({
          exerciseIndex: i,
          exerciseId: currExercise.exerciseId,
          changes: { added: true },
          changeTypes: ['exercise_added']
        });
        continue;
      }

      // Exercise modified
      if (prevExercise && currExercise) {
        const exerciseChange = this._detectSingleExerciseChanges(prevExercise, currExercise, i);
        if (exerciseChange.changeTypes.length > 0) {
          changes.push(exerciseChange);
        }
      }
    }

    return changes;
  }

  /**
   * Detect changes in a single exercise
   * @private
   */
  _detectSingleExerciseChanges(prevExercise, currExercise, index) {
    const changes = {};
    const changeTypes = [];

    // Check structural changes first
    for (const field of this.STRUCTURAL_FIELDS) {
      if (!this._valuesEqual(prevExercise[field], currExercise[field])) {
        changes[field] = currExercise[field];
        changeTypes.push(`${field}_changed`);
      }
    }

    // Check exercise data changes
    for (const field of this.EXERCISE_FIELDS) {
      if (!this._valuesEqual(prevExercise[field], currExercise[field])) {
        changes[field] = currExercise[field];
        changeTypes.push(`${field}_changed`);
      }
    }

    return {
      exerciseIndex: index,
      exerciseId: currExercise.exerciseId,
      changes,
      changeTypes
    };
  }

  /**
   * Determine the optimal save strategy based on detected changes
   * @private
   */
  _determineSaveStrategy(metadataChanges, exerciseChanges) {
    const hasMetadataChanges = metadataChanges.length > 0;
    const hasExerciseChanges = exerciseChanges.length > 0;

    // Check for structural changes that require full save
    const hasStructuralChanges = exerciseChanges.some(change => 
      change.changeTypes.some(type => 
        type.includes('exercise_added') || 
        type.includes('exercise_removed') ||
        type.includes('exerciseId_changed') ||
        type.includes('orderIndex_changed')
      )
    );

    // Determine strategy
    if (hasStructuralChanges || (hasMetadataChanges && hasExerciseChanges)) {
      return 'full-save';
    } else if (hasMetadataChanges && !hasExerciseChanges) {
      return 'metadata-only';
    } else if (hasExerciseChanges && !hasMetadataChanges) {
      return 'exercise-only';
    } else {
      return 'full-save'; // Fallback for no changes
    }
  }

  /**
   * Create a summary of detected changes
   * @private
   */
  _createChangeSummary(metadataChanges, exerciseChanges, saveStrategy) {
    const changeTypes = [];
    
    // Collect metadata change types
    metadataChanges.forEach(change => {
      changeTypes.push(`metadata_${change.field}_${change.changeType}`);
    });

    // Collect exercise change types
    exerciseChanges.forEach(change => {
      changeTypes.push(...change.changeTypes);
    });

    return {
      totalChanges: metadataChanges.length + exerciseChanges.length,
      metadataChangeCount: metadataChanges.length,
      exerciseChangeCount: exerciseChanges.length,
      saveStrategy,
      changeTypes: [...new Set(changeTypes)], // Remove duplicates
      affectedExercises: exerciseChanges.length,
      hasStructuralChanges: changeTypes.some(type => 
        type.includes('added') || type.includes('removed') || type.includes('exerciseId')
      )
    };
  }

  /**
   * Compare two values for equality, handling arrays and objects
   * @private
   */
  _valuesEqual(a, b) {
    // Handle null/undefined cases
    if (a === b) return true;
    if (a == null || b == null) return a === b;

    // Handle arrays
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, index) => this._valuesEqual(val, b[index]));
    }

    // Handle objects
    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => this._valuesEqual(a[key], b[key]));
    }

    // Handle primitive values
    return a === b;
  }

  /**
   * Determine the type of change (added, modified, removed)
   * @private
   */
  _getChangeType(oldValue, newValue) {
    if (oldValue == null && newValue != null) return 'added';
    if (oldValue != null && newValue == null) return 'removed';
    return 'modified';
  }

  /**
   * Get detailed change information for debugging
   * @param {ChangeAnalysis} analysis - Change analysis result
   * @returns {Object} Detailed change information
   */
  getChangeDetails(analysis) {
    return {
      strategy: analysis.saveStrategy,
      summary: analysis.summary,
      metadataChanges: analysis.metadataChanges.map(change => ({
        field: change.field,
        type: change.changeType,
        from: change.oldValue,
        to: change.newValue
      })),
      exerciseChanges: analysis.exerciseChanges.map(change => ({
        index: change.exerciseIndex,
        exerciseId: change.exerciseId,
        changeTypes: change.changeTypes,
        changedFields: Object.keys(change.changes)
      }))
    };
  }

  /**
   * Check if changes require immediate save (metadata changes)
   * @param {ChangeAnalysis} analysis - Change analysis result
   * @returns {boolean} Whether immediate save is required
   */
  requiresImmediateSave(analysis) {
    return analysis.hasMetadataChanges || 
           analysis.summary.hasStructuralChanges ||
           analysis.saveStrategy === 'full-save';
  }

  /**
   * Check if changes can use debounced save (exercise-only changes)
   * @param {ChangeAnalysis} analysis - Change analysis result
   * @returns {boolean} Whether debounced save can be used
   */
  canUseDebouncedSave(analysis) {
    return analysis.saveStrategy === 'exercise-only' && 
           !analysis.summary.hasStructuralChanges;
  }
}

export default ChangeDetectionService;