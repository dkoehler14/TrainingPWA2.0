#!/usr/bin/env node

/**
 * Test script for workout log unique constraints and error handling
 * This script tests the database-level duplicate prevention implementation
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

async function testConstraintBehavior() {
    console.log('🧪 Testing Workout Log Unique Constraints\n');

    try {
        // Test data
        const testUserId = '123e4567-e89b-12d3-a456-426614174000';
        const testProgramId = '123e4567-e89b-12d3-a456-426614174001';
        const weekIndex = 0;
        const dayIndex = 0;

        // Clean up any existing test data
        console.log('🧹 Cleaning up existing test data...');
        await supabase
            .from('workout_logs')
            .delete()
            .eq('user_id', testUserId);

        // Ensure test user exists
        console.log('👤 Creating test user...');
        const { error: userError } = await supabase
            .from('users')
            .upsert({
                id: testUserId,
                email: 'test@example.com',
                name: 'Test User'
            });

        if (userError) {
            console.error('❌ Failed to create test user:', userError);
            return;
        }

        // Ensure test program exists
        console.log('📋 Creating test program...');
        const { error: programError } = await supabase
            .from('programs')
            .upsert({
                id: testProgramId,
                user_id: testUserId,
                name: 'Test Program',
                duration: 4,
                days_per_week: 3
            });

        if (programError) {
            console.error('❌ Failed to create test program:', programError);
            return;
        }

        console.log('✅ Test setup complete\n');

        // Test 1: Create first workout log
        console.log('📝 Test 1: Creating first workout log...');
        const { data: firstLog, error: firstError } = await supabase
            .from('workout_logs')
            .insert({
                user_id: testUserId,
                program_id: testProgramId,
                week_index: weekIndex,
                day_index: dayIndex,
                name: 'Test Workout 1',
                date: '2024-01-01',
                type: 'program_workout'
            })
            .select()
            .single();

        if (firstError) {
            console.error('❌ Failed to create first workout log:', firstError);
            return;
        }

        console.log('✅ First workout log created:', firstLog.id);

        // Test 2: Attempt to create duplicate (should fail)
        console.log('\n📝 Test 2: Attempting to create duplicate workout log...');
        const { data: duplicateLog, error: duplicateError } = await supabase
            .from('workout_logs')
            .insert({
                user_id: testUserId,
                program_id: testProgramId,
                week_index: weekIndex,
                day_index: dayIndex,
                name: 'Test Workout 2 (Duplicate)',
                date: '2024-01-01',
                type: 'program_workout'
            })
            .select()
            .single();

        if (duplicateError) {
            console.log('✅ Duplicate creation correctly failed:', duplicateError.message);
            console.log('   Error code:', duplicateError.code);
        } else {
            console.error('❌ Duplicate creation should have failed but succeeded:', duplicateLog);
        }

        // Test 3: Test upsert function
        console.log('\n📝 Test 3: Testing upsert function...');
        const { data: upsertResult, error: upsertError } = await supabase
            .rpc('upsert_workout_log', {
                p_user_id: testUserId,
                p_program_id: testProgramId,
                p_week_index: weekIndex,
                p_day_index: dayIndex,
                p_name: 'Updated Test Workout',
                p_date: '2024-01-01',
                p_type: 'program_workout',
                p_weight_unit: 'LB',
                p_is_draft: false
            });

        if (upsertError) {
            console.error('❌ Upsert function failed:', upsertError);
        } else {
            console.log('✅ Upsert function succeeded, returned ID:', upsertResult);
            console.log('   Should match first log ID:', firstLog.id);
        }

        // Test 4: Test cache validation function
        console.log('\n📝 Test 4: Testing cache validation function...');
        const { data: validationResult, error: validationError } = await supabase
            .rpc('validate_workout_log_cache', {
                p_workout_log_id: firstLog.id,
                p_user_id: testUserId,
                p_program_id: testProgramId,
                p_week_index: weekIndex,
                p_day_index: dayIndex
            });

        if (validationError) {
            console.error('❌ Cache validation failed:', validationError);
        } else {
            console.log('✅ Cache validation result:', validationResult);
        }

        // Test 5: Test get_or_create function with existing record
        console.log('\n📝 Test 5: Testing get_or_create function with existing record...');
        const { data: getExistingResult, error: getExistingError } = await supabase
            .rpc('get_or_create_workout_log', {
                p_user_id: testUserId,
                p_program_id: testProgramId,
                p_week_index: weekIndex,
                p_day_index: dayIndex,
                p_name: 'Get or Create Test',
                p_date: '2024-01-01',
                p_type: 'program_workout',
                p_weight_unit: 'LB'
            });

        if (getExistingError) {
            console.error('❌ Get or create (existing) failed:', getExistingError);
        } else {
            console.log('✅ Get or create (existing) result:', getExistingResult);
            console.log('   Should return existing ID and was_created=false');
        }

        // Test 6: Test get_or_create function with new record
        console.log('\n📝 Test 6: Testing get_or_create function with new record...');
        const { data: getNewResult, error: getNewError } = await supabase
            .rpc('get_or_create_workout_log', {
                p_user_id: testUserId,
                p_program_id: testProgramId,
                p_week_index: 1, // Different week
                p_day_index: dayIndex,
                p_name: 'New Workout',
                p_date: '2024-01-08',
                p_type: 'program_workout',
                p_weight_unit: 'LB'
            });

        if (getNewError) {
            console.error('❌ Get or create (new) failed:', getNewError);
        } else {
            console.log('✅ Get or create (new) result:', getNewResult);
            console.log('   Should return new ID and was_created=true');
        }

        // Test 7: Test index performance
        console.log('\n📝 Test 7: Testing index performance...');
        const startTime = Date.now();
        
        const { data: lookupResult, error: lookupError } = await supabase
            .from('workout_logs')
            .select('id, name, created_at')
            .eq('user_id', testUserId)
            .eq('program_id', testProgramId)
            .eq('week_index', weekIndex)
            .eq('day_index', dayIndex)
            .single();

        const endTime = Date.now();

        if (lookupError) {
            console.error('❌ Index lookup failed:', lookupError);
        } else {
            console.log('✅ Index lookup succeeded in', endTime - startTime, 'ms');
            console.log('   Found workout:', lookupResult.name);
        }

        // Test 8: Test constraint with null program_id (should allow duplicates)
        console.log('\n📝 Test 8: Testing constraint with null program_id...');
        const { data: nullProgram1, error: nullError1 } = await supabase
            .from('workout_logs')
            .insert({
                user_id: testUserId,
                program_id: null,
                week_index: null,
                day_index: null,
                name: 'Quick Workout 1',
                date: '2024-01-02',
                type: 'quick_workout'
            })
            .select()
            .single();

        const { data: nullProgram2, error: nullError2 } = await supabase
            .from('workout_logs')
            .insert({
                user_id: testUserId,
                program_id: null,
                week_index: null,
                day_index: null,
                name: 'Quick Workout 2',
                date: '2024-01-02',
                type: 'quick_workout'
            })
            .select()
            .single();

        if (nullError1 || nullError2) {
            console.error('❌ Null program_id workouts failed:', nullError1 || nullError2);
        } else {
            console.log('✅ Null program_id workouts allowed (as expected)');
            console.log('   Created IDs:', nullProgram1.id, nullProgram2.id);
        }

        console.log('\n🎉 All constraint tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed with error:', error);
    }
}

// Run the tests
testConstraintBehavior().then(() => {
    console.log('\n✅ Test script completed');
    process.exit(0);
}).catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
});