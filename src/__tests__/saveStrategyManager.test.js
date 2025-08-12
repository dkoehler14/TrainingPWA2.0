/**
 * Tests for SaveStrategyManager integration
 */

// Mock all dependencies first
jest.mock('../services/changeDetectionService', () => ({
  default: jest.fn().mockImplementation(() => ({
    detectChanges: jest.fn().mockReturnValue({
      saveStrategy: 'exercise-only',
      hasExerciseChanges: true,
      hasMetadataChanges: false,
      exerciseChanges: [],
      metadataChanges: [],
      summary: { hasStructuralChanges: false }
    })
  }))
}));

jest.mock('../services/workoutLogService', () => ({
  default: {
    ensureWorkoutLogExists: jest.fn().mockResolvedValue('workout-log-id'),
    saveExercisesOnly: jest.fn().mockResolvedValue({ success: true }),
    saveMetadataOnly: jest.fn().mockResolvedValue({ success: true }),
    saveWorkoutLogCacheFirst: jest.fn().mockResolvedValue({ id: 'workout-log-id' }),
    createWorkoutLogEnhanced: jest.fn().mockResolvedValue({ id: 'workout-log-id' }),
    getWorkoutLog: jest.fn().mockResolvedValue(null)
  }
}));

const SaveStrategyManager = require('../services/saveStrategyManager').default;

describe('SaveStrategyManager', () => {
  let saveStrategyManager;
  let mockWorkoutLogService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create fresh instance
    saveStrategyManager = new SaveStrategyManager({
      enablePerformanceMonitoring: true,
      enableDebugLogging: false, // Disable for tests
      defaultDebounceMs: 100,
      fallbackToFullSave: true
    });

    // Get mock service
    mockWorkoutLogService = require('../services/workoutLogService').default;
  });

  describe('initialization', () => {
    test('should initialize with default configuration', () => {
      const manager = new SaveStrategyManager();
      expect(manager).toBeDefined();
      expect(manager.config.enablePerformanceMonitoring).toBe(true);
      expect(manager.config.defaultDebounceMs).toBe(1000);
    });

    test('should initialize with custom configuration', () => {
      const manager = new SaveStrategyManager({
        enablePerformanceMonitoring: false,
        defaultDebounceMs: 2000
      });
      expect(manager.config.enablePerformanceMonitoring).toBe(false);
      expect(manager.config.defaultDebounceMs).toBe(2000);
    });
  });

  describe('strategy selection', () => {
    test('should select exercise-only strategy for exercise changes', () => {
      const changeAnalysis = {
        saveStrategy: 'exercise-only',
        hasExerciseChanges: true,
        hasMetadataChanges: false,
        exerciseChanges: [{ exerciseIndex: 0, changeTypes: ['reps_changed'] }],
        metadataChanges: [],
        summary: { hasStructuralChanges: false }
      };

      const context = {
        hasExistingWorkoutLog: true,
        isWorkoutFinished: false,
        cacheState: { isValid: true }
      };

      const strategy = saveStrategyManager.selectStrategy(changeAnalysis, context);
      
      expect(strategy.type).toBe('exercise-only');
      expect(strategy.priority).toBe('normal');
      expect(strategy.debounceMs).toBe(100);
    });

    test('should select metadata-only strategy for metadata changes', () => {
      const changeAnalysis = {
        saveStrategy: 'metadata-only',
        hasExerciseChanges: false,
        hasMetadataChanges: true,
        exerciseChanges: [],
        metadataChanges: [{ field: 'isFinished', changeType: 'modified' }],
        summary: { hasStructuralChanges: false }
      };

      const context = {
        hasExistingWorkoutLog: true,
        isWorkoutFinished: true,
        cacheState: { isValid: true }
      };

      const strategy = saveStrategyManager.selectStrategy(changeAnalysis, context);
      
      expect(strategy.type).toBe('metadata-only');
      expect(strategy.priority).toBe('high');
      expect(strategy.debounceMs).toBe(null);
    });

    test('should select full-save strategy for mixed changes', () => {
      const changeAnalysis = {
        saveStrategy: 'full-save',
        hasExerciseChanges: true,
        hasMetadataChanges: true,
        exerciseChanges: [{ exerciseIndex: 0, changeTypes: ['reps_changed'] }],
        metadataChanges: [{ field: 'isFinished', changeType: 'modified' }],
        summary: { hasStructuralChanges: false }
      };

      const context = {
        hasExistingWorkoutLog: true,
        isWorkoutFinished: false,
        cacheState: { isValid: true }
      };

      const strategy = saveStrategyManager.selectStrategy(changeAnalysis, context);
      
      expect(strategy.type).toBe('full-save');
      expect(strategy.priority).toBe('high');
      expect(strategy.useTransaction).toBe(true);
    });

    test('should adjust strategy for new workouts', () => {
      const changeAnalysis = {
        saveStrategy: 'exercise-only',
        hasExerciseChanges: true,
        hasMetadataChanges: false,
        exerciseChanges: [{ exerciseIndex: 0, changeTypes: ['reps_changed'] }],
        metadataChanges: [],
        summary: { hasStructuralChanges: false }
      };

      const context = {
        hasExistingWorkoutLog: false, // New workout
        isWorkoutFinished: false,
        cacheState: { isValid: true }
      };

      const strategy = saveStrategyManager.selectStrategy(changeAnalysis, context);
      
      expect(strategy.type).toBe('full-save'); // Should change to full-save for new workouts
      expect(strategy.useTransaction).toBe(true);
    });
  });

  describe('save request validation', () => {
    test('should validate required fields', async () => {
      const invalidRequest = {
        userId: 'user123',
        // Missing required fields
      };

      await expect(saveStrategyManager.executeSave(invalidRequest))
        .rejects.toThrow('Invalid save request: missing required fields');
    });

    test('should validate save type', async () => {
      const invalidRequest = {
        userId: 'user123',
        programId: 'program123',
        weekIndex: 0,
        dayIndex: 0,
        currentData: { exercises: [] },
        saveType: 'invalid_type'
      };

      await expect(saveStrategyManager.executeSave(invalidRequest))
        .rejects.toThrow('Invalid save type: invalid_type');
    });
  });

  describe('performance metrics', () => {
    test('should track performance metrics', () => {
      const metrics = saveStrategyManager.getPerformanceMetrics();
      
      expect(metrics).toHaveProperty('operationCounts');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('optimizationRate');
      expect(metrics).toHaveProperty('averageResponseTimes');
      expect(metrics).toHaveProperty('databaseWriteReduction');
      expect(metrics).toHaveProperty('errorRates');
    });

    test('should reset performance metrics', () => {
      // Add some fake metrics
      saveStrategyManager.performanceMetrics.totalOperations = 10;
      saveStrategyManager.performanceMetrics.successfulOperations = 8;

      saveStrategyManager.resetPerformanceMetrics();

      const metrics = saveStrategyManager.getPerformanceMetrics();
      expect(metrics.totalOperations).toBe(0);
      expect(metrics.successfulOperations).toBe(0);
    });
  });

  describe('error handling', () => {
    test('should handle strategy selection errors gracefully', () => {
      const invalidChangeAnalysis = null;
      const context = {
        hasExistingWorkoutLog: true,
        isWorkoutFinished: false,
        cacheState: { isValid: true }
      };

      const strategy = saveStrategyManager.selectStrategy(invalidChangeAnalysis, context);
      
      expect(strategy.type).toBe('full-save'); // Should fallback to full-save
      expect(strategy.reason).toContain('Strategy selection failed');
    });

    test('should handle unknown save strategies', () => {
      const changeAnalysis = {
        saveStrategy: 'unknown-strategy',
        hasExerciseChanges: true,
        hasMetadataChanges: false,
        exerciseChanges: [],
        metadataChanges: [],
        summary: { hasStructuralChanges: false }
      };

      const context = {
        hasExistingWorkoutLog: true,
        isWorkoutFinished: false,
        cacheState: { isValid: true }
      };

      const strategy = saveStrategyManager.selectStrategy(changeAnalysis, context);
      
      expect(strategy.type).toBe('full-save'); // Should fallback to full-save
      expect(strategy.reason).toContain('Unknown strategy');
    });
  });

  describe('integration with mocked dependencies', () => {
    test('should work with mocked ChangeDetectionService', () => {
      const changeAnalysis = {
        saveStrategy: 'exercise-only',
        hasExerciseChanges: true,
        hasMetadataChanges: false,
        exerciseChanges: [],
        metadataChanges: [],
        summary: { hasStructuralChanges: false }
      };
      
      const context = {
        hasExistingWorkoutLog: false,
        isWorkoutFinished: false,
        cacheState: { isValid: true }
      };

      const strategy = saveStrategyManager.selectStrategy(changeAnalysis, context);
      expect(strategy).toBeDefined();
      expect(strategy.type).toBe('full-save'); // Should change to full-save for new workouts
    });
  });
});