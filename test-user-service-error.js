// Test to see what error is actually thrown by createUserProfile
const { createUserProfile } = require('./src/services/userService');

async function testValidationError() {
  const mockAuthUser = {
    id: 'auth-123',
    email: 'invalid-email'
  };

  try {
    await createUserProfile(mockAuthUser);
    console.log('❌ Function should have thrown an error');
  } catch (error) {
    console.log('✅ Function threw an error as expected');
    console.log('Error type:', error.constructor.name);
    console.log('Error message:', error.message);
    console.log('Error stack:', error.stack);
  }
}

testValidationError();