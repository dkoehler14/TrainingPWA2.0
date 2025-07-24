# Supabase Edge Functions

This directory contains the Supabase Edge Functions that replace the Firebase Functions in the exercise tracker application migration.

## Overview

The Edge Functions are written in TypeScript and run on Deno runtime. They provide server-side logic for:

- Workout analytics processing
- AI-powered coaching insights
- Data validation and sanitization
- Database triggers and automation

## Functions

### 1. process-workout
**Purpose**: Process completed workouts and update user analytics

**Endpoint**: `POST /functions/v1/process-workout`

**Authentication**: Required (JWT token)

**Request Body**:
```json
{
  "workoutLogId": "uuid-string"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Workout processed successfully",
  "exercisesProcessed": 5
}
```

**Features**:
- Calculates exercise analytics (volume, e1RM, PRs)
- Updates user analytics with enhanced metrics
- Handles both current and legacy data structures
- Supports bodyweight and weighted exercises
- Tracks intensity distribution and effective reps

### 2. coaching-insights
**Purpose**: Generate AI-powered coaching recommendations

**Endpoint**: `POST /functions/v1/coaching-insights`

**Authentication**: Required (JWT token)

**Request Body**: `{}` (empty, uses user context from JWT)

**Response**:
```json
{
  "insights": [
    {
      "type": "strength",
      "title": "Strength Leader",
      "message": "Your strongest exercise is Bench Press...",
      "priority": "medium",
      "actionable": false,
      "data": { "exercise": "Bench Press", "e1rm": 225 }
    }
  ],
  "summary": {
    "totalExercises": 15,
    "recentWorkouts": 8,
    "avgE1RM": 180.5
  }
}
```

**Features**:
- Analyzes strength progress and trends
- Detects muscle group imbalances
- Provides workout frequency recommendations
- Identifies potential plateaus
- Suggests actionable improvements

### 3. data-validation
**Purpose**: Validate and sanitize user input data

**Endpoint**: `POST /functions/v1/data-validation`

**Authentication**: Required (JWT token)

**Request Body**:
```json
{
  "type": "workout|exercise|program|user_profile",
  "data": { /* data to validate */ }
}
```

**Response**:
```json
{
  "valid": true,
  "errors": [],
  "warnings": ["Unusually high weight detected"],
  "sanitizedData": { /* cleaned data */ }
}
```

**Features**:
- Validates workout logs, exercises, programs, and user profiles
- Sanitizes input data to prevent injection attacks
- Provides detailed error messages and warnings
- Ensures data integrity before database operations

### 4. workout-triggers
**Purpose**: Handle database triggers for workout events

**Endpoint**: `POST /functions/v1/workout-triggers` (webhook)

**Authentication**: Not required (internal webhook)

**Request Body**:
```json
{
  "type": "INSERT|UPDATE|DELETE",
  "table": "workout_logs",
  "record": { /* new record data */ },
  "old_record": { /* previous record data */ }
}
```

**Features**:
- Automatic workout processing on completion
- User statistics updates
- Achievement tracking
- Real-time analytics updates

## Shared Utilities

### _shared/cors.ts
CORS headers configuration for all functions.

### _shared/database.ts
Database client creation and authentication utilities.

### _shared/logger.ts
Structured logging with different log levels and external service integration.

### _shared/monitoring.ts
Performance monitoring and health check utilities.

### _shared/error-handler.ts
Centralized error handling with structured error responses and rate limiting.

## Development

### Prerequisites
- Supabase CLI installed (`npm install -g supabase`)
- Deno runtime (automatically handled by Supabase)
- Local Supabase instance running (`supabase start`)

### Local Development
```bash
# Start Supabase locally
npm run supabase:start

# Serve functions locally
npm run functions:serve

# Test functions
npm run functions:test

# Deploy functions
npm run functions:deploy
```

### Environment Variables
Required environment variables for Edge Functions:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access
- `FUNCTION_VERSION`: Version identifier for monitoring

### Testing

#### Automated Testing
```bash
# Test all functions
npm run functions:test

# Test specific function
npm run functions:test process-workout

# Skip CORS tests
npm run functions:test -- --skip-cors
```

#### Manual Testing
```bash
# Test process-workout function
curl -X POST "http://localhost:54321/functions/v1/process-workout" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workoutLogId": "test-id"}'

# Test coaching-insights function
curl -X POST "http://localhost:54321/functions/v1/coaching-insights" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Deployment

#### Development/Staging
```bash
# Deploy all functions
npm run functions:deploy

# Deploy specific function
npm run functions:deploy process-workout
```

#### Production
```bash
# Set production environment variables
export SUPABASE_PROJECT_REF="your-prod-project-ref"

# Deploy with production config
npm run functions:deploy
```

### Monitoring

#### Logs
```bash
# View function logs
npm run functions:logs

# View specific function logs
supabase functions logs process-workout
```

#### Performance Metrics
Functions automatically track:
- Execution time
- Memory usage
- Success/failure rates
- Error details

Metrics are stored in the `function_performance_metrics` table.

#### Health Checks
Each function includes health check endpoints and automatic monitoring.

## Migration from Firebase Functions

### Key Changes
1. **Runtime**: Node.js → Deno
2. **Language**: JavaScript → TypeScript
3. **Database**: Firestore → PostgreSQL
4. **Authentication**: Firebase Auth → Supabase Auth
5. **Triggers**: Firestore triggers → Database webhooks

### Function Mapping
| Firebase Function | Edge Function | Status |
|------------------|---------------|---------|
| `processWorkoutManually` | `process-workout` | ✅ Complete |
| `generateCoachingInsights` | `coaching-insights` | ✅ Complete |
| `migrateWorkoutLogsCompletedDate` | `data-migration` | 🚧 Planned |
| `processWorkout` (trigger) | `workout-triggers` | ✅ Complete |

### Client-Side Updates Required
1. Replace Firebase Functions calls with fetch requests
2. Update authentication token handling
3. Modify error handling for new response format
4. Update function URLs and endpoints

Example client-side change:
```javascript
// Before (Firebase)
import { httpsCallable } from 'firebase/functions'
const processWorkout = httpsCallable(functions, 'processWorkoutManually')
const result = await processWorkout({ workoutLogId })

// After (Supabase)
const response = await fetch('/functions/v1/process-workout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ workoutLogId })
})
const result = await response.json()
```

## Security

### Authentication
All functions (except webhooks) require valid Supabase JWT tokens.

### Rate Limiting
Built-in rate limiting (100 requests per minute per user by default).

### Input Validation
All user inputs are validated and sanitized before processing.

### CORS
Proper CORS headers configured for web application access.

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Ensure JWT token is valid and not expired
   - Check token format: `Bearer <token>`

2. **Database Connection Issues**
   - Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly
   - Check database is accessible from Edge Functions

3. **CORS Issues**
   - Verify CORS headers are properly configured
   - Check origin is allowed in CORS settings

4. **Function Timeout**
   - Increase timeout in function configuration
   - Optimize database queries for better performance

### Debug Mode
Enable debug logging by setting `REACT_APP_DEBUG_MODE=true` in development.

### Support
For issues and questions, check:
1. Function logs: `npm run functions:logs`
2. Supabase dashboard for function metrics
3. Database logs for query issues