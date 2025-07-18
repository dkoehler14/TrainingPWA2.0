/**
 * Tests for user seeding functionality
 */

const { seedUsers, getUserScenarios, isValidScenario, USER_SCENARIOS } = require('../users');

// Mock Firebase Admin SDK
jest.mock('../utils/firebase-config', () => ({
  getAuth: jest.fn(() => ({
    getUserByEmail: jest.fn(),
    deleteUser: jest.fn(),
    createUser: jest.fn()
  })),
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn()
      }))
    }))
  }))
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logProgress: jest.fn()
}));

const { getAuth, getFirestore } = require('../utils/firebase-config');

describe('User Seeding', () => {
  let mockAuth;
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuth = {
      getUserByEmail: jest.fn(),
      deleteUser: jest.fn(),
      createUser: jest.fn()
    };

    mockDb = {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          set: jest.fn()
        }))
      }))
    };

    getAuth.mockReturnValue(mockAuth);
    getFirestore.mockReturnValue(mockDb);
  });

  describe('getUserScenarios', () => {
    test('should return all user scenarios', () => {
      const scenarios = getUserScenarios();

      expect(scenarios).toHaveProperty('beginner');
      expect(scenarios).toHaveProperty('intermediate');
      expect(scenarios).toHaveProperty('advanced');

      // Verify beginner scenario structure
      expect(scenarios.beginner).toHaveProperty('email', 'beginner@test.com');
      expect(scenarios.beginner).toHaveProperty('password', 'test123');
      expect(scenarios.beginner.profile).toHaveProperty('name', 'Alex Beginner');
      expect(scenarios.beginner.profile).toHaveProperty('experienceLevel', 'beginner');
    });
  });

  describe('isValidScenario', () => {
    test('should validate existing scenarios', () => {
      expect(isValidScenario('beginner')).toBe(true);
      expect(isValidScenario('intermediate')).toBe(true);
      expect(isValidScenario('advanced')).toBe(true);
      expect(isValidScenario('all')).toBe(true);
    });

    test('should reject invalid scenarios', () => {
      expect(isValidScenario('invalid')).toBe(false);
      expect(isValidScenario('')).toBe(false);
      expect(isValidScenario(null)).toBe(false);
    });
  });

  describe('seedUsers', () => {
    test('should create all users when scenario is "all"', async () => {
      // Mock successful user creation
      mockAuth.getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' });
      mockAuth.createUser.mockResolvedValue({ uid: 'test-uid-1' });
      mockDb.collection().doc().set.mockResolvedValue();

      const result = await seedUsers({ scenario: 'all' });

      expect(result).toHaveLength(3);
      expect(mockAuth.createUser).toHaveBeenCalledTimes(3);
      expect(mockDb.collection).toHaveBeenCalledWith('users');
    });

    test('should create single user when specific scenario provided', async () => {
      // Mock successful user creation
      mockAuth.getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' });
      mockAuth.createUser.mockResolvedValue({ uid: 'test-uid-beginner' });
      mockDb.collection().doc().set.mockResolvedValue();

      const result = await seedUsers({ scenario: 'beginner' });

      expect(result).toHaveLength(1);
      expect(result[0].scenario).toBe('beginner');
      expect(result[0].email).toBe('beginner@test.com');
      expect(mockAuth.createUser).toHaveBeenCalledTimes(1);
    });

    test('should delete existing user before creating new one', async () => {
      // Mock existing user
      mockAuth.getUserByEmail.mockResolvedValue({ uid: 'existing-uid' });
      mockAuth.deleteUser.mockResolvedValue();
      mockAuth.createUser.mockResolvedValue({ uid: 'new-uid' });
      mockDb.collection().doc().set.mockResolvedValue();

      await seedUsers({ scenario: 'beginner' });

      expect(mockAuth.getUserByEmail).toHaveBeenCalledWith('beginner@test.com');
      expect(mockAuth.deleteUser).toHaveBeenCalledWith('existing-uid');
      expect(mockAuth.createUser).toHaveBeenCalled();
    });

    test('should create user profile document with correct structure', async () => {
      mockAuth.getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' });
      mockAuth.createUser.mockResolvedValue({ uid: 'test-uid' });

      const mockSet = jest.fn();
      const mockDoc = jest.fn(() => ({ set: mockSet }));
      const mockCollection = jest.fn(() => ({ doc: mockDoc }));
      mockDb.collection = mockCollection;

      await seedUsers({ scenario: 'beginner' });

      expect(mockCollection).toHaveBeenCalledWith('users');
      expect(mockDoc).toHaveBeenCalledWith('test-uid');
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Alex Beginner',
          experienceLevel: 'beginner',
          goals: ['strength', 'muscle_gain'],
          preferredUnits: 'LB',
          createdAt: expect.any(Date),
          isActive: true,
          settings: expect.objectContaining({
            notifications: true,
            publicProfile: false,
            shareProgress: false
          })
        })
      );
    });

    test('should handle auth creation errors', async () => {
      mockAuth.getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' });
      mockAuth.createUser.mockRejectedValue(new Error('Auth creation failed'));

      await expect(seedUsers({ scenario: 'beginner' }))
        .rejects.toThrow('Failed to create Auth user: Auth creation failed');
    });

    test('should handle firestore creation errors', async () => {
      mockAuth.getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' });
      mockAuth.createUser.mockResolvedValue({ uid: 'test-uid' });
      mockDb.collection().doc().set.mockRejectedValue(new Error('Firestore error'));

      await expect(seedUsers({ scenario: 'beginner' }))
        .rejects.toThrow('Failed to create user profile: Firestore error');
    });

    test('should skip invalid scenarios', async () => {
      const result = await seedUsers({ scenario: 'invalid' });

      expect(result).toHaveLength(0);
      expect(mockAuth.createUser).not.toHaveBeenCalled();
    });
  });

  describe('USER_SCENARIOS structure', () => {
    test('should have consistent structure across all scenarios', () => {
      Object.keys(USER_SCENARIOS).forEach(scenarioName => {
        const scenario = USER_SCENARIOS[scenarioName];

        // Check required fields
        expect(scenario).toHaveProperty('email');
        expect(scenario).toHaveProperty('password');
        expect(scenario).toHaveProperty('profile');

        // Check profile structure
        expect(scenario.profile).toHaveProperty('name');
        expect(scenario.profile).toHaveProperty('experienceLevel');
        expect(scenario.profile).toHaveProperty('goals');
        expect(scenario.profile).toHaveProperty('preferredUnits');
        expect(scenario.profile).toHaveProperty('preferences');

        // Validate data types
        expect(typeof scenario.email).toBe('string');
        expect(typeof scenario.password).toBe('string');
        expect(typeof scenario.profile.name).toBe('string');
        expect(Array.isArray(scenario.profile.goals)).toBe(true);
        expect(typeof scenario.profile.preferences).toBe('object');
      });
    });

    test('should have unique emails for each scenario', () => {
      const emails = Object.values(USER_SCENARIOS).map(s => s.email);
      const uniqueEmails = [...new Set(emails)];

      expect(emails.length).toBe(uniqueEmails.length);
    });

    test('should have realistic experience levels', () => {
      const validLevels = ['beginner', 'intermediate', 'advanced'];

      Object.values(USER_SCENARIOS).forEach(scenario => {
        expect(validLevels).toContain(scenario.profile.experienceLevel);
      });
    });
  });
});