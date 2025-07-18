/**
 * Debug script for workout log generation
 */

const { generateWorkoutLogs, LOG_GENERATION_CONFIG } = require('./seed/data/workout-logs');

// Mock data for testing
const mockUser = {
  uid: 'test-user-id',
  scenario: 'beginner',
  profile: {
    name: 'Test User',
    experienceLevel: 'beginner',
    preferredUnits: 'LB'
  }
};

const mockProgram = {
  id: 'test-program-id',
  duration: 12,
  weightUnit: 'LB',
  weeklyConfigs: {
    'week1_day1': {
      name: 'Workout A',
      exercises: [
        { exerciseId: 'squat-id', sets: 3, reps: 5 },
        { exerciseId: 'bench-id', sets: 3, reps: 5 }
      ]
    },
    'week1_day2': {
      name: 'Workout B',
      exercises: [
        { exerciseId: 'deadlift-id', sets: 1, reps: 5 },
        { exerciseId: 'press-id', sets: 3, reps: 5 }
      ]
    }
  }
};

const mockExercises = [
  { id: 'squat-id', name: 'Barbell Back Squat' },
  { id: 'bench-id', name: 'Barbell Bench Press' },
  { id: 'deadlift-id', name: 'Conventional Deadlift' },
  { id: 'press-id', name: 'Overhead Press' }
];

async function debugWorkoutLogs() {
  console.log('🔍 Debugging workout log generation...');
  
  try {
    console.log('\n📋 Input data:');
    console.log('User:', mockUser.scenario, mockUser.profile.experienceLevel);
    console.log('Program duration:', mockProgram.duration, 'weeks');
    console.log('Program configs:', Object.keys(mockProgram.weeklyConfigs));
    console.log('Exercises:', mockExercises.map(ex => ex.name));
    
    console.log('\n⚙️ Configuration:');
    console.log('History weeks:', LOG_GENERATION_CONFIG.historyWeeks);
    console.log('Completion rate:', LOG_GENERATION_CONFIG.completionRate);
    console.log('Starting weights:', LOG_GENERATION_CONFIG.startingWeights.beginner);
    
    console.log('\n🏃 Generating logs...');
    const logs = await generateWorkoutLogs(
      mockUser, 
      [mockProgram], 
      mockExercises, 
      { weeksBack: 2, verbose: true }
    );
    
    console.log('\n📊 Results:');
    console.log('Generated logs:', logs.length);
    
    if (logs.length > 0) {
      const sampleLog = logs[0];
      console.log('\n📝 Sample log:');
      console.log('- User ID:', sampleLog.userId);
      console.log('- Program ID:', sampleLog.programId);
      console.log('- Week/Day:', sampleLog.weekIndex, '/', sampleLog.dayIndex);
      console.log('- Date:', sampleLog.date);
      console.log('- Exercises:', sampleLog.exercises.length);
      console.log('- Finished:', sampleLog.isWorkoutFinished);
      
      if (sampleLog.exercises.length > 0) {
        const sampleExercise = sampleLog.exercises[0];
        console.log('\n🏋️ Sample exercise:');
        console.log('- Exercise ID:', sampleExercise.exerciseId);
        console.log('- Sets:', sampleExercise.sets);
        console.log('- Reps:', sampleExercise.reps);
        console.log('- Weights:', sampleExercise.weights);
        console.log('- Completed:', sampleExercise.completed);
      }
    } else {
      console.log('❌ No logs generated - investigating...');
      
      // Debug the week configuration
      console.log('\n🔍 Debugging week configuration:');
      for (let weekIndex = 0; weekIndex < 2; weekIndex++) {
        console.log(`Week ${weekIndex}:`);
        
        // Simulate the getWeekConfiguration logic
        const weekConfigs = [];
        Object.keys(mockProgram.weeklyConfigs).forEach(configKey => {
          const match = configKey.match(/week(\d+)_day(\d+)/);
          if (match) {
            const week = parseInt(match[1]) - 1;
            const day = parseInt(match[2]) - 1;
            const programWeekIndex = weekIndex % mockProgram.duration;
            
            console.log(`  Config key: ${configKey}, Week: ${week}, Day: ${day}, Program week: ${programWeekIndex}`);
            
            if (week === programWeekIndex) {
              weekConfigs[day] = mockProgram.weeklyConfigs[configKey];
              console.log(`    ✅ Matched! Added to day ${day}`);
            }
          }
        });
        
        const filteredConfigs = weekConfigs.filter(config => config);
        console.log(`  Final configs: ${filteredConfigs.length}`);
        filteredConfigs.forEach((config, index) => {
          console.log(`    Day ${index}: ${config.name} (${config.exercises.length} exercises)`);
        });
      }
    }
    
    console.log('\n✅ Debug completed');
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run debug
debugWorkoutLogs();