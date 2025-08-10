#!/usr/bin/env node

/**
 * Performance test script for workout log indexes
 * This script tests the performance impact of the new indexes
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

async function createTestData() {
    console.log('📊 Creating test data for performance testing...');
    
    const testUserId = '123e4567-e89b-12d3-a456-426614174000';
    const testProgramId = '123e4567-e89b-12d3-a456-426614174001';
    
    // Clean up existing test data
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
        duration: 12,
        days_per_week: 4
    });
    
    // Create workout logs for 12 weeks, 4 days per week
    const workoutLogs = [];
    for (let week = 0; week < 12; week++) {
        for (let day = 0; day < 4; day++) {
            const date = new Date('2024-01-01');
            date.setDate(date.getDate() + (week * 7) + day);
            
            workoutLogs.push({
                user_id: testUserId,
                program_id: testProgramId,
                week_index: week,
                day_index: day,
                name: `Week ${week + 1} Day ${day + 1}`,
                date: date.toISOString().split('T')[0],
                type: 'program_workout',
                is_finished: Math.random() > 0.3 // 70% finished
            });
        }
    }
    
    // Insert all workout logs
    const { error } = await supabase.from('workout_logs').insert(workoutLogs);
    if (error) {
        console.error('Failed to create test data:', error);
        return false;
    }
    
    console.log(`✅ Created ${workoutLogs.length} workout logs for testing`);
    return true;
}

async function measureQueryPerformance() {
    console.log('\n⏱️  Measuring query performance...\n');
    
    const testUserId = '123e4567-e89b-12d3-a456-426614174000';
    const testProgramId = '123e4567-e89b-12d3-a456-426614174001';
    
    // Test 1: Cache-first lookup (most common operation)
    console.log('📝 Test 1: Cache-first lookup query');
    const start1 = Date.now();
    
    const { data: lookup1, error: error1 } = await supabase
        .from('workout_logs')
        .select('id, name, is_finished')
        .eq('user_id', testUserId)
        .eq('program_id', testProgramId)
        .eq('week_index', 5)
        .eq('day_index', 2)
        .single();
    
    const end1 = Date.now();
    console.log(`   ✅ Query completed in ${end1 - start1}ms`);
    console.log(`   Found: ${lookup1?.name || 'No result'}`);
    
    // Test 2: User workout history (date-ordered)
    console.log('\n📝 Test 2: User workout history query');
    const start2 = Date.now();
    
    const { data: history, error: error2 } = await supabase
        .from('workout_logs')
        .select('id, name, date, is_finished')
        .eq('user_id', testUserId)
        .order('date', { ascending: false })
        .limit(10);
    
    const end2 = Date.now();
    console.log(`   ✅ Query completed in ${end2 - start2}ms`);
    console.log(`   Found ${history?.length || 0} workout logs`);
    
    // Test 3: Draft workouts lookup
    console.log('\n📝 Test 3: Draft workouts query');
    const start3 = Date.now();
    
    const { data: drafts, error: error3 } = await supabase
        .from('workout_logs')
        .select('id, name, created_at')
        .eq('user_id', testUserId)
        .eq('is_draft', true)
        .order('created_at', { ascending: false });
    
    const end3 = Date.now();
    console.log(`   ✅ Query completed in ${end3 - start3}ms`);
    console.log(`   Found ${drafts?.length || 0} draft workouts`);
    
    // Test 4: Program completion status
    console.log('\n📝 Test 4: Program completion status query');
    const start4 = Date.now();
    
    const { data: completed, error: error4 } = await supabase
        .from('workout_logs')
        .select('week_index, day_index, is_finished')
        .eq('program_id', testProgramId)
        .eq('is_finished', true)
        .order('week_index')
        .order('day_index');
    
    const end4 = Date.now();
    console.log(`   ✅ Query completed in ${end4 - start4}ms`);
    console.log(`   Found ${completed?.length || 0} completed workouts`);
    
    // Test 5: Bulk lookup performance (simulate cache validation)
    console.log('\n📝 Test 5: Bulk cache validation simulation');
    const start5 = Date.now();
    
    const lookupPromises = [];
    for (let i = 0; i < 10; i++) {
        const week = Math.floor(Math.random() * 12);
        const day = Math.floor(Math.random() * 4);
        
        lookupPromises.push(
            supabase
                .from('workout_logs')
                .select('id')
                .eq('user_id', testUserId)
                .eq('program_id', testProgramId)
                .eq('week_index', week)
                .eq('day_index', day)
                .maybeSingle()
        );
    }
    
    const results = await Promise.all(lookupPromises);
    const end5 = Date.now();
    
    const foundCount = results.filter(r => r.data).length;
    console.log(`   ✅ 10 parallel lookups completed in ${end5 - start5}ms`);
    console.log(`   Found ${foundCount}/10 workout logs`);
    
    return {
        cacheFirstLookup: end1 - start1,
        workoutHistory: end2 - start2,
        draftLookup: end3 - start3,
        programCompletion: end4 - start4,
        bulkValidation: end5 - start5
    };
}

async function testConstraintViolationHandling() {
    console.log('\n🚫 Testing constraint violation handling...\n');
    
    const testUserId = '123e4567-e89b-12d3-a456-426614174000';
    const testProgramId = '123e4567-e89b-12d3-a456-426614174001';
    
    // Test multiple rapid inserts (simulate race condition)
    console.log('📝 Testing rapid duplicate inserts...');
    
    const rapidInserts = [];
    for (let i = 0; i < 5; i++) {
        rapidInserts.push(
            supabase
                .from('workout_logs')
                .insert({
                    user_id: testUserId,
                    program_id: testProgramId,
                    week_index: 99,
                    day_index: 0,
                    name: `Rapid Insert ${i}`,
                    date: '2024-12-31',
                    type: 'program_workout'
                })
                .select()
                .single()
        );
    }
    
    const results = await Promise.allSettled(rapidInserts);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`   ✅ ${successful} successful inserts, ${failed} failed (as expected)`);
    
    // Check the actual constraint violation errors
    const errors = results
        .filter(r => r.status === 'rejected')
        .map(r => r.reason?.message || r.reason);
    
    if (errors.length > 0) {
        console.log(`   Constraint violation errors: ${errors[0]}`);
    }
    
    // Test upsert function under rapid calls
    console.log('\n📝 Testing rapid upsert calls...');
    const start = Date.now();
    
    const rapidUpserts = [];
    for (let i = 0; i < 10; i++) {
        rapidUpserts.push(
            supabase.rpc('upsert_workout_log', {
                p_user_id: testUserId,
                p_program_id: testProgramId,
                p_week_index: 98,
                p_day_index: 0,
                p_name: `Rapid Upsert ${i}`,
                p_date: '2024-12-30',
                p_type: 'program_workout',
                p_weight_unit: 'LB',
                p_is_draft: true
            })
        );
    }
    
    const upsertResults = await Promise.all(rapidUpserts);
    const end = Date.now();
    
    // All should return the same ID
    const uniqueIds = new Set(upsertResults.map(r => r.data));
    console.log(`   ✅ ${rapidUpserts.length} upserts completed in ${end - start}ms`);
    console.log(`   All returned same ID: ${uniqueIds.size === 1 ? 'Yes' : 'No'}`);
    console.log(`   Returned ID: ${Array.from(uniqueIds)[0]}`);
}

async function runPerformanceTests() {
    console.log('🚀 Starting Workout Log Performance Tests\n');
    
    try {
        // Create test data
        const dataCreated = await createTestData();
        if (!dataCreated) {
            console.error('❌ Failed to create test data');
            return;
        }
        
        // Measure query performance
        const metrics = await measureQueryPerformance();
        
        // Test constraint violation handling
        await testConstraintViolationHandling();
        
        // Summary
        console.log('\n📊 Performance Summary:');
        console.log('─'.repeat(50));
        console.log(`Cache-first lookup:     ${metrics.cacheFirstLookup}ms`);
        console.log(`Workout history:        ${metrics.workoutHistory}ms`);
        console.log(`Draft lookup:           ${metrics.draftLookup}ms`);
        console.log(`Program completion:     ${metrics.programCompletion}ms`);
        console.log(`Bulk validation (10x):  ${metrics.bulkValidation}ms`);
        console.log('─'.repeat(50));
        
        // Performance thresholds
        const thresholds = {
            cacheFirstLookup: 50,
            workoutHistory: 100,
            draftLookup: 100,
            programCompletion: 150,
            bulkValidation: 200
        };
        
        let allPassed = true;
        console.log('\n✅ Performance Thresholds:');
        for (const [metric, time] of Object.entries(metrics)) {
            const threshold = thresholds[metric];
            const passed = time <= threshold;
            allPassed = allPassed && passed;
            
            console.log(`   ${metric}: ${time}ms ${passed ? '✅' : '❌'} (threshold: ${threshold}ms)`);
        }
        
        if (allPassed) {
            console.log('\n🎉 All performance tests passed!');
        } else {
            console.log('\n⚠️  Some performance tests exceeded thresholds');
        }
        
    } catch (error) {
        console.error('❌ Performance test failed:', error);
    }
}

// Run the performance tests
runPerformanceTests().then(() => {
    console.log('\n✅ Performance test script completed');
    process.exit(0);
}).catch((error) => {
    console.error('❌ Performance test script failed:', error);
    process.exit(1);
});