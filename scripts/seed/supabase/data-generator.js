#!/usr/bin/env node

/**
 * Advanced Data Generation Tool for Supabase
 * 
 * This tool provides sophisticated data generation capabilities for development
 * and testing, including realistic user scenarios, progressive workout data,
 * and comprehensive analytics.
 */

const { getSupabaseClient } = require('../utils/supabase-helpers');
const { logProgress, logSection, logSummary } = require('../utils/logger');

/**
 * Generate comprehensive test data with advanced scenarios
 */
async function generateAdvancedTestData(options = {}) {
  const {
    userCount = 10,
    weeksOfHistory = 8,
    includeVariations = true,
    generateAnalytics = true,
    verbose = false
  } = options;
  
  const supabase = getSupabaseClient();
  const startTime = Date.now();
  
  if (verbose) {
    logSection('Advanced Test Data Generation');
    logProgress(`Generating data for ${userCount} users with ${weeksOfHistory} weeks of history`, 'info');
  }
  
  try {
    // Step 1: Generate diverse user profiles
    const users = await generateDiverseUsers(supabase, userCount, { verbose });
    
    // Step 2: Create varied programs for each user
    const programs = await generateVariedPrograms(supabase, users, { verbose, includeVariations });
    
    // Step 3: Generate realistic workout history with progression
    const workoutLogs = await generateRealisticWorkoutHistory(
      supabase, 
      users, 
      programs, 
      weeksOfHistory, 
      { verbose }
    );
    
    // Step 4: Generate analytics if requested
    let analytics = [];
    if (generateAnalytics) {
      analytics = await generateComprehensiveAnalytics(supabase, users, workoutLogs, { verbose });
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    return {
      success: true,
      summary: {
        users: users.length,
        programs: programs.length,
        workoutLogs: workoutLogs.length,
        analytics: analytics.length,
        duration
      },
      data: {
        users,
        programs,
        workoutLogs,
        analytics
      }
    };
  } catch (error) {
    console.error('Error generating advanced test data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate diverse user profiles with realistic variations
 */
async function generateDiverseUsers(supabase, count, options = {}) {
  const { verbose = false } = options;
  
  if (verbose) {
    logProgress('Generating diverse user profiles...', 'info');
  }
  
  const users = [];
  const experienceLevels = ['beginner', 'intermediate', 'advanced'];
  const units = ['LB', 'KG'];
  const goals = [
    ['Build Muscle', 'Get Stronger'],
    ['Lose Weight', 'Build Muscle'],
    ['Improve Endurance', 'Build Muscle'],
    ['Get Stronger', 'Compete'],
    ['Build Muscle', 'Cut Fat'],
    ['Improve Performance', 'Build Muscle']
  ];
  
  const equipmentSets = [
    ['Dumbbells', 'Resistance Bands'],
    ['Dumbbells', 'Barbell', 'Bench'],
    ['Dumbbells', 'Barbell', 'Bench', 'Pull-up Bar'],
    ['Dumbbells', 'Barbell', 'Bench', 'Pull-up Bar', 'Squat Rack'],
    ['Dumbbells', 'Barbell', 'Bench', 'Squat Rack', 'Cable Machine'],
    ['Full Gym Access']
  ];
  
  for (let i = 0; i < count; i++) {
    const experienceLevel = experienceLevels[Math.floor(Math.random() * experienceLevels.length)];
    const preferredUnits = units[Math.floor(Math.random() * units.length)];
    const userGoals = goals[Math.floor(Math.random() * goals.length)];
    const equipment = equipmentSets[Math.floor(Math.random() * equipmentSets.length)];
    
    // Generate realistic physical stats based on experience level
    const { age, weight, height } = generatePhysicalStats(experienceLevel, preferredUnits);
    
    const userData = {
      id: generateUUID(),
      auth_id: generateUUID(),
      email: `user${i + 1}@example.com`,
      name: `Test User ${i + 1}`,
      experience_level: experienceLevel,
      preferred_units: preferredUnits,
      age,
      weight,
      height,
      goals: userGoals,
      available_equipment: equipment,
      injuries: generateRandomInjuries(),
      preferences: generateUserPreferences(),
      settings: generateUserSettings()
    };
    
    try {
      const { data: user, error } = await supabase
        .from('users')
        .upsert(userData)
        .select()
        .single();
      
      if (error) {
        console.warn(`Warning: Could not create user ${userData.email}: ${error.message}`);
        continue;
      }
      
      users.push(user);
      
      if (verbose && (i + 1) % 5 === 0) {
        logProgress(`  Created ${i + 1}/${count} users`, 'info');
      }
    } catch (error) {
      console.warn(`Warning: Error creating user ${userData.email}:`, error.message);
    }
  }
  
  return users;
}

/**
 * Generate varied programs for users
 */
async function generateVariedPrograms(supabase, users, options = {}) {
  const { verbose = false, includeVariations = true } = options;
  
  if (verbose) {
    logProgress('Generating varied programs...', 'info');
  }
  
  const programs = [];
  
  for (const user of users) {
    const userPrograms = await createProgramsForUserLevel(supabase, user, { includeVariations });
    programs.push(...userPrograms);
    
    if (verbose) {
      logProgress(`  Created ${userPrograms.length} programs for ${user.name}`, 'info');
    }
  }
  
  return programs;
}

/**
 * Create programs based on user experience level
 */
async function createProgramsForUserLevel(supabase, user, options = {}) {
  const { includeVariations = true } = options;
  
  const programTemplates = getProgramTemplatesForExperience(user.experience_level, user);
  const programs = [];
  
  // Create main program
  const mainProgram = programTemplates.main;
  mainProgram.user_id = user.id;
  mainProgram.id = generateUUID();
  
  try {
    const { data: program, error } = await supabase
      .from('programs')
      .upsert(mainProgram)
      .select()
      .single();
    
    if (error) {
      console.warn(`Warning: Could not create program: ${error.message}`);
    } else {
      programs.push(program);
    }
  } catch (error) {
    console.warn(`Warning: Error creating program:`, error.message);
  }
  
  // Create variation programs if requested
  if (includeVariations && programTemplates.variations) {
    for (const variation of programTemplates.variations) {
      variation.user_id = user.id;
      variation.id = generateUUID();
      variation.is_current = false; // Only main program is current
      
      try {
        const { data: program, error } = await supabase
          .from('programs')
          .upsert(variation)
          .select()
          .single();
        
        if (error) {
          console.warn(`Warning: Could not create variation program: ${error.message}`);
        } else {
          programs.push(program);
        }
      } catch (error) {
        console.warn(`Warning: Error creating variation program:`, error.message);
      }
    }
  }
  
  return programs;
}

/**
 * Generate realistic workout history with progression
 */
async function generateRealisticWorkoutHistory(supabase, users, programs, weeksOfHistory, options = {}) {
  const { verbose = false } = options;
  
  if (verbose) {
    logProgress('Generating realistic workout history...', 'info');
  }
  
  const allWorkoutLogs = [];
  
  for (const user of users) {
    const userPrograms = programs.filter(p => p.user_id === user.id && p.is_current);
    
    for (const program of userPrograms) {
      const workoutLogs = await generateProgressiveWorkoutLogs(
        supabase, 
        user, 
        program, 
        weeksOfHistory
      );
      allWorkoutLogs.push(...workoutLogs);
    }
    
    if (verbose) {
      const userLogs = allWorkoutLogs.filter(log => log.user_id === user.id);
      logProgress(`  Generated ${userLogs.length} workout logs for ${user.name}`, 'info');
    }
  }
  
  return allWorkoutLogs;
}

/**
 * Generate comprehensive analytics
 */
async function generateComprehensiveAnalytics(supabase, users, workoutLogs, options = {}) {
  const { verbose = false } = options;
  
  if (verbose) {
    logProgress('Generating comprehensive analytics...', 'info');
  }
  
  const analytics = [];
  
  for (const user of users) {
    const userAnalytics = await calculateUserAnalytics(supabase, user, workoutLogs);
    analytics.push(...userAnalytics);
    
    if (verbose) {
      logProgress(`  Generated ${userAnalytics.length} analytics records for ${user.name}`, 'info');
    }
  }
  
  return analytics;
}

/**
 * Helper functions for data generation
 */

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generatePhysicalStats(experienceLevel, units) {
  const baseStats = {
    beginner: { age: [18, 30], weight: [120, 180], height: [60, 75] },
    intermediate: { age: [22, 35], weight: [130, 200], height: [62, 76] },
    advanced: { age: [25, 45], weight: [140, 220], height: [64, 78] }
  };
  
  const stats = baseStats[experienceLevel] || baseStats.beginner;
  
  const age = Math.floor(Math.random() * (stats.age[1] - stats.age[0] + 1)) + stats.age[0];
  let weight = Math.floor(Math.random() * (stats.weight[1] - stats.weight[0] + 1)) + stats.weight[0];
  let height = Math.floor(Math.random() * (stats.height[1] - stats.height[0] + 1)) + stats.height[0];
  
  // Convert to metric if needed
  if (units === 'KG') {
    weight = Math.round(weight * 0.453592); // Convert lbs to kg
    height = Math.round(height * 2.54); // Convert inches to cm
  }
  
  return { age, weight, height };
}

function generateRandomInjuries() {
  const possibleInjuries = ['Lower Back', 'Knee', 'Shoulder', 'Wrist', 'Ankle'];
  const injuryCount = Math.random() < 0.3 ? 1 : 0; // 30% chance of having an injury
  
  if (injuryCount === 0) return [];
  
  const injury = possibleInjuries[Math.floor(Math.random() * possibleInjuries.length)];
  return [injury];
}

function generateUserPreferences() {
  return {
    theme: Math.random() < 0.6 ? 'light' : 'dark',
    notifications: Math.random() < 0.7,
    units: Math.random() < 0.8 ? 'imperial' : 'metric',
    restTimerSound: Math.random() < 0.5
  };
}

function generateUserSettings() {
  return {
    autoSave: Math.random() < 0.8,
    showTips: Math.random() < 0.6,
    trackCardio: Math.random() < 0.4,
    shareProgress: Math.random() < 0.3
  };
}

function getProgramTemplatesForExperience(experienceLevel, user) {
  const templates = {
    beginner: {
      main: {
        name: 'Beginner Full Body',
        description: 'A comprehensive full body routine for beginners',
        duration: 8,
        days_per_week: 3,
        weight_unit: user.preferred_units,
        difficulty: 'beginner',
        goals: user.goals,
        equipment: user.available_equipment,
        is_template: false,
        is_current: true,
        is_active: true,
        start_date: new Date().toISOString().split('T')[0],
        completed_weeks: Math.floor(Math.random() * 3)
      },
      variations: [
        {
          name: 'Beginner Upper/Lower Split',
          description: 'Upper/lower body split for beginners',
          duration: 6,
          days_per_week: 4,
          weight_unit: user.preferred_units,
          difficulty: 'beginner',
          goals: user.goals,
          equipment: user.available_equipment,
          is_template: false,
          is_active: false
        }
      ]
    },
    intermediate: {
      main: {
        name: 'Push Pull Legs',
        description: 'Intermediate push/pull/legs split',
        duration: 12,
        days_per_week: 6,
        weight_unit: user.preferred_units,
        difficulty: 'intermediate',
        goals: user.goals,
        equipment: user.available_equipment,
        is_template: false,
        is_current: true,
        is_active: true,
        start_date: new Date().toISOString().split('T')[0],
        completed_weeks: Math.floor(Math.random() * 6)
      },
      variations: [
        {
          name: 'Upper/Lower Power',
          description: 'Power-focused upper/lower split',
          duration: 10,
          days_per_week: 4,
          weight_unit: user.preferred_units,
          difficulty: 'intermediate',
          goals: user.goals,
          equipment: user.available_equipment,
          is_template: false,
          is_active: false
        }
      ]
    },
    advanced: {
      main: {
        name: 'Advanced Powerlifting',
        description: 'Advanced powerlifting program with periodization',
        duration: 16,
        days_per_week: 4,
        weight_unit: user.preferred_units,
        difficulty: 'advanced',
        goals: user.goals,
        equipment: user.available_equipment,
        is_template: false,
        is_current: true,
        is_active: true,
        start_date: new Date().toISOString().split('T')[0],
        completed_weeks: Math.floor(Math.random() * 8)
      },
      variations: [
        {
          name: 'Bodybuilding Split',
          description: 'Advanced bodybuilding program',
          duration: 12,
          days_per_week: 6,
          weight_unit: user.preferred_units,
          difficulty: 'advanced',
          goals: user.goals,
          equipment: user.available_equipment,
          is_template: false,
          is_active: false
        }
      ]
    }
  };
  
  return templates[experienceLevel] || templates.beginner;
}

// Export functions for use in other modules
module.exports = {
  generateAdvancedTestData,
  generateDiverseUsers,
  generateVariedPrograms,
  generateRealisticWorkoutHistory,
  generateComprehensiveAnalytics
};

// Allow running directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const userCount = parseInt(args.find(arg => arg.startsWith('--users='))?.split('=')[1]) || 10;
  const weeksOfHistory = parseInt(args.find(arg => arg.startsWith('--weeks='))?.split('=')[1]) || 8;
  
  generateAdvancedTestData({ 
    userCount, 
    weeksOfHistory, 
    verbose,
    includeVariations: true,
    generateAnalytics: true
  })
    .then(result => {
      if (result.success) {
        console.log('✅ Advanced test data generation completed successfully');
        logSummary('Generation Results', result.summary);
      } else {
        console.error('❌ Advanced test data generation failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Advanced test data generation failed:', error.message);
      process.exit(1);
    });
}