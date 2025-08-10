#!/usr/bin/env node

/**
 * Final validation script for workout log constraint implementation
 * This script validates all aspects of the database schema updates
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.development' });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function validateConstraintExists() {
    console.log('🔍 Validating constraint exists in database...');
    
    const { data, error } = await supabase
        .rpc('sql', {
            query: `
                SELECT 
                    conname as constraint_name,
                    contype as constraint_type,
                    pg_get_constraintdef(oid) as constraint_definition
                FROM pg_constraint 
                WHERE conname = 'unique_user_program_week_day'
            `
        });
    
    if (error) {
        console.error('❌ Failed to query constraints:', error);
        return false;
    }
    
    if (data && data.length > 0) {
        console.log('✅ Unique constraint found:');
        console.log(`   Name: ${data[0].constraint_name}`);
        console.log(`   Definition: ${data[0].constraint_definition}`);
        return true;
    } else {
        console.error('❌ Unique constraint not found');
        return false;
    }
}

async function validateIndexesExist() {
    console.log('\n🔍 Validating indexes exist...');
    
    const expectedIndexes = [
        'idx_workout_logs_user_program_week_day_lookup',
        'idx_workout_logs_user_date_desc',
        'idx_workout_logs_user_draft',
        'idx_workout_logs_program_finished',
        'idx_workout_log_exercises_workout_order'
    ];
    
    let allFound = true;
    
    for (const indexName of expectedIndexes) {
        const { data, error } = await supabase
            .rpc('sql', {
                query: `
                    SELECT 
                        indexname,
                        tablename,
                        indexdef
                    FROM pg_indexes 
                    WHERE indexname = '${indexName}'
                `
            });
        
        if (error) {
            console.error(`❌ Failed to query index ${indexName}:`, error);
            allFound = false;
            continue;
        }
        
        if (data && data.length > 0) {
            console.log(`✅ Index found: ${indexName}`);
        } else {
            console.error(`❌ Index not found: ${indexName}`);
            allFound = false;
        }
    }
    
    return allFound;
}

async function validateFunctionsExist() {
    console.log('\n🔍 Validating functions exist...');
    
    const expectedFunctions = [
        'upsert_workout_log',
        'validate_workout_log_cache',
        'get_or_create_workout_log'
    ];
    
    let allFound = true;
    
    for (const functionName of expectedFunctions) {
        const { data, error } = await supabase
            .rpc('sql', {
                query: `
                    SELECT 
                        proname as function_name,
                        pg_get_function_result(oid) as return_type
                    FROM pg_proc 
                    WHERE proname = '${functionName}'
                `
            });
        
        if (error) {
            console.error(`❌ Failed to query function ${functionName}:`, error);
            allFound = false;
            continue;
        }
        
        if (data && data.length > 0) {
            console.log(`✅ Function found: ${functionName} -> ${data[0].return_type}`);
        } else {
            console.error(`❌ Function not found: ${functionName}`);
            allFound = false;
        }
    }
    
    return allFound;
}

async function validateConstraintBehavior() {
    console.log('\n🧪 Validating constraint behavior...');
    
    const testUserId = '123e4567-e89b-12d3-a456-426614174000';
    const testProgramId = '123e4567-e89b-12d3-a456-426614174001';
    
    // Clean up
    await supabase.from('workout_logs').delete().eq('user_id', testUserId);
    
    // Create test user and program
    await supabase.from('users').upsert({
        id: testUserId,
        email: 'test@example.com',
        name: 'Test User'
    });
    
    await supabase.from('programs').upsert({
        id: testProgramId,
        user_id: testUserId,
        name: 'Test Program',
        duration: 4,
        days_per_week: 3
    });
    
    // Test 1: Create first workout log
    const { data: first, error: firstError } = await supabase
        .from('workout_logs')
        .insert({
            user_id: testUserId,
            program_id: testProgramId,
            week_index: 0,
            day_index: 0,
            name: 'Test Workout',
            date: '2024-01-01'
        })
        .select()
        .single();
    
    if (firstError) {
        console.error('❌ Failed to create first workout log:', firstError);
        return false;
    }
    
    console.log('✅ First workout log created successfully');
    
    // Test 2: Attempt duplicate (should fail)
    const { data: duplicate, error: duplicateError } = await supabase
        .from('workout_logs')
        .insert({
            user_id: testUserId,
            program_id: testProgramId,
            week_index: 0,
            day_index: 0,
            name: 'Duplicate Workout',
            date: '2024-01-01'
        })
        .select()
        .single();
    
    if (duplicateError && duplicateError.code === '23505') {
        console.log('✅ Duplicate correctly rejected with constraint violation');
    } else {
        console.error('❌ Duplicate should have been rejected:', duplicate);
        return false;
    }
    
    // Test 3: Different combination should work
    const { data: different, error: differentError } = await supabase
        .from('workout_logs')
        .insert({
            user_id: testUserId,
            program_id: testProgramId,
            week_index: 0,
            day_index: 1, // Different day
            name: 'Different Day Workout',
            date: '2024-01-02'
        })
        .select()
        .single();
    
    if (differentError) {
        console.error('❌ Different combination should have worked:', differentError);
        return false;
    }
    
    console.log('✅ Different combination worked correctly');
    
    return true;
}

async function validateFunctionBehavior() {
    console.log('\n🧪 Validating function behavior...');
    
    const testUserId = '123e4567-e89b-12d3-a456-426614174000';
    const testProgramId = '123e4567-e89b-12d3-a456-426614174001';
    
    // Test upsert function
    const { data: upsertResult1, error: upsertError1 } = await supabase
        .rpc('upsert_workout_log', {
            p_user_id: testUserId,
            p_program_id: testProgramId,
            p_week_index: 1,
            p_day_index: 0,
            p_name: 'Upsert Test 1',
            p_date: '2024-01-08'
        });
    
    if (upsertError1) {
        console.error('❌ First upsert failed:', upsertError1);
        return false;
    }
    
    // Second upsert should return same ID
    const { data: upsertResult2, error: upsertError2 } = await supabase
        .rpc('upsert_workout_log', {
            p_user_id: testUserId,
            p_program_id: testProgramId,
            p_week_index: 1,
            p_day_index: 0,
            p_name: 'Upsert Test 2 (Updated)',
            p_date: '2024-01-08'
        });
    
    if (upsertError2) {
        console.error('❌ Second upsert failed:', upsertError2);
        return false;
    }
    
    if (upsertResult1 === upsertResult2) {
        console.log('✅ Upsert function working correctly (same ID returned)');
    } else {
        console.error('❌ Upsert function returned different IDs:', upsertResult1, upsertResult2);
        return false;
    }
    
    // Test cache validation function
    const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_workout_log_cache', {
            p_workout_log_id: upsertResult1,
            p_user_id: testUserId,
            p_program_id: testProgramId,
            p_week_index: 1,
            p_day_index: 0
        });
    
    if (validationError) {
        console.error('❌ Cache validation failed:', validationError);
        return false;
    }
    
    if (validationResult === true) {
        console.log('✅ Cache validation function working correctly');
    } else {
        console.error('❌ Cache validation returned false for valid data');
        return false;
    }
    
    // Test get_or_create function
    const { data: getOrCreateResult, error: getOrCreateError } = await supabase
        .rpc('get_or_create_workout_log', {
            p_user_id: testUserId,
            p_program_id: testProgramId,
            p_week_index: 2,
            p_day_index: 0,
            p_name: 'Get or Create Test',
            p_date: '2024-01-15'
        });
    
    if (getOrCreateError) {
        console.error('❌ Get or create failed:', getOrCreateError);
        return false;
    }
    
    if (getOrCreateResult && getOrCreateResult.length > 0 && getOrCreateResult[0].was_created === true) {
        console.log('✅ Get or create function working correctly (new record created)');
    } else {
        console.error('❌ Get or create function returned unexpected result:', getOrCreateResult);
        return false;
    }
    
    return true;
}

async function runValidation() {
    console.log('🚀 Starting Final Validation of Constraint Implementation\n');
    
    try {
        const constraintExists = await validateConstraintExists();
        const indexesExist = await validateIndexesExist();
        const functionsExist = await validateFunctionsExist();
        const constraintWorks = await validateConstraintBehavior();
        const functionsWork = await validateFunctionBehavior();
        
        console.log('\n📊 Validation Summary:');
        console.log('─'.repeat(50));
        console.log(`Unique constraint exists:     ${constraintExists ? '✅' : '❌'}`);
        console.log(`Performance indexes exist:    ${indexesExist ? '✅' : '❌'}`);
        console.log(`Helper functions exist:       ${functionsExist ? '✅' : '❌'}`);
        console.log(`Constraint behavior correct:  ${constraintWorks ? '✅' : '❌'}`);
        console.log(`Function behavior correct:    ${functionsWork ? '✅' : '❌'}`);
        console.log('─'.repeat(50));
        
        const allPassed = constraintExists && indexesExist && functionsExist && constraintWorks && functionsWork;
        
        if (allPassed) {
            console.log('\n🎉 All validation tests passed!');
            console.log('✅ Database schema updates and constraints are working correctly');
            return true;
        } else {
            console.log('\n❌ Some validation tests failed');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Validation failed with error:', error);
        return false;
    }
}

// Run the validation
runValidation().then((success) => {
    if (success) {
        console.log('\n✅ Validation script completed successfully');
        process.exit(0);
    } else {
        console.log('\n❌ Validation script failed');
        process.exit(1);
    }
}).catch((error) => {
    console.error('❌ Validation script failed:', error);
    process.exit(1);
});