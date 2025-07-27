# Supabase Testing Guide

This guide covers the comprehensive testing framework for Supabase integration in the exercise tracker application.

## Overview

The testing framework provides:
- **Unit Tests**: Mock-based tests for individual functions and components
- **Integration Tests**: Real database tests with automatic cleanup
- **Test Helpers**: Utilities for creating test data and managing database state
- **Custom Matchers**: Jest extensions for Supabase-specific assertions

## Setup

### Prerequisites

1. **Supabase CLI**: Install the Supabase CLI for local development
   ```bash
   npm install -g supabase
   ```

2. **Local Supabase Instance**: Start Supabase locally for integration tests
   ```bash
   npx supabase start
   ```

3. **Environment Variables**: Set up test environment variables
   ```bash
   # .env.local or .env.test
   REACT_APP_SUPABASE_LOCAL_URL=http://localhost:54321
   REACT_APP_SUPABASE_LOCAL_ANON_KEY=your-local-anon-key
   REACT_APP_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

### Test Configuration

The testing framework is configured in:
- `src/setupSupabaseTests.js` - Main test setup
- `src/utils/testHelpers.js` - Test utilities and helpers
- `src/testConfig.js` - Centralized test configuration

## Running Tests

### Basic Commands

```bash
# Run all unit tests
npm run test:unit

# Run all integration tests (requires local Supabase)
npm run test:integration

# Run Supabase-specific tests
npm run test:supabase

# Run tests with coverage
npm run test:supabase:coverage

# Run tests in watch mode
npm run test:supabase:watch
```

### Advanced Commands

```bash
# Run only unit tests
npm run test:supabase:unit

# Run only integration tests
npm run test:supabase:integration

# Run specific test file
npm test -- --testPathPattern=userService

# Run tests with verbose output
npm test -- --verbose
```

## Test Structure

### Unit Tests

Unit tests use mocked Supabase clients and focus on testing individual functions:

```javascript
// src/services/__tests__/userService.test.js
import { createUserProfile } from '../userService'
import { createMockSupabaseClient } from '../../utils/testHelpers'

const mockSupabase = createMockSupabaseClient()
jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase
}))

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create a user profile', async () => {
    const mockUser = { id: 'test-123', email: 'test@example.com' }
    const mockProfile = { name: 'Test User' }

    mockSupabase.from().single.mockResolvedValue({
      data: { ...mockUser, ...mockProfile },
      error: null
    })

    const result = await createUserProfile(mockUser, mockProfile)
    
    expect(result).toBeDefined()
    expect(mockSupabase.from).toHaveBeenCalledWith('users')
  })
})
```

### Integration Tests

Integration tests use real Supabase connections with automatic cleanup:

```javascript
// src/services/__tests__/userService.integration.test.js
import { createUserProfile } from '../userService'
import { DatabaseTestUtils, skipIfSupabaseUnavailable } from '../../utils/testHelpers'

describe('UserService Integration Tests', () => {
  let dbUtils

  skipIfSupabaseUnavailable()

  beforeAll(async () => {
    dbUtils = new DatabaseTestUtils()
    await dbUtils.verifyConnection()
  })

  afterAll(async () => {
    if (dbUtils) {
      await dbUtils.cleanup()
    }
  })

  it('should create a user profile in the database', async () => {
    const mockUser = { id: 'test-123', email: 'test@example.com' }
    const mockProfile = { name: 'Test User' }

    const result = await createUserProfile(mockUser, mockProfile)
    
    expect(result).toBeDefined()
    expect(result.email).toBe(mockUser.email)
    
    // Track for cleanup
    dbUtils.createdRecords.users.push(result.id)
  })
})
```

## Test Helpers

### DatabaseTestUtils

The `DatabaseTestUtils` class provides comprehensive database testing utilities:

```javascript
import { DatabaseTestUtils } from '../../utils/testHelpers'

const dbUtils = new DatabaseTestUtils()

// Create test data
const user = await dbUtils.createTestUser()
const exercise = await dbUtils.createTestExercise()
const program = await dbUtils.createTestProgram(user.id)

// Create complete test scenarios
const { program, exercises, workouts } = await dbUtils.createCompleteTestProgram(user.id)

// Cleanup (automatic in afterAll hooks)
await dbUtils.cleanup()
```

### Test Data Generators

Use built-in generators for consistent test data:

```javascript
import { testDataGenerators } from '../../utils/testHelpers'

const testUser = testDataGenerators.createTestUser({
  name: 'Custom Test User',
  age: 30
})

const testExercise = testDataGenerators.createTestExercise({
  name: 'Custom Exercise',
  primary_muscle_group: 'Legs'
})
```

### Mock Supabase Client

For unit tests, use the mock Supabase client:

```javascript
import { createMockSupabaseClient } from '../../utils/testHelpers'

const mockSupabase = createMockSupabaseClient()

// Mock successful response
mockSupabase.from().single.mockResolvedValue({
  data: { id: '123', name: 'Test' },
  error: null
})

// Mock error response
mockSupabase.from().single.mockResolvedValue({
  data: null,
  error: { code: 'PGRST116', message: 'Not found' }
})
```

## Custom Jest Matchers

The framework includes custom matchers for Supabase testing:

```javascript
// Test successful Supabase response
expect(response).toBeSuccessfulSupabaseResponse()

// Test Supabase error
expect(response).toHaveSupabaseError()
expect(response).toHaveSupabaseError('PGRST116')
```

## Best Practices

### 1. Test Isolation

- Each test should be independent
- Use `beforeEach` and `afterEach` for cleanup
- Don't rely on test execution order

### 2. Data Management

- Use `DatabaseTestUtils` for consistent test data creation
- Always clean up test data in `afterAll` hooks
- Use unique identifiers to avoid conflicts

### 3. Mocking Strategy

- Mock external dependencies in unit tests
- Use real database connections in integration tests
- Mock time-dependent functions for consistent results

### 4. Error Testing

- Test both success and error scenarios
- Use specific error codes for assertions
- Test edge cases and boundary conditions

### 5. Performance

- Run integration tests serially (`--runInBand`)
- Use appropriate timeouts for database operations
- Clean up resources promptly

## Troubleshooting

### Common Issues

1. **Supabase Not Running**
   ```
   Error: Database connection failed
   ```
   **Solution**: Start Supabase locally with `npx supabase start`

2. **Missing Environment Variables**
   ```
   Error: Test Supabase configuration is missing
   ```
   **Solution**: Set `REACT_APP_SUPABASE_LOCAL_ANON_KEY` and `REACT_APP_SUPABASE_SERVICE_ROLE_KEY`

3. **Test Timeouts**
   ```
   Error: Timeout - Async callback was not invoked within the 5000ms timeout
   ```
   **Solution**: Increase timeout in test configuration or optimize test setup

4. **Foreign Key Constraints**
   ```
   Error: insert or update on table violates foreign key constraint
   ```
   **Solution**: Create parent records before child records in tests

### Debugging

1. **Enable Verbose Logging**
   ```bash
   npm test -- --verbose
   ```

2. **Run Single Test**
   ```bash
   npm test -- --testNamePattern="should create user"
   ```

3. **Check Supabase Status**
   ```bash
   npx supabase status
   ```

4. **View Database Logs**
   ```bash
   npx supabase logs db
   ```

## Migration from Firebase Tests

When migrating existing Firebase tests:

1. **Replace Firebase Imports**
   ```javascript
   // Old
   import { firebase } from '../firebase'
   
   // New
   import { supabase } from '../config/supabase'
   ```

2. **Update Mock Structure**
   ```javascript
   // Old
   jest.mock('../firebase')
   
   // New
   import { createMockSupabaseClient } from '../utils/testHelpers'
   const mockSupabase = createMockSupabaseClient()
   jest.mock('../config/supabase', () => ({ supabase: mockSupabase }))
   ```

3. **Convert Data Structures**
   - Firebase documents → PostgreSQL rows
   - Firestore collections → Supabase tables
   - Firebase Auth → Supabase Auth

4. **Update Assertions**
   ```javascript
   // Old
   expect(result.exists).toBe(true)
   
   // New
   expect(result).not.toBeNull()
   ```

## Examples

### Complete Test File Example

```javascript
// src/services/__tests__/exampleService.test.js
import { exampleFunction } from '../exampleService'
import { createMockSupabaseClient, DatabaseTestUtils } from '../../utils/testHelpers'

// Unit tests with mocks
describe('ExampleService Unit Tests', () => {
  const mockSupabase = createMockSupabaseClient()
  
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should handle successful operation', async () => {
    mockSupabase.from().single.mockResolvedValue({
      data: { id: '123', name: 'Test' },
      error: null
    })

    const result = await exampleFunction('123')
    
    expect(result).toBeDefined()
    expect(result.name).toBe('Test')
  })
})

// Integration tests with real database
describe('ExampleService Integration Tests', () => {
  let dbUtils

  beforeAll(async () => {
    dbUtils = new DatabaseTestUtils()
    await dbUtils.verifyConnection()
  })

  afterAll(async () => {
    if (dbUtils) {
      await dbUtils.cleanup()
    }
  })

  it('should work with real database', async () => {
    const testData = await dbUtils.createTestUser()
    
    const result = await exampleFunction(testData.id)
    
    expect(result).toBeDefined()
    expect(result.id).toBe(testData.id)
  })
})
```

## Conclusion

This testing framework provides comprehensive coverage for Supabase integration while maintaining test isolation and performance. Use unit tests for fast feedback during development and integration tests for end-to-end validation.

For questions or issues, refer to the troubleshooting section or check the test helper documentation in `src/utils/testHelpers.js`.