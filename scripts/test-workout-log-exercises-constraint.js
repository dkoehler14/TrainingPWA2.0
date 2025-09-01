#!/usr/bin/env node

/**
 * Test script for workout_log_exercises unique constraint implementation
 * Tests various edge cases and constraint violations
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.development') });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUniqueConstraint() {
  console.log('🧪 Testing workout_log_exercises unique constraint implementation...\n');

  const testResults = {
    tests: [],
    passed: 0,
    failed: 0,
    startTime: new Date().toISOString()
  };

  const addTestResult = (testName, passed, details = {}) => {
    testResults.tests.push({
      name: testName,
      passed,
      timestamp: new Date().toISOString(),
      ...details
    });

    if (passed) {
      testResults.passed++;
      console.log(`✅ ${testName}`);
    } else {
      testResults.failed++;
      console.log(`❌ ${testName}`);
    }

    if (details.error) {
      console.log(`   Error: ${details.error}`);
    }
    if (details.message) {
      console.log(`   Message: ${details.message}`);
    }
  };

  try {
    // Test 1: Verify constraint exists
    console.log('Test 1: Checking if unique constraint exists...');
    try {
      const { data: constraints, error } = await supabase
        .from('information_schema.table_constraints')
        .select('constraint_name, table_name, constraint_type')
        .eq('table_name', 'workout_log_exercises')
        .eq('constraint_type', 'UNIQUE');

      if (error) throw error;

      const uniqueConstraint = constraints.find(c =>
        c.constraint_name === 'unique_workout_log_exercise' ||
        c.constraint_name.includes('workout_log_exercise')
      );

      if (uniqueConstraint) {
        addTestResult('Unique constraint exists', true, {
          constraintName: uniqueConstraint.constraint_name
        });
      } else {
        addTestResult('Unique constraint exists', false, {
          message: 'No unique constraint found on workout_log_exercises table'
        });
      }
    } catch (error) {
      addTestResult('Unique constraint exists', false, {
        error: error.message
      });
    }

    // Test 2: Test duplicate insertion (should fail)
    console.log('\nTest 2: Testing duplicate exercise insertion...');
    try {
      // First, create a test workout log
      const { data: workoutLog, error: workoutError } = await supabase
        .from('workout_logs')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000000', // Test user ID
          program_id: null,
          week_index: null,
          day_index: null,
          name: 'Test Workout for Constraint',
          type: 'quick_workout',
          date: new Date().toISOString().split('T')[0],
          is_finished: false,
          is_draft: true,
          weight_unit: 'LB'
        })
        .select()
        .single();

      if (workoutError) throw workoutError;

      const workoutLogId = workoutLog.id;
      console.log(`   Created test workout log: ${workoutLogId}`);

      // Insert first exercise
      const { error: firstInsertError } = await supabase
        .from('workout_log_exercises')
        .insert({
          workout_log_id: workoutLogId,
          exercise_id: '00000000-0000-0000-0000-000000000001', // Test exercise ID
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true],
          order_index: 0
        });

      if (firstInsertError) {
        throw new Error(`First insert failed: ${firstInsertError.message}`);
      }

      console.log('   First exercise inserted successfully');

      // Try to insert the same exercise again (should fail)
      const { error: duplicateError } = await supabase
        .from('workout_log_exercises')
        .insert({
          workout_log_id: workoutLogId,
          exercise_id: '00000000-0000-0000-0000-000000000001', // Same exercise ID
          sets: 3,
          reps: [8, 8, 8],
          weights: [110, 110, 110],
          completed: [true, true, true],
          order_index: 1
        });

      if (duplicateError && duplicateError.code === '23505') {
        addTestResult('Duplicate exercise insertion blocked', true, {
          errorCode: duplicateError.code,
          message: 'Unique constraint violation correctly prevented duplicate'
        });
      } else if (duplicateError) {
        addTestResult('Duplicate exercise insertion blocked', false, {
          error: duplicateError.message,
          message: 'Unexpected error occurred'
        });
      } else {
        addTestResult('Duplicate exercise insertion blocked', false, {
          message: 'Duplicate insertion was allowed (constraint not working)'
        });
      }

      // Clean up test data
      await supabase.from('workout_logs').delete().eq('id', workoutLogId);

    } catch (error) {
      addTestResult('Duplicate exercise insertion blocked', false, {
        error: error.message
      });
    }

    // Test 3: Test different exercises in same workout (should succeed)
    console.log('\nTest 3: Testing different exercises in same workout...');
    try {
      // Create another test workout log
      const { data: workoutLog2, error: workoutError2 } = await supabase
        .from('workout_logs')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          program_id: null,
          week_index: null,
          day_index: null,
          name: 'Test Workout for Multiple Exercises',
          type: 'quick_workout',
          date: new Date().toISOString().split('T')[0],
          is_finished: false,
          is_draft: true,
          weight_unit: 'LB'
        })
        .select()
        .single();

      if (workoutError2) throw workoutError2;

      const workoutLogId2 = workoutLog2.id;

      // Insert multiple different exercises
      const exercisesToInsert = [
        {
          workout_log_id: workoutLogId2,
          exercise_id: '00000000-0000-0000-0000-000000000001',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true],
          order_index: 0
        },
        {
          workout_log_id: workoutLogId2,
          exercise_id: '00000000-0000-0000-0000-000000000002', // Different exercise
          sets: 3,
          reps: [12, 12, 12],
          weights: [80, 80, 80],
          completed: [true, true, true],
          order_index: 1
        }
      ];

      const { error: multiInsertError } = await supabase
        .from('workout_log_exercises')
        .insert(exercisesToInsert);

      if (multiInsertError) {
        throw new Error(`Multiple exercises insert failed: ${multiInsertError.message}`);
      }

      addTestResult('Different exercises in same workout allowed', true, {
        message: 'Successfully inserted 2 different exercises in same workout'
      });

      // Clean up
      await supabase.from('workout_logs').delete().eq('id', workoutLogId2);

    } catch (error) {
      addTestResult('Different exercises in same workout allowed', false, {
        error: error.message
      });
    }

    // Test 4: Test same exercise in different workouts (should succeed)
    console.log('\nTest 4: Testing same exercise in different workouts...');
    try {
      // Create two different workout logs
      const workoutLogs = [];
      for (let i = 0; i < 2; i++) {
        const { data: workoutLog, error } = await supabase
          .from('workout_logs')
          .insert({
            user_id: '00000000-0000-0000-0000-000000000000',
            program_id: null,
            week_index: null,
            day_index: null,
            name: `Test Workout ${i + 1}`,
            type: 'quick_workout',
            date: new Date().toISOString().split('T')[0],
            is_finished: false,
            is_draft: true,
            weight_unit: 'LB'
          })
          .select()
          .single();

        if (error) throw error;
        workoutLogs.push(workoutLog);
      }

      // Insert same exercise in both workouts
      for (const workout of workoutLogs) {
        const { error: insertError } = await supabase
          .from('workout_log_exercises')
          .insert({
            workout_log_id: workout.id,
            exercise_id: '00000000-0000-0000-0000-000000000001', // Same exercise
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true],
            order_index: 0
          });

        if (insertError) {
          throw new Error(`Insert failed for workout ${workout.id}: ${insertError.message}`);
        }
      }

      addTestResult('Same exercise in different workouts allowed', true, {
        message: 'Successfully inserted same exercise in 2 different workouts'
      });

      // Clean up
      for (const workout of workoutLogs) {
        await supabase.from('workout_logs').delete().eq('id', workout.id);
      }

    } catch (error) {
      addTestResult('Same exercise in different workouts allowed', false, {
        error: error.message
      });
    }

    // Test 5: Test upsert function
    console.log('\nTest 5: Testing upsert function...');
    try {
      // Create a test workout log
      const { data: workoutLog3, error: workoutError3 } = await supabase
        .from('workout_logs')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          program_id: null,
          week_index: null,
          day_index: null,
          name: 'Test Workout for Upsert',
          type: 'quick_workout',
          date: new Date().toISOString().split('T')[0],
          is_finished: false,
          is_draft: true,
          weight_unit: 'LB'
        })
        .select()
        .single();

      if (workoutError3) throw workoutError3;

      const workoutLogId3 = workoutLog3.id;

      // Test upsert function (this would need to be called via RPC if it exists)
      // For now, just test that the function exists in the database
      const { data: functions, error: funcError } = await supabase
        .from('information_schema.routines')
        .select('routine_name')
        .eq('routine_name', 'handle_duplicate_workout_exercise_upsert');

      if (funcError) {
        addTestResult('Upsert function exists', false, {
          error: funcError.message
        });
      } else if (functions && functions.length > 0) {
        addTestResult('Upsert function exists', true, {
          functionName: functions[0].routine_name
        });
      } else {
        addTestResult('Upsert function exists', false, {
          message: 'Upsert function not found in database'
        });
      }

      // Clean up
      await supabase.from('workout_logs').delete().eq('id', workoutLogId3);

    } catch (error) {
      addTestResult('Upsert function exists', false, {
        error: error.message
      });
    }

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    addTestResult('Test suite execution', false, {
      error: error.message
    });
  }

  // Generate test summary
  testResults.endTime = new Date().toISOString();
  testResults.duration = new Date(testResults.endTime) - new Date(testResults.startTime);

  console.log('\n' + '='.repeat(50));
  console.log('🧪 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${testResults.tests.length}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Duration: ${Math.round(testResults.duration / 1000)}s`);
  console.log(`Success Rate: ${testResults.tests.length > 0 ? Math.round((testResults.passed / testResults.tests.length) * 100) : 0}%`);

  if (testResults.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.tests.filter(t => !t.passed).forEach(test => {
      console.log(`   - ${test.name}`);
      if (test.error) console.log(`     Error: ${test.error}`);
    });
  }

  // Save results to file
  const resultsFile = path.join(__dirname, 'workout-log-exercises-constraint-test-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Detailed results saved to: ${resultsFile}`);

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the tests
testUniqueConstraint().catch(error => {
  console.error('💥 Test suite crashed:', error);
  process.exit(1);
});