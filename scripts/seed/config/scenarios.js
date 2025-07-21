/**
 * Scenario-based seeding configuration
 * 
 * This module defines different user personas and scenarios for test data seeding.
 * Each scenario represents a realistic user journey with specific data patterns.
 */

/**
 * User persona scenarios with detailed characteristics
 */
const USER_SCENARIOS = {
  // Complete beginner - just starting their fitness journey
  beginner: {
    id: 'beginner',
    name: 'Complete Beginner',
    description: 'New to weightlifting, learning basic movements',
    email: 'beginner@test.com',
    password: 'test123',
    profile: {
      name: 'Alex Beginner',
      experienceLevel: 'beginner',
      goals: ['strength', 'muscle_gain'],
      preferredUnits: 'LB',
      age: 25,
      weight: 150,
      height: 68, // inches
      fitnessBackground: 'New to weightlifting, looking to build strength and muscle',
      workoutFrequency: 3, // days per week
      availableEquipment: ['barbell', 'dumbbells', 'bench'],
      injuries: [],
      preferences: {
        workoutDuration: 60, // minutes
        restDayPreference: 'active_recovery',
        trainingStyle: 'structured'
      }
    },
    dataPatterns: {
      workoutConsistency: 0.75, // 75% workout completion rate
      progressionRate: 0.03, // 3% weight increase per week (faster beginner gains)
      plateauFrequency: 0.1, // 10% chance of plateau
      formIssues: 0.3, // 30% chance of form-related missed reps
      motivationDips: 0.2, // 20% chance of motivation-related missed workouts
      programAdherence: 0.9, // 90% adherence to prescribed program
      historyWeeks: 8, // 8 weeks of workout history
      quickWorkouts: {
        frequency: 2, // 2 quick workouts per week
        consistency: 0.6, // 60% completion rate (lower than structured workouts)
        averageDuration: 15, // 15 minutes average
        preferredTypes: ['upper_body', 'core'], // beginner-friendly focus areas
        progressionRate: 0.02, // 2% weight increase (conservative for quick sessions)
        restBetweenSets: 60 // 60 seconds rest (learning proper recovery)
      }
    }
  },

  // Intermediate lifter with some experience
  intermediate: {
    id: 'intermediate',
    name: 'Intermediate Lifter',
    description: 'Experienced with basics, working on progression',
    email: 'intermediate@test.com',
    password: 'test123',
    profile: {
      name: 'Jordan Intermediate',
      experienceLevel: 'intermediate',
      goals: ['strength', 'powerlifting'],
      preferredUnits: 'LB',
      age: 28,
      weight: 175,
      height: 70, // inches
      fitnessBackground: '2 years of consistent training, familiar with compound movements',
      workoutFrequency: 4, // days per week
      availableEquipment: ['barbell', 'dumbbells', 'bench', 'squat_rack', 'plates'],
      injuries: [],
      preferences: {
        workoutDuration: 75, // minutes
        restDayPreference: 'complete_rest',
        trainingStyle: 'progressive_overload'
      }
    },
    dataPatterns: {
      workoutConsistency: 0.85, // 85% workout completion rate
      progressionRate: 0.02, // 2% weight increase per week
      plateauFrequency: 0.15, // 15% chance of plateau/deload
      formIssues: 0.1, // 10% chance of form-related issues
      motivationDips: 0.1, // 10% chance of motivation issues
      programAdherence: 0.95, // 95% adherence to prescribed program
      historyWeeks: 16, // 16 weeks of workout history
      quickWorkouts: {
        frequency: 3, // 3 quick workouts per week
        consistency: 0.8, // 80% completion rate (good consistency)
        averageDuration: 20, // 20 minutes average
        preferredTypes: ['full_body', 'upper_body', 'lower_body'], // varied focus
        progressionRate: 0.025, // 2.5% weight increase (confident progression)
        restBetweenSets: 45 // 45 seconds rest (efficient recovery)
      }
    }
  },

  // Advanced competitive lifter
  advanced: {
    id: 'advanced',
    name: 'Advanced Competitor',
    description: 'Competitive powerlifter with extensive experience',
    email: 'advanced@test.com',
    password: 'test123',
    profile: {
      name: 'Casey Advanced',
      experienceLevel: 'advanced',
      goals: ['competition', 'strength'],
      preferredUnits: 'KG',
      age: 32,
      weight: 185,
      height: 72, // inches
      fitnessBackground: '5+ years of training, competitive powerlifter',
      workoutFrequency: 5, // days per week
      availableEquipment: ['barbell', 'dumbbells', 'bench', 'squat_rack', 'plates', 'specialty_bars'],
      injuries: ['lower_back_history'],
      preferences: {
        workoutDuration: 90, // minutes
        restDayPreference: 'active_recovery',
        trainingStyle: 'periodization'
      }
    },
    dataPatterns: {
      workoutConsistency: 0.95, // 95% workout completion rate
      progressionRate: 0.01, // 1% weight increase per week (slower advanced gains)
      plateauFrequency: 0.25, // 25% chance of plateau/deload (more strategic)
      formIssues: 0.05, // 5% chance of form issues
      motivationDips: 0.05, // 5% chance of motivation issues
      programAdherence: 0.98, // 98% adherence to prescribed program
      historyWeeks: 24, // 24 weeks of workout history
      quickWorkouts: {
        frequency: 4, // 4 quick workouts per week (high volume)
        consistency: 0.9, // 90% completion rate (very consistent)
        averageDuration: 25, // 25 minutes average (longer, more complex)
        preferredTypes: ['accessory', 'weak_points', 'mobility'], // targeted work
        progressionRate: 0.015, // 1.5% weight increase (conservative, focused)
        restBetweenSets: 30 // 30 seconds rest (efficient, conditioned)
      }
    }
  },

  // Returning lifter after a break
  returning: {
    id: 'returning',
    name: 'Returning Lifter',
    description: 'Experienced lifter returning after a break',
    email: 'returning@test.com',
    password: 'test123',
    profile: {
      name: 'Sam Returning',
      experienceLevel: 'intermediate',
      goals: ['strength', 'muscle_gain', 'general_fitness'],
      preferredUnits: 'LB',
      age: 30,
      weight: 165,
      height: 69, // inches
      fitnessBackground: 'Previously trained for 3 years, took 6 months off, now returning',
      workoutFrequency: 3, // days per week (starting conservative)
      availableEquipment: ['barbell', 'dumbbells', 'bench', 'squat_rack'],
      injuries: [],
      preferences: {
        workoutDuration: 60, // minutes
        restDayPreference: 'active_recovery',
        trainingStyle: 'gradual_progression'
      }
    },
    dataPatterns: {
      workoutConsistency: 0.8, // 80% workout completion rate (rebuilding habit)
      progressionRate: 0.025, // 2.5% weight increase per week (muscle memory)
      plateauFrequency: 0.12, // 12% chance of plateau
      formIssues: 0.15, // 15% chance of form issues (relearning)
      motivationDips: 0.15, // 15% chance of motivation issues
      programAdherence: 0.85, // 85% adherence (still building routine)
      historyWeeks: 12, // 12 weeks of comeback history
      quickWorkouts: {
        frequency: 2, // 2 quick workouts per week (rebuilding gradually)
        consistency: 0.7, // 70% completion rate (rebuilding habit)
        averageDuration: 18, // 18 minutes average (moderate sessions)
        preferredTypes: ['full_body', 'core'], // rebuilding foundation
        progressionRate: 0.02, // 2% weight increase (cautious comeback)
        restBetweenSets: 75 // 75 seconds rest (allowing more recovery)
      }
    }
  },

  // Athlete with injury limitations
  injury_recovery: {
    id: 'injury_recovery',
    name: 'Injury Recovery',
    description: 'Lifter working around injury limitations',
    email: 'recovery@test.com',
    password: 'test123',
    profile: {
      name: 'Taylor Recovery',
      experienceLevel: 'intermediate',
      goals: ['injury_prevention', 'strength', 'mobility'],
      preferredUnits: 'LB',
      age: 35,
      weight: 170,
      height: 67, // inches
      fitnessBackground: 'Experienced lifter working around shoulder injury',
      workoutFrequency: 4, // days per week
      availableEquipment: ['dumbbells', 'cables', 'machines', 'resistance_bands'],
      injuries: ['shoulder_impingement', 'lower_back_history'],
      preferences: {
        workoutDuration: 70, // minutes (more warm-up/mobility)
        restDayPreference: 'active_recovery',
        trainingStyle: 'injury_prevention'
      }
    },
    dataPatterns: {
      workoutConsistency: 0.9, // 90% workout completion rate (very consistent for recovery)
      progressionRate: 0.015, // 1.5% weight increase per week (conservative)
      plateauFrequency: 0.2, // 20% chance of plateau (working around limitations)
      formIssues: 0.05, // 5% chance of form issues (very careful)
      motivationDips: 0.1, // 10% chance of motivation issues
      programAdherence: 0.95, // 95% adherence (following rehab protocol)
      historyWeeks: 20, // 20 weeks of recovery-focused training
      quickWorkouts: {
        frequency: 3, // 3 quick workouts per week (consistent rehab)
        consistency: 0.85, // 85% completion rate (disciplined recovery)
        averageDuration: 22, // 22 minutes average (includes mobility work)
        preferredTypes: ['mobility', 'core', 'rehab'], // injury-focused work
        progressionRate: 0.01, // 1% weight increase (very conservative)
        restBetweenSets: 90 // 90 seconds rest (prioritizing recovery)
      }
    }
  },

  // Busy professional with limited time
  busy_professional: {
    id: 'busy_professional',
    name: 'Busy Professional',
    description: 'Time-constrained professional seeking efficiency',
    email: 'professional@test.com',
    password: 'test123',
    profile: {
      name: 'Morgan Professional',
      experienceLevel: 'intermediate',
      goals: ['general_fitness', 'strength', 'time_efficiency'],
      preferredUnits: 'LB',
      age: 29,
      weight: 160,
      height: 66, // inches
      fitnessBackground: 'Busy professional, needs efficient workouts',
      workoutFrequency: 3, // days per week (time limited)
      availableEquipment: ['barbell', 'dumbbells', 'bench'],
      injuries: [],
      preferences: {
        workoutDuration: 45, // minutes (time constrained)
        restDayPreference: 'complete_rest',
        trainingStyle: 'time_efficient'
      }
    },
    dataPatterns: {
      workoutConsistency: 0.7, // 70% workout completion rate (busy schedule)
      progressionRate: 0.02, // 2% weight increase per week
      plateauFrequency: 0.18, // 18% chance of plateau (inconsistent training)
      formIssues: 0.12, // 12% chance of form issues (rushing)
      motivationDips: 0.25, // 25% chance of motivation issues (stress/time)
      programAdherence: 0.8, // 80% adherence (modifications for time)
      historyWeeks: 14, // 14 weeks of on-and-off training
      quickWorkouts: {
        frequency: 4, // 4 quick workouts per week (fits busy schedule)
        consistency: 0.75, // 75% completion rate (better than full workouts)
        averageDuration: 12, // 12 minutes average (very time-efficient)
        preferredTypes: ['hiit', 'core', 'upper_body'], // efficient, targeted work
        progressionRate: 0.015, // 1.5% weight increase (limited by time)
        restBetweenSets: 30 // 30 seconds rest (time-efficient)
      }
    }
  }
};

/**
 * Scenario groups for easy selection
 */
const SCENARIO_GROUPS = {
  basic: ['beginner', 'intermediate', 'advanced'],
  extended: ['beginner', 'intermediate', 'advanced', 'returning', 'injury_recovery'],
  comprehensive: ['beginner', 'intermediate', 'advanced', 'returning', 'injury_recovery', 'busy_professional'],
  all: Object.keys(USER_SCENARIOS)
};

/**
 * Default seeding configuration
 */
const DEFAULT_CONFIG = {
  scenarios: SCENARIO_GROUPS.basic,
  includeHistoricalData: true,
  generateRealisticProgression: true,
  includeVariations: true,
  verbose: false
};

/**
 * Get scenario configuration by ID
 * @param {string} scenarioId - Scenario identifier
 * @returns {Object|null} Scenario configuration or null if not found
 */
function getScenario(scenarioId) {
  return USER_SCENARIOS[scenarioId] || null;
}

/**
 * Get multiple scenarios by IDs
 * @param {Array<string>} scenarioIds - Array of scenario identifiers
 * @returns {Array<Object>} Array of scenario configurations
 */
function getScenarios(scenarioIds) {
  return scenarioIds
    .map(id => getScenario(id))
    .filter(scenario => scenario !== null);
}

/**
 * Get scenario group by name
 * @param {string} groupName - Group name (basic, extended, comprehensive, all)
 * @returns {Array<string>} Array of scenario IDs
 */
function getScenarioGroup(groupName) {
  return SCENARIO_GROUPS[groupName] || [];
}

/**
 * Validate scenario configuration
 * @param {string|Array<string>} scenarios - Scenario ID(s) to validate
 * @returns {Object} Validation result with valid/invalid scenarios
 */
function validateScenarios(scenarios) {
  const scenarioArray = Array.isArray(scenarios) ? scenarios : [scenarios];
  
  // Handle empty arrays
  if (scenarioArray.length === 0) {
    return {
      valid: [],
      invalid: [],
      isValid: false,
      isEmpty: true
    };
  }
  
  const valid = [];
  const invalid = [];

  scenarioArray.forEach(scenarioId => {
    if (scenarioId === 'all') {
      valid.push(...Object.keys(USER_SCENARIOS));
    } else if (SCENARIO_GROUPS[scenarioId]) {
      valid.push(...SCENARIO_GROUPS[scenarioId]);
    } else if (USER_SCENARIOS[scenarioId]) {
      valid.push(scenarioId);
    } else {
      invalid.push(scenarioId);
    }
  });

  return {
    valid: [...new Set(valid)], // Remove duplicates
    invalid,
    isValid: invalid.length === 0 && valid.length > 0
  };
}

/**
 * Get seeding configuration for scenarios
 * @param {string|Array<string>} scenarios - Scenario selection
 * @param {Object} options - Additional options
 * @returns {Object} Complete seeding configuration
 */
function getSeedingConfig(scenarios = 'basic', options = {}) {
  const validation = validateScenarios(scenarios);
  
  if (!validation.isValid) {
    if (validation.isEmpty) {
      throw new Error('No scenarios specified');
    }
    throw new Error(`Invalid scenarios: ${validation.invalid.join(', ')}`);
  }

  const scenarioConfigs = getScenarios(validation.valid);
  
  return {
    ...DEFAULT_CONFIG,
    ...options,
    scenarios: validation.valid,
    scenarioConfigs,
    totalUsers: scenarioConfigs.length
  };
}

/**
 * Get available scenario options for CLI/UI
 * @returns {Object} Available options with descriptions
 */
function getAvailableOptions() {
  return {
    scenarios: Object.keys(USER_SCENARIOS).map(id => ({
      id,
      name: USER_SCENARIOS[id].name,
      description: USER_SCENARIOS[id].description
    })),
    groups: Object.keys(SCENARIO_GROUPS).map(groupName => ({
      id: groupName,
      scenarios: SCENARIO_GROUPS[groupName],
      count: SCENARIO_GROUPS[groupName].length
    }))
  };
}

module.exports = {
  USER_SCENARIOS,
  SCENARIO_GROUPS,
  DEFAULT_CONFIG,
  getScenario,
  getScenarios,
  getScenarioGroup,
  validateScenarios,
  getSeedingConfig,
  getAvailableOptions
};