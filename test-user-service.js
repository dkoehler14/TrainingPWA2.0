// Quick test to verify user service validation is working
const { validateUserProfile } = require('./src/utils/userValidation');

// Test validation directly
console.log('Testing validation directly:');

const invalidData = {
  email: 'invalid-email',
  name: '',
  age: -5
};

const validation = validateUserProfile(invalidData);
console.log('Validation result:', validation);

if (!validation.isValid) {
  console.log('✅ Validation correctly rejects invalid data');
  console.log('Errors:', validation.errors);
} else {
  console.log('❌ Validation should have failed');
}

// Test with valid data
const validData = {
  email: 'test@example.com',
  name: 'Test User',
  age: 25,
  experienceLevel: 'beginner',
  preferredUnits: 'LB'
};

const validValidation = validateUserProfile(validData);
console.log('\nValid data validation:', validValidation);

if (validValidation.isValid) {
  console.log('✅ Validation correctly accepts valid data');
} else {
  console.log('❌ Validation should have passed');
  console.log('Errors:', validValidation.errors);
}