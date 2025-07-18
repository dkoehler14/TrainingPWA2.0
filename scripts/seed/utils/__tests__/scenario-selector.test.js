/**
 * Tests for scenario selector utility
 */

const {
  parseScenarioArgs,
  prepareScenarioConfig,
  validateWithSuggestions
} = require('../scenario-selector');

describe('Scenario Selector Utility', () => {
  describe('parseScenarioArgs', () => {
    test('should parse basic scenario argument', () => {
      const args = ['--scenarios=basic'];
      const config = parseScenarioArgs(args);
      expect(config.scenarios).toBe('basic');
      expect(config.verbose).toBe(false);
      expect(config.includeHistoricalData).toBe(true);
    });

    test('should parse comma-separated scenarios', () => {
      const args = ['--scenarios=beginner,intermediate,advanced'];
      const config = parseScenarioArgs(args);
      expect(config.scenarios).toEqual(['beginner', 'intermediate', 'advanced']);
    });

    test('should parse verbose flag', () => {
      const args = ['--verbose'];
      const config = parseScenarioArgs(args);
      expect(config.verbose).toBe(true);
    });

    test('should parse short verbose flag', () => {
      const args = ['-v'];
      const config = parseScenarioArgs(args);
      expect(config.verbose).toBe(true);
    });

    test('should parse no-history flag', () => {
      const args = ['--no-history'];
      const config = parseScenarioArgs(args);
      expect(config.includeHistoricalData).toBe(false);
    });

    test('should parse help flag', () => {
      const args = ['--help'];
      const config = parseScenarioArgs(args);
      expect(config.help).toBe(true);
    });

    test('should parse short help flag', () => {
      const args = ['-h'];
      const config = parseScenarioArgs(args);
      expect(config.help).toBe(true);
    });

    test('should parse multiple flags', () => {
      const args = ['--scenarios=comprehensive', '--verbose', '--no-history'];
      const config = parseScenarioArgs(args);
      expect(config.scenarios).toBe('comprehensive');
      expect(config.verbose).toBe(true);
      expect(config.includeHistoricalData).toBe(false);
    });

    test('should use defaults for no arguments', () => {
      const args = [];
      const config = parseScenarioArgs(args);
      expect(config.scenarios).toBe('basic');
      expect(config.verbose).toBe(false);
      expect(config.includeHistoricalData).toBe(true);
      expect(config.help).toBe(false);
    });
  });

  describe('prepareScenarioConfig', () => {
    test('should prepare valid scenario configuration', () => {
      const config = prepareScenarioConfig('basic');
      expect(config).toHaveProperty('scenarios');
      expect(config).toHaveProperty('scenarioConfigs');
      expect(config).toHaveProperty('totalUsers');
      expect(config).toHaveProperty('validation');
      expect(config.validation.isValid).toBe(true);
    });

    test('should throw error for invalid scenarios', () => {
      expect(() => {
        prepareScenarioConfig('invalid');
      }).toThrow('Scenario configuration error');
    });

    test('should merge options correctly', () => {
      const config = prepareScenarioConfig('basic', { verbose: true });
      expect(config.verbose).toBe(true);
    });

    test('should handle array of scenarios', () => {
      const config = prepareScenarioConfig(['beginner', 'intermediate']);
      expect(config.scenarios).toEqual(['beginner', 'intermediate']);
      expect(config.totalUsers).toBe(2);
    });
  });

  describe('validateWithSuggestions', () => {
    test('should validate correct scenarios', () => {
      const result = validateWithSuggestions('basic');
      expect(result.isValid).toBe(true);
      expect(result.valid).toEqual(['beginner', 'intermediate', 'advanced']);
    });

    test('should provide suggestions for invalid scenarios', () => {
      const result = validateWithSuggestions('begin'); // Partial match
      expect(result.isValid).toBe(false);
      expect(result.suggestions).toBeDefined();
      expect(result.availableScenarios).toBeDefined();
      expect(result.availableGroups).toBeDefined();
    });

    test('should handle completely invalid scenarios', () => {
      const result = validateWithSuggestions('completely_invalid');
      expect(result.isValid).toBe(false);
      expect(result.invalid).toContain('completely_invalid');
    });

    test('should handle mixed valid and invalid scenarios', () => {
      const result = validateWithSuggestions(['beginner', 'invalid']);
      expect(result.isValid).toBe(false);
      expect(result.valid).toContain('beginner');
      expect(result.invalid).toContain('invalid');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete CLI workflow', () => {
      // Simulate CLI arguments
      const args = ['--scenarios=basic', '--verbose'];
      const parsedConfig = parseScenarioArgs(args);
      
      // Prepare configuration
      const scenarioConfig = prepareScenarioConfig(parsedConfig.scenarios, {
        verbose: parsedConfig.verbose,
        includeHistoricalData: parsedConfig.includeHistoricalData
      });
      
      expect(scenarioConfig.scenarios).toEqual(['beginner', 'intermediate', 'advanced']);
      expect(scenarioConfig.verbose).toBe(true);
      expect(scenarioConfig.totalUsers).toBe(3);
      expect(scenarioConfig.scenarioConfigs).toHaveLength(3);
    });

    test('should handle comprehensive scenario selection', () => {
      const args = ['--scenarios=comprehensive', '--no-history'];
      const parsedConfig = parseScenarioArgs(args);
      const scenarioConfig = prepareScenarioConfig(parsedConfig.scenarios, {
        includeHistoricalData: parsedConfig.includeHistoricalData
      });
      
      expect(scenarioConfig.scenarios).toHaveLength(6); // All comprehensive scenarios
      expect(scenarioConfig.includeHistoricalData).toBe(false);
      expect(scenarioConfig.totalUsers).toBe(6);
    });

    test('should handle individual scenario selection', () => {
      const args = ['--scenarios=beginner,returning'];
      const parsedConfig = parseScenarioArgs(args);
      const scenarioConfig = prepareScenarioConfig(parsedConfig.scenarios);
      
      expect(scenarioConfig.scenarios).toEqual(['beginner', 'returning']);
      expect(scenarioConfig.totalUsers).toBe(2);
      
      // Verify scenario configs
      const scenarioNames = scenarioConfig.scenarioConfigs.map(s => s.id);
      expect(scenarioNames).toContain('beginner');
      expect(scenarioNames).toContain('returning');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed scenario arguments', () => {
      const args = ['--scenarios='];
      const parsedConfig = parseScenarioArgs(args);
      
      expect(() => {
        prepareScenarioConfig(parsedConfig.scenarios);
      }).toThrow();
    });

    test('should handle empty scenario arrays', () => {
      expect(() => {
        prepareScenarioConfig([]);
      }).toThrow();
    });

    test('should provide helpful error messages', () => {
      try {
        prepareScenarioConfig('invalid_scenario');
      } catch (error) {
        expect(error.message).toContain('Scenario configuration error');
        expect(error.message).toContain('invalid_scenario');
      }
    });
  });
});