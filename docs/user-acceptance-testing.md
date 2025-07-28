# User Acceptance Testing Guide

This document describes the comprehensive user acceptance testing (UAT) suite for the Firestore to Supabase migration, covering all features with realistic user scenarios, authentication flows, data security, and performance requirements.

## Overview

The User Acceptance Testing suite validates that the migrated system meets all user requirements and provides a seamless experience. It covers:

- **Authentication Flows**: Complete user registration, login, and session management
- **Data Security**: User data isolation, privacy, and security policies
- **Performance Standards**: System responsiveness and load handling
- **Feature Completeness**: All user workflows function end-to-end
- **Real-time Features**: Live updates and synchronization

## Requirements Coverage

The UAT suite specifically addresses these migration requirements:

- **Requirement 2.3**: Authentication flows and user experience
- **Requirement 5.1**: Performance meets or exceeds current system
- **Requirement 5.5**: System handles load efficiently

## User Stories Tested

### 1. New User Registration and Onboarding
**Scenario**: A new user discovers the application and wants to create an account

**Test Flow**:
1. User navigates to registration page
2. User fills out registration form with email, password, and name
3. User submits registration
4. System sends confirmation email
5. User completes profile setup with personal information
6. User selects fitness goals and available equipment
7. System creates personalized experience

**Validation**:
- Registration completes within 2 seconds
- Email confirmation is sent
- Profile data is properly stored
- User preferences are applied

### 2. Returning User Login and Dashboard Access
**Scenario**: An existing user returns to access their fitness data

**Test Flow**:
1. User enters login credentials
2. System authenticates user
3. User is redirected to dashboard
4. Dashboard loads with personalized data
5. Recent activity and progress are displayed

**Validation**:
- Login completes within 2 seconds
- Session is properly established
- User data loads correctly
- Dashboard is responsive

### 3. Exercise Discovery and Management
**Scenario**: User wants to explore and manage exercises

**Test Flow**:
1. User browses exercise library
2. User searches for specific exercises
3. User filters exercises by muscle group
4. User creates custom exercise
5. Custom exercise appears in library

**Validation**:
- Exercise library loads within 2 seconds
- Search returns relevant results
- Filtering works correctly
- Custom exercise creation succeeds

### 4. Program Creation and Management
**Scenario**: User creates a structured workout program

**Test Flow**:
1. User starts program creation
2. User fills out program details
3. User adds workouts for different days
4. User adds exercises to each workout
5. User saves complete program
6. User activates program as current

**Validation**:
- Program creation completes successfully
- All exercises and workouts are saved
- Program appears in user's program list
- Program can be activated

### 5. Workout Logging and Tracking
**Scenario**: User logs a workout session

**Test Flow**:
1. User starts workout from current program
2. User logs weights and reps for each exercise
3. System auto-saves progress
4. User adds workout notes
5. User completes workout
6. Workout is saved to history

**Validation**:
- Workout data is saved in real-time
- Auto-save functions properly
- Workout completion updates analytics
- Data persists correctly

### 6. Progress Tracking and Analytics
**Scenario**: User reviews their fitness progress

**Test Flow**:
1. User navigates to progress tracker
2. System displays workout history
3. User views exercise progression
4. User checks personal records
5. User reviews analytics and trends

**Validation**:
- Progress data loads within 2 seconds
- Analytics calculations are accurate
- Trends show proper progression
- Personal records are highlighted

### 7. Data Security and Privacy
**Scenario**: Verify user data is properly secured

**Test Flow**:
1. System enforces user data isolation
2. Authentication tokens are validated
3. Row-level security policies work
4. Unauthorized access is prevented

**Validation**:
- Users can only access their own data
- Security policies are enforced
- Session management is secure
- Data privacy is maintained

### 8. Performance and Responsiveness
**Scenario**: System handles load efficiently

**Test Flow**:
1. System processes large datasets
2. Multiple concurrent operations execute
3. Real-time updates function properly
4. UI remains responsive under load

**Validation**:
- All operations complete within 2 seconds
- Concurrent operations don't conflict
- System handles large datasets
- UI remains responsive

### 9. Real-time Features and Synchronization
**Scenario**: Real-time updates work across sessions

**Test Flow**:
1. User makes changes in one session
2. Changes propagate to other sessions
3. Real-time subscriptions function
4. Data synchronization is accurate

**Validation**:
- Real-time updates are received
- Data synchronization is accurate
- No conflicts or data loss
- Performance remains good

## Running User Acceptance Tests

### Prerequisites

1. **Node.js**: Version 18+ or 20+
2. **Supabase CLI**: Installed and configured
3. **Environment Variables**:
   ```bash
   REACT_APP_SUPABASE_LOCAL_URL=http://localhost:54321
   REACT_APP_SUPABASE_LOCAL_ANON_KEY=your-anon-key
   ```
4. **Local Supabase**: Running with `supabase start`

### Quick Start

```bash
# Run user acceptance tests
npm run test:user-acceptance

# Run in CI mode (non-interactive)
npm run test:user-acceptance:ci

# Alternative commands
npm run test:uat
npm run test:uat:ci
```

### Manual Execution

```bash
# Set up environment
export NODE_ENV=test
export JEST_USER_ACCEPTANCE_TESTS=true

# Start Supabase if not running
supabase start

# Run the test script directly
node scripts/run-user-acceptance-tests.js

# Or run Jest directly
npx jest src/__tests__/user-acceptance.test.js --verbose
```

## Test Environment Setup

### Automatic Setup

The test runner automatically:
1. Checks prerequisites (Node.js, Supabase CLI, environment variables)
2. Starts Supabase if not running
3. Resets database schema to ensure clean state
4. Sets up test environment variables
5. Runs all user acceptance tests
6. Generates comprehensive reports
7. Validates acceptance criteria
8. Cleans up test artifacts

### Manual Setup

If you need to set up the test environment manually:

```bash
# Start Supabase
supabase start

# Reset database schema
supabase db reset

# Set environment variables
export NODE_ENV=test
export JEST_USER_ACCEPTANCE_TESTS=true
export REACT_APP_SUPABASE_LOCAL_URL=http://localhost:54321
export REACT_APP_SUPABASE_LOCAL_ANON_KEY=your-anon-key

# Verify connection
node -e "
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.REACT_APP_SUPABASE_LOCAL_URL, process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY);
client.from('users').select('count').limit(1).then(console.log);
"
```

## Performance Metrics

### Performance Thresholds

All operations must complete within these thresholds:

- **Authentication Operations**: < 2 seconds
- **Data Operations**: < 2 seconds  
- **UI Operations**: < 2 seconds
- **Real-time Updates**: < 1 second

### Tracked Metrics

The test suite tracks performance for:

- User registration and login
- Profile creation and updates
- Exercise library loading and search
- Program creation and management
- Workout logging and completion
- Progress dashboard loading
- Real-time update propagation
- Concurrent operation handling

### Performance Validation

Each test automatically validates performance:

```javascript
const trackPerformance = (category, operation, duration) => {
  performanceMetrics[category].push({
    operation,
    duration,
    timestamp: Date.now()
  })
  
  // Assert performance threshold
  expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD)
}
```

## Test Reports

### Report Generation

The test runner generates comprehensive reports:

```
test-results/
├── user-acceptance-test-report.json
├── coverage/
│   └── user-acceptance-tests/
│       ├── index.html
│       └── lcov.info
└── performance-metrics.json
```

### Report Contents

**JSON Report Structure**:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "testSuite": "User Acceptance Tests",
  "description": "Comprehensive user acceptance testing",
  "requirements": [
    "2.3: Authentication flows and user experience",
    "5.1: Performance meets or exceeds current system",
    "5.5: System handles load efficiently"
  ],
  "result": {
    "success": true,
    "duration": 45000,
    "exitCode": 0
  },
  "userStories": [
    "New User Registration and Onboarding",
    "Returning User Login and Dashboard Access",
    "Exercise Discovery and Management",
    "Program Creation and Management",
    "Workout Logging and Tracking",
    "Progress Tracking and Analytics",
    "Data Security and Privacy",
    "Performance and Responsiveness",
    "Real-time Features and Synchronization"
  ],
  "performanceMetrics": {
    "authOperationsThreshold": "2000ms",
    "dataOperationsThreshold": "2000ms",
    "uiOperationsThreshold": "2000ms"
  }
}
```

### Coverage Reports

- **Line Coverage**: Percentage of code lines executed during tests
- **Function Coverage**: Percentage of functions called
- **Branch Coverage**: Percentage of code branches taken
- **Statement Coverage**: Percentage of statements executed

## Acceptance Criteria Validation

### Authentication Flows (Requirement 2.3)

✅ **User Registration**
- New users can register with email and password
- Email confirmation process works
- Profile setup is guided and intuitive

✅ **User Login**
- Existing users can log in successfully
- Session management works properly
- Password reset functionality available

✅ **Session Management**
- Sessions persist across browser refreshes
- Automatic token refresh works
- Secure logout clears session data

### Data Security (Requirement 2.3)

✅ **Row-Level Security**
- Users can only access their own data
- Database policies enforce data isolation
- Unauthorized access attempts are blocked

✅ **Authentication Security**
- JWT tokens are properly validated
- Session expiry is handled correctly
- Sensitive data is protected

### Performance Standards (Requirements 5.1, 5.5)

✅ **Response Times**
- All operations complete within 2 seconds
- UI remains responsive during operations
- Real-time updates are near-instantaneous

✅ **Load Handling**
- System handles concurrent users
- Large datasets are processed efficiently
- Memory usage remains reasonable

### Feature Completeness

✅ **Core Workflows**
- Exercise management works end-to-end
- Program creation and management functional
- Workout logging captures all data
- Progress tracking shows accurate analytics

✅ **Real-time Features**
- Live updates propagate correctly
- Data synchronization is accurate
- No conflicts or data loss

## Troubleshooting

### Common Issues

1. **Supabase Not Running**
   ```bash
   # Check status
   supabase status
   
   # Start if needed
   supabase start
   ```

2. **Environment Variables Missing**
   ```bash
   # Check variables
   echo $REACT_APP_SUPABASE_LOCAL_URL
   echo $REACT_APP_SUPABASE_LOCAL_ANON_KEY
   
   # Set if missing
   export REACT_APP_SUPABASE_LOCAL_URL=http://localhost:54321
   export REACT_APP_SUPABASE_LOCAL_ANON_KEY=your-key
   ```

3. **Database Schema Issues**
   ```bash
   # Reset database
   supabase db reset
   
   # Check migrations
   supabase migration list
   ```

4. **Test Timeouts**
   - Increase timeout in test configuration
   - Check system resources
   - Verify database performance

5. **Performance Issues**
   - Monitor system resources
   - Check database query performance
   - Verify network connectivity

### Debug Mode

Enable verbose logging for debugging:

```bash
# Enable debug output
export DEBUG=true
export REACT_APP_DEBUG_MODE=true
export REACT_APP_VERBOSE_LOGGING=true

# Run tests with debug info
npm run test:user-acceptance
```

### Performance Debugging

Monitor test performance:

```bash
# Run with performance monitoring
node --inspect scripts/run-user-acceptance-tests.js

# Profile memory usage
node --inspect --max-old-space-size=4096 scripts/run-user-acceptance-tests.js
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: User Acceptance Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  user-acceptance-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest
      
      - name: Start Supabase
        run: supabase start
      
      - name: Run user acceptance tests
        run: npm run test:user-acceptance:ci
        env:
          CI: true
          NODE_ENV: test
          JEST_USER_ACCEPTANCE_TESTS: true
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: user-acceptance-test-results
          path: test-results/
      
      - name: Upload coverage reports
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: user-acceptance-coverage
          path: coverage/user-acceptance-tests/
```

## Best Practices

### Test Writing

1. **User-Centric**: Tests should reflect real user workflows
2. **Performance-Aware**: Include performance assertions
3. **Comprehensive**: Cover all critical user paths
4. **Realistic Data**: Use realistic test data and scenarios
5. **Error Handling**: Test both success and failure scenarios

### Test Maintenance

1. **Regular Updates**: Keep tests updated with application changes
2. **Performance Monitoring**: Monitor test execution times
3. **Coverage Goals**: Maintain high coverage for user workflows
4. **Documentation**: Keep test documentation current

### Debugging Tests

1. **Verbose Output**: Use verbose mode for detailed output
2. **Selective Running**: Run individual test scenarios during development
3. **Data Inspection**: Use database inspection tools to verify test data
4. **Performance Profiling**: Profile slow tests to identify bottlenecks

## Migration Validation

The user acceptance tests validate complete migration success:

### Migration Completeness Checks

1. **No Firebase Dependencies**: Ensures all Firebase code is removed
2. **Supabase Integration**: Verifies complete Supabase integration
3. **Feature Parity**: Confirms all features work as before
4. **Performance Improvement**: Validates performance meets or exceeds Firestore
5. **Data Integrity**: Ensures all user data is properly migrated

### Success Criteria

- ✅ All user stories pass
- ✅ Performance thresholds are met
- ✅ Security requirements are satisfied
- ✅ Real-time features function properly
- ✅ Data integrity is maintained
- ✅ User experience is seamless

## Conclusion

The User Acceptance Testing suite provides comprehensive validation that the Firestore to Supabase migration meets all user requirements. It ensures:

- **Functional Completeness**: All user workflows work end-to-end
- **Performance Standards**: System meets performance requirements
- **Security Compliance**: Data security and privacy are maintained
- **User Experience**: Migration is transparent to users
- **Production Readiness**: System is ready for production deployment

Run the tests regularly during development and before deployments to maintain system quality and ensure user satisfaction.