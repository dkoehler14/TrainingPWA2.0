/**
 * Unit tests for reset helper utilities
 */

const { getResetStatistics, reportResetCompletion } = require('../reset-helpers');

// Mock console methods
const originalConsoleLog = console.log;
let consoleOutput = [];

beforeEach(() => {
  consoleOutput = [];
  console.log = (...args) => {
    consoleOutput.push(args.join(' '));
  };
});

afterEach(() => {
  console.log = originalConsoleLog;
});

describe('Reset Helper Utilities', () => {
  describe('getResetStatistics', () => {
    test('should handle empty collections gracefully', async () => {
      // Mock Firestore instance
      const mockDb = {
        collection: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ size: 0 })
        })
      };

      const stats = await getResetStatistics(mockDb);
      
      expect(stats).toEqual({
        users: 0,
        programs: 0,
        workoutLogs: 0,
        exercises: 0,
        exercises_metadata: 0
      });
    });

    test('should return correct statistics for populated collections', async () => {
      // Mock Firestore instance with data
      const mockDb = {
        collection: jest.fn().mockImplementation((collectionName) => ({
          get: jest.fn().mockResolvedValue({ 
            size: collectionName === 'users' ? 3 : 
                  collectionName === 'programs' ? 5 : 
                  collectionName === 'workoutLogs' ? 25 : 
                  collectionName === 'exercises' ? 50 : 1
          })
        }))
      };

      const stats = await getResetStatistics(mockDb);
      
      expect(stats).toEqual({
        users: 3,
        programs: 5,
        workoutLogs: 25,
        exercises: 50,
        exercises_metadata: 1
      });
    });

    test('should handle collection access errors gracefully', async () => {
      // Mock Firestore instance that throws errors for individual collections
      const mockDb = {
        collection: jest.fn().mockReturnValue({
          get: jest.fn().mockRejectedValue(new Error('Collection not found'))
        })
      };

      const stats = await getResetStatistics(mockDb);
      
      // Should return stats with zero values when individual collections fail
      expect(stats).toEqual({
        users: 0,
        programs: 0,
        workoutLogs: 0,
        exercises: 0,
        exercises_metadata: 0
      });
    });
  });

  describe('reportResetCompletion', () => {
    test('should report reset completion with statistics', () => {
      const beforeStats = {
        users: 3,
        programs: 5,
        workoutLogs: 25,
        exercises: 50,
        exercises_metadata: 1
      };

      const afterStats = {
        users: 0,
        programs: 0,
        workoutLogs: 0,
        exercises: 0,
        exercises_metadata: 0
      };

      reportResetCompletion(beforeStats, afterStats);

      // Join all console output to handle newlines
      const fullOutput = consoleOutput.join(' ');
      
      // Check that the report was generated
      expect(fullOutput).toContain('📊 Reset Summary:');
      expect(fullOutput).toContain('================');
      expect(fullOutput).toContain('users: 3 documents cleared (3 → 0)');
      expect(fullOutput).toContain('programs: 5 documents cleared (5 → 0)');
      expect(fullOutput).toContain('workoutLogs: 25 documents cleared (25 → 0)');
      expect(fullOutput).toContain('exercises: 50 documents cleared (50 → 0)');
      expect(fullOutput).toContain('✅ Emulators are now in a clean state and ready for fresh seeding');
    });

    test('should handle empty statistics gracefully', () => {
      reportResetCompletion({}, {});

      // Join all console output to handle newlines
      const fullOutput = consoleOutput.join(' ');

      // Should still show the summary header
      expect(fullOutput).toContain('📊 Reset Summary:');
      expect(fullOutput).toContain('✅ Emulators are now in a clean state and ready for fresh seeding');
    });

    test('should not show collections with no data', () => {
      const beforeStats = {
        users: 0,
        programs: 0,
        workoutLogs: 5,
        exercises: 0,
        exercises_metadata: 0
      };

      const afterStats = {
        users: 0,
        programs: 0,
        workoutLogs: 0,
        exercises: 0,
        exercises_metadata: 0
      };

      reportResetCompletion(beforeStats, afterStats);

      // Should only show workoutLogs since it had data
      expect(consoleOutput.some(line => line.includes('workoutLogs: 5 documents cleared'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('users:'))).toBe(false);
      expect(consoleOutput.some(line => line.includes('programs:'))).toBe(false);
    });
  });
});