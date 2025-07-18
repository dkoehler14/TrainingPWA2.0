/**
 * Tests for scenario configuration module
 */

const {
  USER_SCENARIOS,
  SCENARIO_GROUPS,
  getScenario,
  getScenarios,
  getScenarioGroup,
  validateScenarios,
  getSeedingConfig,
  getAvailableOptions
} = require('../scenarios');

describe('Scenario Configuration', () => {
  describe('USER_SCENARIOS', () => {
    test('should contain all expected scenarios', () => {
      const expectedScenarios = ['beginner', 'intermediate', 'advanced', 'returning', 'injury_recovery', 'busy_professional'];
      expectedScenarios.forEach(scenario => {
        expect(USER_SCENARIOS[scenario]).toBeDefined();
      });
    });

    test('should have consistent structure for all scenarios', () => {
      Object.values(USER_SCENARIOS).forEach(scenario => {
        expect(scenario).toHaveProperty('id');
        expect(scenario).toHaveProperty('name');
        expect(scenario).toHaveProperty('description');
        expect(scenario).toHaveProperty('email');
        expect(scenario).toHaveProperty('password');
        expect(scenario).toHaveProperty('profile');
        expect(scenario).toHaveProperty('dataPatterns');
        
        // Profile structure
        expect(scenario.profile).toHaveProperty('name');
        expect(scenario.profile).toHaveProperty('experienceLevel');
        expect(scenario.profile).toHaveProperty('goals');
        expect(scenario.profile).toHaveProperty('preferredUnits');
        
        // Data patterns structure
        expect(scenario.dataPatterns).toHaveProperty('workoutConsistency');
        expect(scenario.dataPatterns).toHaveProperty('progressionRate');
        expect(scenario.dataPatterns).toHaveProperty('historyWeeks');
      });
    });

    test('should have unique emails for all scenarios', () => {
      const emails = Object.values(USER_SCENARIOS).map(s => s.email);
      const uniqueEmails = [...new Set(emails)];
      expect(emails.length).toBe(uniqueEmails.length);
    });
  });

  describe('SCENARIO_GROUPS', () => {
    test('should contain expected groups', () => {
      expect(SCENARIO_GROUPS).toHaveProperty('basic');
      expect(SCENARIO_GROUPS).toHaveProperty('extended');
      expect(SCENARIO_GROUPS).toHaveProperty('comprehensive');
      expect(SCENARIO_GROUPS).toHaveProperty('all');
    });

    test('should have valid scenario IDs in groups', () => {
      Object.values(SCENARIO_GROUPS).forEach(group => {
        group.forEach(scenarioId => {
          expect(USER_SCENARIOS[scenarioId]).toBeDefined();
        });
      });
    });

    test('basic group should contain core scenarios', () => {
      expect(SCENARIO_GROUPS.basic).toEqual(['beginner', 'intermediate', 'advanced']);
    });

    test('all group should contain all scenarios', () => {
      const allScenarioIds = Object.keys(USER_SCENARIOS);
      expect(SCENARIO_GROUPS.all).toEqual(allScenarioIds);
    });
  });

  describe('getScenario', () => {
    test('should return scenario for valid ID', () => {
      const scenario = getScenario('beginner');
      expect(scenario).toBeDefined();
      expect(scenario.id).toBe('beginner');
    });

    test('should return null for invalid ID', () => {
      const scenario = getScenario('invalid');
      expect(scenario).toBeNull();
    });
  });

  describe('getScenarios', () => {
    test('should return array of scenarios for valid IDs', () => {
      const scenarios = getScenarios(['beginner', 'intermediate']);
      expect(scenarios).toHaveLength(2);
      expect(scenarios[0].id).toBe('beginner');
      expect(scenarios[1].id).toBe('intermediate');
    });

    test('should filter out invalid IDs', () => {
      const scenarios = getScenarios(['beginner', 'invalid', 'intermediate']);
      expect(scenarios).toHaveLength(2);
    });

    test('should return empty array for all invalid IDs', () => {
      const scenarios = getScenarios(['invalid1', 'invalid2']);
      expect(scenarios).toHaveLength(0);
    });
  });

  describe('getScenarioGroup', () => {
    test('should return scenario IDs for valid group', () => {
      const group = getScenarioGroup('basic');
      expect(group).toEqual(['beginner', 'intermediate', 'advanced']);
    });

    test('should return empty array for invalid group', () => {
      const group = getScenarioGroup('invalid');
      expect(group).toEqual([]);
    });
  });

  describe('validateScenarios', () => {
    test('should validate single valid scenario', () => {
      const result = validateScenarios('beginner');
      expect(result.isValid).toBe(true);
      expect(result.valid).toEqual(['beginner']);
      expect(result.invalid).toEqual([]);
    });

    test('should validate array of valid scenarios', () => {
      const result = validateScenarios(['beginner', 'intermediate']);
      expect(result.isValid).toBe(true);
      expect(result.valid).toEqual(['beginner', 'intermediate']);
      expect(result.invalid).toEqual([]);
    });

    test('should validate scenario groups', () => {
      const result = validateScenarios('basic');
      expect(result.isValid).toBe(true);
      expect(result.valid).toEqual(['beginner', 'intermediate', 'advanced']);
    });

    test('should handle "all" keyword', () => {
      const result = validateScenarios('all');
      expect(result.isValid).toBe(true);
      expect(result.valid).toEqual(Object.keys(USER_SCENARIOS));
    });

    test('should identify invalid scenarios', () => {
      const result = validateScenarios(['beginner', 'invalid']);
      expect(result.isValid).toBe(false);
      expect(result.valid).toEqual(['beginner']);
      expect(result.invalid).toEqual(['invalid']);
    });

    test('should remove duplicates', () => {
      const result = validateScenarios(['beginner', 'beginner', 'intermediate']);
      expect(result.isValid).toBe(true);
      expect(result.valid).toEqual(['beginner', 'intermediate']);
    });
  });

  describe('getSeedingConfig', () => {
    test('should return complete config for valid scenarios', () => {
      const config = getSeedingConfig('basic');
      expect(config).toHaveProperty('scenarios');
      expect(config).toHaveProperty('scenarioConfigs');
      expect(config).toHaveProperty('totalUsers');
      expect(config.scenarios).toEqual(['beginner', 'intermediate', 'advanced']);
      expect(config.totalUsers).toBe(3);
    });

    test('should throw error for invalid scenarios', () => {
      expect(() => {
        getSeedingConfig('invalid');
      }).toThrow('Invalid scenarios: invalid');
    });

    test('should merge options correctly', () => {
      const config = getSeedingConfig('basic', { verbose: true, includeHistoricalData: false });
      expect(config.verbose).toBe(true);
      expect(config.includeHistoricalData).toBe(false);
    });
  });

  describe('getAvailableOptions', () => {
    test('should return scenarios and groups', () => {
      const options = getAvailableOptions();
      expect(options).toHaveProperty('scenarios');
      expect(options).toHaveProperty('groups');
      expect(Array.isArray(options.scenarios)).toBe(true);
      expect(Array.isArray(options.groups)).toBe(true);
    });

    test('should include scenario details', () => {
      const options = getAvailableOptions();
      options.scenarios.forEach(scenario => {
        expect(scenario).toHaveProperty('id');
        expect(scenario).toHaveProperty('name');
        expect(scenario).toHaveProperty('description');
      });
    });

    test('should include group details', () => {
      const options = getAvailableOptions();
      options.groups.forEach(group => {
        expect(group).toHaveProperty('id');
        expect(group).toHaveProperty('scenarios');
        expect(group).toHaveProperty('count');
        expect(Array.isArray(group.scenarios)).toBe(true);
      });
    });
  });

  describe('Data Pattern Validation', () => {
    test('should have realistic data patterns', () => {
      Object.values(USER_SCENARIOS).forEach(scenario => {
        const patterns = scenario.dataPatterns;
        
        // Workout consistency should be between 0 and 1
        expect(patterns.workoutConsistency).toBeGreaterThan(0);
        expect(patterns.workoutConsistency).toBeLessThanOrEqual(1);
        
        // Progression rate should be positive and reasonable
        expect(patterns.progressionRate).toBeGreaterThan(0);
        expect(patterns.progressionRate).toBeLessThan(0.1); // Less than 10% per week
        
        // History weeks should be reasonable
        expect(patterns.historyWeeks).toBeGreaterThan(0);
        expect(patterns.historyWeeks).toBeLessThan(52); // Less than a year
        
        // Plateau frequency should be between 0 and 1
        expect(patterns.plateauFrequency).toBeGreaterThanOrEqual(0);
        expect(patterns.plateauFrequency).toBeLessThanOrEqual(1);
      });
    });

    test('should have different patterns for different experience levels', () => {
      const beginner = USER_SCENARIOS.beginner.dataPatterns;
      const advanced = USER_SCENARIOS.advanced.dataPatterns;
      
      // Advanced users should have higher consistency
      expect(advanced.workoutConsistency).toBeGreaterThan(beginner.workoutConsistency);
      
      // Beginners should have faster progression
      expect(beginner.progressionRate).toBeGreaterThan(advanced.progressionRate);
      
      // Advanced users should have more history
      expect(advanced.historyWeeks).toBeGreaterThan(beginner.historyWeeks);
    });
  });
});