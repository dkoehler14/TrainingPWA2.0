#!/usr/bin/env node

/**
 * Script to analyze workout_log_exercises for duplicate exercises within the same workout
 * This helps determine if we need data cleanup before adding the unique constraint
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeDuplicates() {
  console.log('🔍 Analyzing workout_log_exercises for duplicate exercises...\n');

  try {
    // Find all duplicate exercise entries within the same workout_log
    const { data: duplicates, error: dupError } = await supabase
      .rpc('analyze_workout_log_duplicates');

    if (dupError) {
      console.log('RPC function not found, using direct query...');

      // Fallback to direct query
      const { data: directDuplicates, error: directError } = await supabase
        .from('workout_log_exercises')
        .select(`
          workout_log_id,
          exercise_id,
          id,
          order_index,
          created_at,
          exercises!inner(name, primary_muscle_group)
        `);

      if (directError) {
        console.error('Error fetching data:', directError);
        return;
      }

      // Process duplicates in JavaScript
      const duplicateGroups = {};
      directDuplicates.forEach(row => {
        const key = `${row.workout_log_id}-${row.exercise_id}`;
        if (!duplicateGroups[key]) {
          duplicateGroups[key] = {
            workout_log_id: row.workout_log_id,
            exercise_id: row.exercise_id,
            exercise_name: row.exercises.name,
            muscle_group: row.exercises.primary_muscle_group,
            entries: []
          };
        }
        duplicateGroups[key].entries.push({
          id: row.id,
          order_index: row.order_index,
          created_at: row.created_at
        });
      });

      const actualDuplicates = Object.values(duplicateGroups)
        .filter(group => group.entries.length > 1)
        .sort((a, b) => a.workout_log_id.localeCompare(b.workout_log_id));

      console.log(`📊 Found ${actualDuplicates.length} groups of duplicate exercises\n`);

      if (actualDuplicates.length > 0) {
        console.log('Duplicate Details:');
        console.log('==================');

        actualDuplicates.forEach((dup, index) => {
          console.log(`${index + 1}. Workout: ${dup.workout_log_id}`);
          console.log(`   Exercise: ${dup.exercise_name} (${dup.muscle_group})`);
          console.log(`   Exercise ID: ${dup.exercise_id}`);
          console.log(`   Instances: ${dup.entries.length}`);
          console.log(`   Order indexes: ${dup.entries.map(e => e.order_index).join(', ')}`);
          console.log(`   IDs: ${dup.entries.map(e => e.id).join(', ')}\n`);
        });

        // Summary statistics
        const totalDuplicateEntries = actualDuplicates.reduce((sum, dup) => sum + dup.entries.length, 0);
        console.log('Summary Statistics:');
        console.log('==================');
        console.log(`Total duplicate groups: ${actualDuplicates.length}`);
        console.log(`Total duplicate entries: ${totalDuplicateEntries}`);
        console.log(`Average duplicates per group: ${(totalDuplicateEntries / actualDuplicates.length).toFixed(1)}`);

        // Save results to file
        const results = {
          analysis_date: new Date().toISOString(),
          total_duplicate_groups: actualDuplicates.length,
          total_duplicate_entries: totalDuplicateEntries,
          duplicates: actualDuplicates
        };

        fs.writeFileSync(
          path.join(__dirname, 'workout-log-duplicates-analysis.json'),
          JSON.stringify(results, null, 2)
        );

        console.log('📄 Results saved to workout-log-duplicates-analysis.json');

      } else {
        console.log('✅ No duplicate exercises found in workout_log_exercises!');
      }

    } else {
      console.log('Duplicates found via RPC:', duplicates);
    }

  } catch (error) {
    console.error('Error analyzing duplicates:', error);
  }
}

// Run the analysis
analyzeDuplicates().then(() => {
  console.log('\n✨ Analysis complete!');
  process.exit(0);
}).catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});