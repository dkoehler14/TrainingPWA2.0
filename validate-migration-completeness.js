#!/usr/bin/env node

/**
 * Migration Completeness Validation Script
 * Validates that LogWorkout.js has been completely migrated from Firebase to Supabase
 */

const fs = require('fs');
const path = require('path');

// Read the LogWorkout.js file
const logWorkoutPath = path.join(__dirname, 'src', 'pages', 'LogWorkout.js');

if (!fs.existsSync(logWorkoutPath)) {
  console.error('❌ LogWorkout.js file not found at:', logWorkoutPath);
  process.exit(1);
}

const fileContent = fs.readFileSync(logWorkoutPath, 'utf8');

// Validation results
const validationResults = {
  noFirebaseImports: true,
  noFirebaseOperations: true,
  usesSupabaseServices: true,
  usesSupabaseErrorHandling: true,
  issues: []
};

console.log('🔍 Validating LogWorkout.js migration completeness...\n');

// 1. Check for Firebase imports
console.log('1. Checking for Firebase imports...');
const firebaseImportPatterns = [
  /from\s+['"]firebase/,
  /import\s+.*firebase/,
  /from\s+['"]firebase\/firestore/,
  /from\s+['"]firebase\/functions/,
  /from\s+['"]firebase\/auth/
];

let hasFirebaseImports = false;
firebaseImportPatterns.forEach(pattern => {
  if (pattern.test(fileContent)) {
    hasFirebaseImports = true;
    validationResults.issues.push(`Found Firebase import: ${pattern}`);
  }
});

if (hasFirebaseImports) {
  console.log('❌ Firebase imports found');
  validationResults.noFirebaseImports = false;
} else {
  console.log('✅ No Firebase imports found');
}

// 2. Check for Firebase operations
console.log('\n2. Checking for Firebase operations...');
const firebaseOperationPatterns = [
  /addDoc\s*\(/,
  /updateDoc\s*\(/,
  /collection\s*\(/,
  /doc\s*\(/,
  /getDoc\s*\(/,
  /getDocs\s*\(/,
  /onSnapshot\s*\(/,
  /httpsCallable\s*\(/,
  /Timestamp\.fromDate/,
  /getCollectionCached\s*\(/,
  /getDocCached\s*\(/,
  /invalidateWorkoutCache\s*\(/,
  /invalidateProgramCache\s*\(/
];

let hasFirebaseOperations = false;
firebaseOperationPatterns.forEach(pattern => {
  if (pattern.test(fileContent)) {
    hasFirebaseOperations = true;
    validationResults.issues.push(`Found Firebase operation: ${pattern}`);
  }
});

if (hasFirebaseOperations) {
  console.log('❌ Firebase operations found');
  validationResults.noFirebaseOperations = false;
} else {
  console.log('✅ No Firebase operations found');
}

// 3. Check for Supabase service usage
console.log('\n3. Checking for Supabase service usage...');
const supabaseServicePatterns = [
  /workoutLogService\./,
  /programService\./,
  /exerciseService\./,
  /getUserPrograms\s*\(/,
  /getAvailableExercises\s*\(/,
  /updateProgramExercise\s*\(/
];

let usesSupabaseServices = false;
supabaseServicePatterns.forEach(pattern => {
  if (pattern.test(fileContent)) {
    usesSupabaseServices = true;
  }
});

if (usesSupabaseServices) {
  console.log('✅ Uses Supabase services');
} else {
  console.log('❌ Does not use Supabase services');
  validationResults.usesSupabaseServices = false;
  validationResults.issues.push('No Supabase service usage found');
}

// 4. Check for Supabase error handling
console.log('\n4. Checking for Supabase error handling...');
const supabaseErrorHandlingPatterns = [
  /handleSupabaseError\s*\(/,
  /executeSupabaseOperation\s*\(/,
  /SupabaseError/
];

let usesSupabaseErrorHandling = false;
supabaseErrorHandlingPatterns.forEach(pattern => {
  if (pattern.test(fileContent)) {
    usesSupabaseErrorHandling = true;
  }
});

if (usesSupabaseErrorHandling) {
  console.log('✅ Uses Supabase error handling');
} else {
  console.log('❌ Does not use Supabase error handling');
  validationResults.usesSupabaseErrorHandling = false;
  validationResults.issues.push('No Supabase error handling found');
}

// 5. Check for direct Supabase client usage (should be avoided)
console.log('\n5. Checking for direct Supabase client usage...');
const directSupabasePatterns = [
  /supabase\.from\s*\(/,
  /supabase\.rpc\s*\(/
];

let hasDirectSupabaseUsage = false;
directSupabasePatterns.forEach(pattern => {
  if (pattern.test(fileContent)) {
    hasDirectSupabaseUsage = true;
    validationResults.issues.push(`Found direct Supabase usage (should use services): ${pattern}`);
  }
});

if (hasDirectSupabaseUsage) {
  console.log('⚠️  Direct Supabase client usage found (should use services)');
} else {
  console.log('✅ No direct Supabase client usage found');
}

// 6. Check for proper authentication usage
console.log('\n6. Checking for authentication usage...');
const authPatterns = [
  /useAuth\s*\(\)/,
  /user\?.id/
];

let usesAuth = false;
authPatterns.forEach(pattern => {
  if (pattern.test(fileContent)) {
    usesAuth = true;
  }
});

if (usesAuth) {
  console.log('✅ Uses Supabase authentication');
} else {
  console.log('⚠️  Authentication usage not detected');
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('MIGRATION VALIDATION SUMMARY');
console.log('='.repeat(50));

const allValidationsPassed = validationResults.noFirebaseImports && 
                            validationResults.noFirebaseOperations && 
                            validationResults.usesSupabaseServices && 
                            validationResults.usesSupabaseErrorHandling;

if (allValidationsPassed) {
  console.log('🎉 MIGRATION COMPLETE: All validations passed!');
  console.log('✅ No Firebase imports remain');
  console.log('✅ No Firebase operations remain');
  console.log('✅ Uses Supabase services');
  console.log('✅ Uses Supabase error handling');
} else {
  console.log('❌ MIGRATION INCOMPLETE: Issues found');
  validationResults.issues.forEach(issue => {
    console.log(`   - ${issue}`);
  });
}

// Additional checks
console.log('\nAdditional Information:');
console.log(`📄 File size: ${fileContent.length} characters`);
console.log(`📝 Lines of code: ${fileContent.split('\n').length}`);

// Count service method calls
const workoutLogServiceCalls = (fileContent.match(/workoutLogService\./g) || []).length;
const programServiceCalls = (fileContent.match(/getUserPrograms|updateProgramExercise/g) || []).length;
const exerciseServiceCalls = (fileContent.match(/getAvailableExercises/g) || []).length;

console.log(`🔧 WorkoutLogService calls: ${workoutLogServiceCalls}`);
console.log(`🔧 ProgramService calls: ${programServiceCalls}`);
console.log(`🔧 ExerciseService calls: ${exerciseServiceCalls}`);

// Export results for programmatic use
const results = {
  success: allValidationsPassed,
  validationResults,
  stats: {
    fileSize: fileContent.length,
    linesOfCode: fileContent.split('\n').length,
    serviceCalls: {
      workoutLogService: workoutLogServiceCalls,
      programService: programServiceCalls,
      exerciseService: exerciseServiceCalls
    }
  }
};

// Write results to file
fs.writeFileSync('migration-validation-results.json', JSON.stringify(results, null, 2));
console.log('\n📊 Detailed results saved to migration-validation-results.json');

process.exit(allValidationsPassed ? 0 : 1);