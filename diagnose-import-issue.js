#!/usr/bin/env node

/**
 * Diagnostic script to understand why the import is failing
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

async function diagnoseImportIssue() {
    console.log('🔍 Diagnosing import issue...');

    // Parse command line arguments
    const args = process.argv.slice(2);
    let envFile = '.env';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--env-file') {
            envFile = args[++i];
        } else if (args[i] === '--help') {
            console.log(`
Usage: node diagnose-import-issue.js [options]

Options:
  --env-file <path>    Path to .env file (default: .env)
  --help               Show this help message

Examples:
  node diagnose-import-issue.js
  node diagnose-import-issue.js --env-file .env.production
`);
            process.exit(0);
        }
    }

    // Load environment variables from specified file
    require('dotenv').config({ path: envFile });
    console.log(`📁 Using environment file: ${envFile}`);

    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
    const supabaseKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing environment variables');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    // Check what's actually in the database
    console.log('\n📊 Checking database contents...');

    const tables = ['users', 'exercises', 'programs', 'program_workouts', 'program_exercises', 'workout_logs', 'workout_log_exercises'];

    for (const table of tables) {
        try {
            const { data, error } = await supabase
                .from(table)
                .select('id')
                .limit(5);

            if (error) {
                console.log(`❌ ${table}: Error - ${error.message}`);
            } else {
                console.log(`✅ ${table}: ${data.length} records found`);
                if (data.length > 0) {
                    console.log(`   Sample IDs: ${data.map(r => r.id.substring(0, 8)).join(', ')}...`);
                }
            }
        } catch (error) {
            console.log(`❌ ${table}: Exception - ${error.message}`);
        }
    }

    // Check specific foreign key relationships
    console.log('\n🔗 Checking specific foreign key relationships...');

    // Load the first few records from transformed data
    const workoutLogExercisesPath = './transformed-data/workout_log_exercises.json';
    const workoutLogsPath = './transformed-data/workout_logs.json';

    try {
        const workoutLogExercisesData = JSON.parse(await fs.readFile(workoutLogExercisesPath, 'utf8'));
        const workoutLogsData = JSON.parse(await fs.readFile(workoutLogsPath, 'utf8'));

        const firstWorkoutLogExercise = workoutLogExercisesData[0];
        const firstWorkoutLog = workoutLogsData[0];

        console.log(`\n📋 First workout_log_exercise references workout_log_id: ${firstWorkoutLogExercise.workout_log_id}`);
        console.log(`📋 First workout_log has id: ${firstWorkoutLog.id}`);
        console.log(`📋 IDs match: ${firstWorkoutLogExercise.workout_log_id === firstWorkoutLog.id}`);

        // Check if this workout_log exists in the database
        const { data: workoutLogInDb, error: workoutLogError } = await supabase
            .from('workout_logs')
            .select('id, user_id, program_id')
            .eq('id', firstWorkoutLogExercise.workout_log_id);

        console.log(`🔍 Query result: ${workoutLogInDb ? workoutLogInDb.length : 0} rows returned`);

        if (workoutLogError || !workoutLogInDb || workoutLogInDb.length === 0) {
            console.log(`❌ Workout log ${firstWorkoutLogExercise.workout_log_id} NOT found in database: ${workoutLogError ? workoutLogError.message : 'No rows returned'}`);

            // Check if the user exists
            const { data: userInDb, error: userError } = await supabase
                .from('users')
                .select('id, email')
                .eq('id', firstWorkoutLog.user_id)
                .single();

            if (userError) {
                console.log(`❌ User ${firstWorkoutLog.user_id} NOT found in database: ${userError.message}`);
            } else {
                console.log(`✅ User ${firstWorkoutLog.user_id} found in database: ${userInDb.email}`);
            }

            // Check if the program exists
            if (firstWorkoutLog.program_id) {
                const { data: programInDb, error: programError } = await supabase
                    .from('programs')
                    .select('id, name, user_id')
                    .eq('id', firstWorkoutLog.program_id)
                    .single();

                if (programError) {
                    console.log(`❌ Program ${firstWorkoutLog.program_id} NOT found in database: ${programError.message}`);
                } else {
                    console.log(`✅ Program ${firstWorkoutLog.program_id} found in database: ${programInDb.name}`);
                }
            }

        } else {
            console.log(`✅ Workout log ${firstWorkoutLogExercise.workout_log_id} found in database`);
        }

        // Check if the exercise exists
        const { data: exerciseInDb, error: exerciseError } = await supabase
            .from('exercises')
            .select('id, name')
            .eq('id', firstWorkoutLogExercise.exercise_id)
            .single();

        if (exerciseError) {
            console.log(`❌ Exercise ${firstWorkoutLogExercise.exercise_id} NOT found in database: ${exerciseError.message}`);
        } else {
            console.log(`✅ Exercise ${firstWorkoutLogExercise.exercise_id} found in database: ${exerciseInDb.name}`);
        }

    } catch (error) {
        console.error('❌ Error reading transformed data:', error.message);
    }

    // Check for missing workout_logs
    console.log('\n🔍 Checking for missing workout_logs...');

    try {
        // Get all workout_log IDs from transformed data
        const workoutLogsData = JSON.parse(await fs.readFile(workoutLogsPath, 'utf8'));
        const transformedWorkoutLogIds = new Set(workoutLogsData.map(log => log.id));

        // Get all workout_log IDs from database
        const { data: dbWorkoutLogs, error: dbError } = await supabase
            .from('workout_logs')
            .select('id');

        if (dbError) {
            console.log(`❌ Error fetching workout_logs from database: ${dbError.message}`);
        } else {
            const dbWorkoutLogIds = new Set(dbWorkoutLogs.map(log => log.id));

            console.log(`📊 Transformed data has ${transformedWorkoutLogIds.size} workout_logs`);
            console.log(`📊 Database has ${dbWorkoutLogIds.size} workout_logs`);

            // Find missing workout_logs
            const missingWorkoutLogs = [...transformedWorkoutLogIds].filter(id => !dbWorkoutLogIds.has(id));

            if (missingWorkoutLogs.length > 0) {
                console.log(`❌ ${missingWorkoutLogs.length} workout_logs are missing from database:`);
                missingWorkoutLogs.slice(0, 5).forEach(id => {
                    console.log(`   - ${id}`);
                });
                if (missingWorkoutLogs.length > 5) {
                    console.log(`   ... and ${missingWorkoutLogs.length - 5} more`);
                }

                // Check why the first missing workout_log failed to import
                const firstMissing = workoutLogsData.find(log => log.id === missingWorkoutLogs[0]);
                if (firstMissing) {
                    console.log(`\n🔍 Analyzing first missing workout_log: ${firstMissing.id}`);
                    console.log(`   User ID: ${firstMissing.user_id}`);
                    console.log(`   Program ID: ${firstMissing.program_id}`);

                    // Check if user exists
                    const { data: userExists } = await supabase
                        .from('users')
                        .select('id')
                        .eq('id', firstMissing.user_id)
                        .single();

                    console.log(`   User exists: ${userExists ? 'Yes' : 'No'}`);

                    // Check if program exists (if not null)
                    if (firstMissing.program_id) {
                        const { data: programExists } = await supabase
                            .from('programs')
                            .select('id')
                            .eq('id', firstMissing.program_id)
                            .single();

                        console.log(`   Program exists: ${programExists ? 'Yes' : 'No'}`);
                    }
                }
            } else {
                console.log(`✅ All workout_logs from transformed data are present in database`);
            }
        }
    } catch (error) {
        console.error('❌ Error checking missing workout_logs:', error.message);
    }

    // Test foreign key resolution logic
    console.log('\n🧪 Testing foreign key resolution logic...');

    const testId = 'fe3175f1-acb5-4cc6-9232-88485a0e89ff';

    try {
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .eq('id', testId)
            .single();

        if (error) {
            console.log(`❌ Foreign key test failed: ${error.message}`);
        } else {
            console.log(`✅ Foreign key test passed: Found user ${data.id}`);
        }
    } catch (error) {
        console.log(`❌ Foreign key test exception: ${error.message}`);
    }
}

if (require.main === module) {
    diagnoseImportIssue().catch(error => {
        console.error('💥 Diagnosis failed:', error.message);
        process.exit(1);
    });
}

module.exports = { diagnoseImportIssue };