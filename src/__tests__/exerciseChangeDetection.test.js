/**
 * Exercise Change Detection Algorithm Tests
 * 
 * Comprehensive test suite for the exercise change detection system
 * that enables efficient upsert operations for workout exercises.
 */

import ExerciseChangeDetector, { ExerciseChangeUtils } from '../utils/exerciseChangeDetection';

describe('ExerciseChangeDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new ExerciseChangeDetector({
      logOperations: false, // Disable logging for tests
      trackOrderChanges: true,
      deepCompare: true,
      floatTolerance: 0.001
    });
  });

  describe('Constructor and Configuration', () => {
    test('should create detector with default options', () => {
      const defaultDetector = new ExerciseChangeDetector();
      expect(defaultDetector.options.trackOrderChanges).toBe(true);
      expect(defaultDetector.options.deepCompare).toBe(true);
      expect(defaultDetector.options.floatTolerance).toBe(0.001);
    });

    test('should override default options', () => {
      const customDetector = new ExerciseChangeDetector({
        trackOrderChanges: false,
        floatTolerance: 0.01
      });
      expect(customDetector.options.trackOrderChanges).toBe(false);
      expect(customDetector.options.floatTolerance).toBe(0.01);
    });
  });

  describe('Exercise Normalization', () => {
    test('should normalize exercise data correctly', () => {
      const rawExercises = [
        {
          exerciseId: 'ex1',
          sets: '3',
          reps: [10, 12],
          weights: [100, 105],
          completed: [true]
        }
      ];

      const result = detector.compareExercises([], rawExercises);
      const normalized = result.changes.toInsert[0];

      expect(normalized.sets).toBe(3);
      expect(normalized.reps).toEqual([10, 12, null]);
      expect(normalized.weights).toEqual([100, 105, null]);
      expect(normalized.completed).toEqual([true, false, false]);
      expect(normalized.orderIndex).toBe(0);
    });

    test('should handle missing arrays', () => {
      const rawExercises = [
        {
          exerciseId: 'ex1',
          sets: 2
        }
      ];

      const result = detector.compareExercises([], rawExercises);
      const normalized = result.changes.toInsert[0];

      expect(normalized.reps).toEqual([null, null]);
      expect(normalized.weights).toEqual([null, null]);
      expect(normalized.completed).toEqual([false, false]);
    });

    test('should throw error for missing exerciseId', () => {
      const rawExercises = [
        {
          sets: 3,
          reps: [10, 12, 8]
        }
      ];

      expect(() => {
        detector.compareExercises([], rawExercises);
      }).toThrow('Exercise at index 0 missing exerciseId');
    });

    test('should throw error for invalid sets', () => {
      const rawExercises = [
        {
          exerciseId: 'ex1',
          sets: 0,
          reps: []
        }
      ];

      expect(() => {
        detector.compareExercises([], rawExercises);
      }).toThrow('Exercise at index 0 has invalid sets: 0');
    });
  });

  describe('No Changes Detection', () => {
    test('should detect no changes for identical exercises', () => {
      const exercises = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0,
          notes: 'Test notes',
          bodyweight: null
        }
      ];

      const result = detector.compareExercises(exercises, exercises);

      expect(result.hasChanges).toBe(false);
      expect(result.changes.toInsert).toHaveLength(0);
      expect(result.changes.toUpdate).toHaveLength(0);
      expect(result.changes.toDelete).toHaveLength(0);
      expect(result.changes.orderChanged).toBe(false);
    });

    test('should detect no changes for empty arrays', () => {
      const result = detector.compareExercises([], []);

      expect(result.hasChanges).toBe(false);
      expect(result.summary.totalOperations).toBe(0);
    });
  });

  describe('Insert Detection', () => {
    test('should detect new exercises to insert', () => {
      const existing = [];
      const updated = [
        {
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        },
        {
          exerciseId: 'ex2',
          sets: 2,
          reps: [15, 12],
          weights: [50, 55],
          completed: [true, false],
          orderIndex: 1
        }
      ];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.toInsert).toHaveLength(2);
      expect(result.changes.toUpdate).toHaveLength(0);
      expect(result.changes.toDelete).toHaveLength(0);
      expect(result.summary.inserted).toBe(2);
    });

    test('should detect mixed inserts with existing exercises', () => {
      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        }
      ];

      const updated = [
        ...existing,
        {
          exerciseId: 'ex2',
          sets: 2,
          reps: [15, 12],
          weights: [50, 55],
          completed: [true, false],
          orderIndex: 1
        }
      ];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.toInsert).toHaveLength(1);
      expect(result.changes.toInsert[0].exerciseId).toBe('ex2');
      expect(result.changes.toUpdate).toHaveLength(0);
      expect(result.changes.toDelete).toHaveLength(0);
    });
  });

  describe('Update Detection', () => {
    test('should detect exercise updates by ID', () => {
      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0,
          notes: 'Original notes'
        }
      ];

      const updated = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 10], // Changed last rep
          weights: [100, 105, 95],
          completed: [true, true, true], // Changed completion
          orderIndex: 0,
          notes: 'Updated notes' // Changed notes
        }
      ];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.toInsert).toHaveLength(0);
      expect(result.changes.toUpdate).toHaveLength(1);
      expect(result.changes.toDelete).toHaveLength(0);
      expect(result.changes.toUpdate[0].id).toBe('db1');
      expect(result.changes.toUpdate[0].notes).toBe('Updated notes');
    });

    test('should detect sets count change', () => {
      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        }
      ];

      const updated = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 4, // Added one more set
          reps: [10, 12, 8, 10],
          weights: [100, 105, 95, 100],
          completed: [true, true, false, false],
          orderIndex: 0
        }
      ];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.toUpdate).toHaveLength(1);
      expect(result.changes.toUpdate[0].sets).toBe(4);
    });

    test('should detect bodyweight changes', () => {
      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [null, null, null],
          completed: [true, true, false],
          orderIndex: 0,
          bodyweight: 180
        }
      ];

      const updated = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [null, null, null],
          completed: [true, true, false],
          orderIndex: 0,
          bodyweight: 185 // Changed bodyweight
        }
      ];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.toUpdate).toHaveLength(1);
      expect(result.changes.toUpdate[0].bodyweight).toBe(185);
    });

    test('should handle floating point weight comparisons', () => {
      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 2,
          reps: [10, 12],
          weights: [100.0, 105.0],
          completed: [true, true],
          orderIndex: 0
        }
      ];

      const updated = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 2,
          reps: [10, 12],
          weights: [100.0001, 105.0001], // Within tolerance
          completed: [true, true],
          orderIndex: 0
        }
      ];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(false); // Should be within tolerance
    });
  });

  describe('Delete Detection', () => {
    test('should detect exercises to delete', () => {
      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        },
        {
          id: 'db2',
          exerciseId: 'ex2',
          sets: 2,
          reps: [15, 12],
          weights: [50, 55],
          completed: [true, false],
          orderIndex: 1
        }
      ];

      const updated = [
        existing[0] // Only keep first exercise
      ];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.toInsert).toHaveLength(0);
      expect(result.changes.toUpdate).toHaveLength(0);
      expect(result.changes.toDelete).toHaveLength(1);
      expect(result.changes.toDelete[0]).toBe('db2');
    });

    test('should detect all exercises deleted', () => {
      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        }
      ];

      const updated = [];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.toDelete).toHaveLength(1);
      expect(result.changes.toDelete[0]).toBe('db1');
      expect(result.summary.deleted).toBe(1);
    });
  });

  describe('Order Change Detection', () => {
    test('should detect exercise reordering', () => {
      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        },
        {
          id: 'db2',
          exerciseId: 'ex2',
          sets: 2,
          reps: [15, 12],
          weights: [50, 55],
          completed: [true, false],
          orderIndex: 1
        }
      ];

      const updated = [
        {
          ...existing[1],
          orderIndex: 0 // Moved to first position
        },
        {
          ...existing[0],
          orderIndex: 1 // Moved to second position
        }
      ];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.orderChanged).toBe(true);
      expect(result.summary.orderChanged).toBe(true);
    });

    test('should not detect order changes when disabled', () => {
      const noOrderDetector = new ExerciseChangeDetector({
        trackOrderChanges: false
      });

      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        },
        {
          id: 'db2',
          exerciseId: 'ex2',
          sets: 2,
          reps: [15, 12],
          weights: [50, 55],
          completed: [true, false],
          orderIndex: 1
        }
      ];

      const updated = [existing[1], existing[0]]; // Reordered

      const result = noOrderDetector.compareExercises(existing, updated);

      expect(result.changes.orderChanged).toBe(false);
    });
  });

  describe('Complex Change Scenarios', () => {
    test('should handle mixed insert, update, delete operations', () => {
      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0,
          notes: 'Keep and update'
        },
        {
          id: 'db2',
          exerciseId: 'ex2',
          sets: 2,
          reps: [15, 12],
          weights: [50, 55],
          completed: [true, false],
          orderIndex: 1,
          notes: 'Delete this'
        },
        {
          id: 'db3',
          exerciseId: 'ex3',
          sets: 1,
          reps: [20],
          weights: [25],
          completed: [true],
          orderIndex: 2,
          notes: 'Keep unchanged'
        }
      ];

      const updated = [
        {
          ...existing[0],
          notes: 'Updated notes' // Update
        },
        // Skip existing[1] - this will be deleted
        existing[2], // Keep unchanged
        {
          exerciseId: 'ex4', // New exercise
          sets: 2,
          reps: [8, 10],
          weights: [200, 205],
          completed: [false, false],
          orderIndex: 3,
          notes: 'New exercise'
        }
      ];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.toUpdate).toHaveLength(1);
      expect(result.changes.toUpdate[0].id).toBe('db1');
      expect(result.changes.toDelete).toHaveLength(1);
      expect(result.changes.toDelete[0]).toBe('db2');
      expect(result.changes.toInsert).toHaveLength(1);
      expect(result.changes.toInsert[0].exerciseId).toBe('ex4');
      expect(result.summary.totalOperations).toBe(3);
    });

    test('should handle exercises without database IDs', () => {
      const existing = [
        {
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        }
      ];

      const updated = [
        {
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 10], // Changed
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        }
      ];

      const result = detector.compareExercises(existing, updated);

      expect(result.hasChanges).toBe(true);
      expect(result.changes.toUpdate).toHaveLength(1);
    });
  });

  describe('Validation', () => {
    test('should validate exercise data structure', () => {
      const validExercise = {
        exerciseId: 'ex1',
        sets: 3,
        reps: [10, 12, 8],
        weights: [100, 105, 95],
        completed: [true, true, false]
      };

      expect(detector.validateExerciseData(validExercise)).toBe(true);
    });

    test('should reject invalid exercise data', () => {
      const invalidExercises = [
        null,
        {},
        { exerciseId: 'ex1' }, // Missing sets
        { exerciseId: 'ex1', sets: 0 }, // Invalid sets
        { exerciseId: 'ex1', sets: 3, reps: 'not array' }, // Invalid reps
        { 
          exerciseId: 'ex1', 
          sets: 3, 
          reps: [10, 12], // Wrong length
          weights: [100, 105, 95],
          completed: [true, true, false]
        }
      ];

      invalidExercises.forEach(exercise => {
        expect(detector.validateExerciseData(exercise)).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid input gracefully', () => {
      expect(() => {
        detector.compareExercises(null, []);
      }).not.toThrow();

      expect(() => {
        detector.compareExercises([], null);
      }).not.toThrow();

      const result = detector.compareExercises(null, null);
      expect(result.hasChanges).toBe(false);
    });

    test('should provide meaningful error messages', () => {
      const invalidExercises = [
        {
          sets: 3,
          reps: [10, 12, 8]
        }
      ];

      expect(() => {
        detector.compareExercises([], invalidExercises);
      }).toThrow('Exercise at index 0 missing exerciseId');
    });
  });

  describe('Performance and Metadata', () => {
    test('should include timing metadata', () => {
      const result = detector.compareExercises([], []);
      
      expect(result.metadata).toBeDefined();
      expect(result.metadata.detectionTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata.timestamp).toBeDefined();
      expect(result.metadata.existingCount).toBe(0);
      expect(result.metadata.updatedCount).toBe(0);
    });

    test('should provide statistics', () => {
      const stats = detector.getStatistics();
      
      expect(stats.options).toBeDefined();
      expect(stats.version).toBeDefined();
      expect(stats.features).toBeInstanceOf(Array);
    });
  });
});

describe('ExerciseChangeUtils', () => {
  describe('Utility Functions', () => {
    test('should create detector with options', () => {
      const detector = ExerciseChangeUtils.createDetector({
        trackOrderChanges: false
      });
      
      expect(detector.options.trackOrderChanges).toBe(false);
    });

    test('should provide quick comparison', () => {
      const existing = [
        {
          id: 'db1',
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        }
      ];

      const updated = [
        {
          ...existing[0],
          reps: [10, 12, 10] // Changed
        }
      ];

      const result = ExerciseChangeUtils.compareExercises(existing, updated);
      expect(result.hasChanges).toBe(true);
    });

    test('should check for changes existence', () => {
      const existing = [];
      const updated = [
        {
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        }
      ];

      expect(ExerciseChangeUtils.hasChanges(existing, updated)).toBe(true);
      expect(ExerciseChangeUtils.hasChanges(existing, existing)).toBe(false);
    });

    test('should get changes only', () => {
      const existing = [];
      const updated = [
        {
          exerciseId: 'ex1',
          sets: 3,
          reps: [10, 12, 8],
          weights: [100, 105, 95],
          completed: [true, true, false],
          orderIndex: 0
        }
      ];

      const changes = ExerciseChangeUtils.getChanges(existing, updated);
      expect(changes.toInsert).toHaveLength(1);
      expect(changes.toUpdate).toHaveLength(0);
      expect(changes.toDelete).toHaveLength(0);
    });
  });
});