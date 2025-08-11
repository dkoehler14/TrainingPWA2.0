/**
 * Unit tests for Change Detection Service
 * 
 * Tests all change detection scenarios including:
 * - New workout creation
 * - Exercise-only changes
 * - Metadata-only changes
 * - Mixed changes
 * - Structural changes
 * - Edge cases and error handling
 */

import ChangeDetectionService from '../changeDetectionService';

describe('ChangeDetectionService', () => {
  let service;

  beforeEach(() => {
    service = new ChangeDetectionService();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with correct field definitions', () => {
      expect(service.METADATA_FIELDS).toContain('name');
      expect(service.METADATA_FIELDS).toContain('isFinished');
      expect(service.METADATA_FIELDS).toContain('duration');
      expect(service.EXERCISE_FIELDS).toContain('reps');
      expect(service.EXERCISE_FIELDS).toContain('weights');
      expect(service.STRUCTURAL_FIELDS).toContain('exerciseId');
    });
  });

  describe('New Workout Detection', () => {
    test('should detect new workout with exercises as full-save', () => {
      const currentData = {
        metadata: {
          name: 'Test Workout',
          isFinished: false,
          isDraft: true
        },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, false]
          }
        ]
      };

      const result = service.detectChanges(null, currentData);

      expect(result.saveStrategy).toBe('full-save');
      expect(result.hasExerciseChanges).toBe(true);
      expect(result.hasMetadataChanges).toBe(true);
      expect(result.summary.isNewWorkout).toBe(true);
      expect(result.summary.exerciseCount).toBe(1);
    });

    test('should detect new workout with only metadata as metadata-only', () => {
      const currentData = {
        metadata: {
          name: 'Test Workout',
          isFinished: true,
          duration: 45
        },
        exercises: []
      };

      const result = service.detectChanges(null, currentData);

      expect(result.saveStrategy).toBe('metadata-only');
      expect(result.hasExerciseChanges).toBe(false);
      expect(result.hasMetadataChanges).toBe(true);
      expect(result.summary.isNewWorkout).toBe(true);
    });

    test('should detect new workout with only exercises as exercise-only', () => {
      const currentData = {
        metadata: {
          isFinished: false,
          isDraft: true
        },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, false]
          }
        ]
      };

      const result = service.detectChanges(null, currentData);

      expect(result.saveStrategy).toBe('exercise-only');
      expect(result.hasExerciseChanges).toBe(true);
      expect(result.hasMetadataChanges).toBe(false);
    });
  });

  describe('Exercise-Only Changes', () => {
    test('should detect reps changes as exercise-only', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, false]
          }
        ]
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [12, 10, 10], // Changed first rep
            weights: [100, 100, 100],
            completed: [true, true, false]
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('exercise-only');
      expect(result.hasExerciseChanges).toBe(true);
      expect(result.hasMetadataChanges).toBe(false);
      expect(result.exerciseChanges).toHaveLength(1);
      expect(result.exerciseChanges[0].changeTypes).toContain('reps_changed');
    });

    test('should detect weights changes as exercise-only', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, false]
          }
        ]
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [105, 100, 100], // Changed first weight
            completed: [true, true, false]
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('exercise-only');
      expect(result.exerciseChanges[0].changeTypes).toContain('weights_changed');
    });

    test('should detect completed status changes as exercise-only', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, false]
          }
        ]
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true] // Completed last set
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('exercise-only');
      expect(result.exerciseChanges[0].changeTypes).toContain('completed_changed');
    });

    test('should detect bodyweight changes as exercise-only', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [0, 0, 0],
            completed: [true, true, false],
            bodyweight: 180
          }
        ]
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [0, 0, 0],
            completed: [true, true, false],
            bodyweight: 185 // Changed bodyweight
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('exercise-only');
      expect(result.exerciseChanges[0].changeTypes).toContain('bodyweight_changed');
    });

    test('should detect multiple exercise changes as exercise-only', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, false]
          },
          {
            exerciseId: 'ex2',
            sets: 2,
            reps: [8, 8],
            weights: [50, 50],
            completed: [true, false]
          }
        ]
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [12, 10, 10], // Changed
            weights: [100, 100, 100],
            completed: [true, true, false]
          },
          {
            exerciseId: 'ex2',
            sets: 2,
            reps: [8, 8],
            weights: [55, 50], // Changed
            completed: [true, false]
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('exercise-only');
      expect(result.exerciseChanges).toHaveLength(2);
      expect(result.exerciseChanges[0].changeTypes).toContain('reps_changed');
      expect(result.exerciseChanges[1].changeTypes).toContain('weights_changed');
    });
  });

  describe('Metadata-Only Changes', () => {
    test('should detect workout completion as metadata-only', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const currentData = {
        metadata: { 
          name: 'Test', 
          isFinished: true, // Changed to finished
          completedDate: '2024-01-15'
        },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('metadata-only');
      expect(result.hasMetadataChanges).toBe(true);
      expect(result.hasExerciseChanges).toBe(false);
      expect(result.metadataChanges).toHaveLength(2);
      expect(result.metadataChanges.find(c => c.field === 'isFinished')).toBeTruthy();
      expect(result.metadataChanges.find(c => c.field === 'completedDate')).toBeTruthy();
    });

    test('should detect duration changes as metadata-only', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false, duration: null },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const currentData = {
        metadata: { 
          name: 'Test', 
          isFinished: false, 
          duration: 45 // Added duration
        },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('metadata-only');
      expect(result.metadataChanges[0].field).toBe('duration');
      expect(result.metadataChanges[0].changeType).toBe('added');
    });

    test('should detect notes changes as metadata-only', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false, notes: '' },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const currentData = {
        metadata: { 
          name: 'Test', 
          isFinished: false, 
          notes: 'Great workout today!' // Added notes
        },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('metadata-only');
      expect(result.metadataChanges[0].field).toBe('notes');
    });
  });

  describe('Mixed Changes (Full Save)', () => {
    test('should detect mixed exercise and metadata changes as full-save', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, false]
          }
        ]
      };

      const currentData = {
        metadata: { 
          name: 'Test', 
          isFinished: true, // Metadata change
          duration: 30
        },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [12, 10, 10], // Exercise change
            weights: [100, 100, 100],
            completed: [true, true, true] // Exercise change
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('full-save');
      expect(result.hasMetadataChanges).toBe(true);
      expect(result.hasExerciseChanges).toBe(true);
      expect(result.metadataChanges).toHaveLength(2);
      expect(result.exerciseChanges).toHaveLength(1);
    });
  });

  describe('Structural Changes (Full Save)', () => {
    test('should detect exercise addition as full-save', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          },
          {
            exerciseId: 'ex2', // Added exercise
            sets: 2,
            reps: [8, 8],
            weights: [50, 50],
            completed: [false, false]
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('full-save');
      expect(result.exerciseChanges).toHaveLength(1);
      expect(result.exerciseChanges[0].changeTypes).toContain('exercise_added');
      expect(result.summary.hasStructuralChanges).toBe(true);
    });

    test('should detect exercise removal as full-save', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          },
          {
            exerciseId: 'ex2',
            sets: 2,
            reps: [8, 8],
            weights: [50, 50],
            completed: [true, true]
          }
        ]
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
          // ex2 removed
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('full-save');
      expect(result.exerciseChanges).toHaveLength(1);
      expect(result.exerciseChanges[0].changeTypes).toContain('exercise_removed');
      expect(result.summary.hasStructuralChanges).toBe(true);
    });

    test('should detect exercise ID change as full-save', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex2', // Changed exercise ID
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('full-save');
      expect(result.exerciseChanges[0].changeTypes).toContain('exerciseId_changed');
      expect(result.summary.hasStructuralChanges).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle invalid input data gracefully', () => {
      const result = service.detectChanges(null, null);

      expect(result.saveStrategy).toBe('full-save');
      expect(result.summary.fallbackUsed).toBe(true);
      expect(result.summary.error).toBeDefined();
    });

    test('should handle missing metadata gracefully', () => {
      const currentData = {
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const result = service.detectChanges(null, currentData);

      expect(result.saveStrategy).toBe('full-save');
      expect(result.summary.fallbackUsed).toBe(true);
    });

    test('should handle missing exercises gracefully', () => {
      const currentData = {
        metadata: { name: 'Test', isFinished: false }
      };

      const result = service.detectChanges(null, currentData);

      expect(result.saveStrategy).toBe('full-save');
      expect(result.summary.fallbackUsed).toBe(true);
    });

    test('should handle empty arrays correctly', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: []
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: []
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('full-save');
      expect(result.hasExerciseChanges).toBe(false);
      expect(result.hasMetadataChanges).toBe(false);
    });

    test('should handle null and undefined values in arrays', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, null, 10],
            weights: [100, null, 100],
            completed: [true, false, true]
          }
        ]
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 8, 10], // Changed null to 8
            weights: [100, null, 100],
            completed: [true, false, true]
          }
        ]
      };

      const result = service.detectChanges(previousData, currentData);

      expect(result.saveStrategy).toBe('exercise-only');
      expect(result.exerciseChanges[0].changeTypes).toContain('reps_changed');
    });
  });

  describe('Utility Methods', () => {
    test('getChangeDetails should return detailed change information', () => {
      const previousData = {
        metadata: { name: 'Test', isFinished: false },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, false]
          }
        ]
      };

      const currentData = {
        metadata: { name: 'Test', isFinished: true },
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [12, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          }
        ]
      };

      const analysis = service.detectChanges(previousData, currentData);
      const details = service.getChangeDetails(analysis);

      expect(details.strategy).toBe('full-save');
      expect(details.metadataChanges).toHaveLength(1);
      expect(details.exerciseChanges).toHaveLength(1);
      expect(details.metadataChanges[0].field).toBe('isFinished');
      expect(details.exerciseChanges[0].changeTypes).toContain('reps_changed');
    });

    test('requiresImmediateSave should return true for metadata changes', () => {
      const analysis = {
        hasMetadataChanges: true,
        hasExerciseChanges: false,
        saveStrategy: 'metadata-only',
        summary: { hasStructuralChanges: false }
      };

      expect(service.requiresImmediateSave(analysis)).toBe(true);
    });

    test('canUseDebouncedSave should return true for exercise-only changes', () => {
      const analysis = {
        hasMetadataChanges: false,
        hasExerciseChanges: true,
        saveStrategy: 'exercise-only',
        summary: { hasStructuralChanges: false }
      };

      expect(service.canUseDebouncedSave(analysis)).toBe(true);
    });

    test('canUseDebouncedSave should return false for structural changes', () => {
      const analysis = {
        hasMetadataChanges: false,
        hasExerciseChanges: true,
        saveStrategy: 'exercise-only',
        summary: { hasStructuralChanges: true }
      };

      expect(service.canUseDebouncedSave(analysis)).toBe(false);
    });
  });

  describe('Value Equality Testing', () => {
    test('should correctly compare primitive values', () => {
      expect(service._valuesEqual(1, 1)).toBe(true);
      expect(service._valuesEqual(1, 2)).toBe(false);
      expect(service._valuesEqual('test', 'test')).toBe(true);
      expect(service._valuesEqual('test', 'other')).toBe(false);
      expect(service._valuesEqual(true, true)).toBe(true);
      expect(service._valuesEqual(true, false)).toBe(false);
    });

    test('should correctly compare null and undefined', () => {
      expect(service._valuesEqual(null, null)).toBe(true);
      expect(service._valuesEqual(undefined, undefined)).toBe(true);
      expect(service._valuesEqual(null, undefined)).toBe(false);
      expect(service._valuesEqual(null, 0)).toBe(false);
      expect(service._valuesEqual(undefined, '')).toBe(false);
    });

    test('should correctly compare arrays', () => {
      expect(service._valuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(service._valuesEqual([1, 2, 3], [1, 2, 4])).toBe(false);
      expect(service._valuesEqual([1, 2], [1, 2, 3])).toBe(false);
      expect(service._valuesEqual([], [])).toBe(true);
      expect(service._valuesEqual([null, 1], [null, 1])).toBe(true);
    });

    test('should correctly compare objects', () => {
      expect(service._valuesEqual({a: 1, b: 2}, {a: 1, b: 2})).toBe(true);
      expect(service._valuesEqual({a: 1, b: 2}, {a: 1, b: 3})).toBe(false);
      expect(service._valuesEqual({a: 1}, {a: 1, b: 2})).toBe(false);
      expect(service._valuesEqual({}, {})).toBe(true);
    });
  });
});