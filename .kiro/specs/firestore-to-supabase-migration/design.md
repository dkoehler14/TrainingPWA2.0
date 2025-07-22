# Design Document

## Overview

This design outlines the migration from Firebase/Firestore to Supabase, transforming the exercise tracker application from a NoSQL document-based architecture to a PostgreSQL relational database with edge functions. The migration addresses the need for better relational data handling, improved query performance, and more cost-effective scaling.

The current application uses Firebase Authentication, Firestore collections, and Firebase Functions. The new architecture will use Supabase Auth, PostgreSQL tables with proper relationships, and Supabase Edge Functions while maintaining all existing functionality.

## Architecture

### Current Architecture (Firebase)
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │────│ Firebase Auth   │    │ Firebase        │
│                 │    │                 │    │ Functions       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Firestore     │
                    │  (NoSQL Docs)   │
                    └─────────────────┘
```

### Target Architecture (Supabase)
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │────│ Supabase Auth   │    │ Supabase Edge   │
│                 │    │                 │    │ Functions       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  PostgreSQL     │
                    │ (Relational)    │
                    └─────────────────┘
```

## Components and Interfaces

### 1. Database Schema Design

#### PostgreSQL Schema
Based on the current Firestore collections, the relational schema will include:

**Users Table**
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE NOT NULL, -- Supabase Auth ID
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    experience_level VARCHAR(50) DEFAULT 'beginner',
    preferred_units VARCHAR(10) DEFAULT 'LB',
    age INTEGER,
    weight DECIMAL(5,2),
    height DECIMAL(5,2),
    goals TEXT[],
    available_equipment TEXT[],
    injuries TEXT[],
    preferences JSONB,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Exercises Table**
```sql
CREATE TABLE exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    primary_muscle_group VARCHAR(100) NOT NULL,
    exercise_type VARCHAR(100) NOT NULL,
    instructions TEXT,
    is_global BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Programs Table**
```sql
CREATE TABLE programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    duration INTEGER NOT NULL, -- weeks
    days_per_week INTEGER NOT NULL,
    weight_unit VARCHAR(10) DEFAULT 'LB',
    difficulty VARCHAR(50),
    goals TEXT[],
    equipment TEXT[],
    is_template BOOLEAN DEFAULT false,
    is_current BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    start_date DATE,
    completed_weeks INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Program Workouts Table**
```sql
CREATE TABLE program_workouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL,
    day_number INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(program_id, week_number, day_number)
);
```

**Program Exercises Table**
```sql
CREATE TABLE program_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_id UUID NOT NULL REFERENCES program_workouts(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id),
    sets INTEGER NOT NULL,
    reps INTEGER, -- NULL for time-based exercises
    rest_minutes INTEGER,
    notes TEXT,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Workout Logs Table**
```sql
CREATE TABLE workout_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_id UUID REFERENCES programs(id),
    week_index INTEGER,
    day_index INTEGER,
    name VARCHAR(255),
    type VARCHAR(50) DEFAULT 'program_workout',
    date DATE NOT NULL,
    completed_date TIMESTAMP WITH TIME ZONE,
    is_finished BOOLEAN DEFAULT false,
    is_draft BOOLEAN DEFAULT false,
    weight_unit VARCHAR(10) DEFAULT 'LB',
    duration INTEGER, -- minutes
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Workout Log Exercises Table**
```sql
CREATE TABLE workout_log_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_log_id UUID NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id),
    sets INTEGER NOT NULL,
    reps INTEGER[],
    weights DECIMAL(6,2)[],
    completed BOOLEAN[],
    bodyweight DECIMAL(5,2),
    notes TEXT,
    is_added BOOLEAN DEFAULT false,
    added_type VARCHAR(50),
    original_index INTEGER DEFAULT -1,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**User Analytics Table**
```sql
CREATE TABLE user_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id),
    total_volume DECIMAL(10,2) DEFAULT 0,
    max_weight DECIMAL(6,2) DEFAULT 0,
    total_reps INTEGER DEFAULT 0,
    total_sets INTEGER DEFAULT 0,
    last_workout_date DATE,
    pr_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, exercise_id)
);
```

#### Indexes for Performance
```sql
-- User lookups
CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);

-- Exercise lookups
CREATE INDEX idx_exercises_muscle_group ON exercises(primary_muscle_group);
CREATE INDEX idx_exercises_type ON exercises(exercise_type);
CREATE INDEX idx_exercises_global ON exercises(is_global);

-- Program lookups
CREATE INDEX idx_programs_user_id ON programs(user_id);
CREATE INDEX idx_programs_current ON programs(user_id, is_current) WHERE is_current = true;
CREATE INDEX idx_programs_active ON programs(user_id, is_active) WHERE is_active = true;

-- Workout log lookups
CREATE INDEX idx_workout_logs_user_date ON workout_logs(user_id, date DESC);
CREATE INDEX idx_workout_logs_user_finished ON workout_logs(user_id, is_finished);
CREATE INDEX idx_workout_logs_drafts ON workout_logs(user_id, is_draft) WHERE is_draft = true;

-- Analytics lookups
CREATE INDEX idx_user_analytics_user_exercise ON user_analytics(user_id, exercise_id);
CREATE INDEX idx_user_analytics_last_workout ON user_analytics(user_id, last_workout_date DESC);
```

### 2. Data Access Layer

#### Supabase Client Configuration
```javascript
// src/config/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})
```

#### Data Access Patterns
Replace Firestore operations with Supabase equivalents:

**Current Firestore Pattern:**
```javascript
// Get user workout logs
const logs = await getCollectionCached('workoutLogs', {
  where: [['userId', '==', userId], ['isWorkoutFinished', '==', true]],
  orderBy: [['completedDate', 'desc']],
  limit: 20
}, 10 * 60 * 1000);
```

**New Supabase Pattern:**
```javascript
// Get user workout logs with related data
const { data: logs, error } = await supabase
  .from('workout_logs')
  .select(`
    *,
    workout_log_exercises (
      *,
      exercises (
        name,
        primary_muscle_group,
        exercise_type
      )
    )
  `)
  .eq('user_id', userId)
  .eq('is_finished', true)
  .order('completed_date', { ascending: false })
  .limit(20);
```

### 3. Authentication Migration

#### Supabase Auth Integration
```javascript
// src/hooks/useAuth.js
import { useEffect, useState } from 'react'
import { supabase } from '../config/supabase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
```

### 4. Caching Strategy

#### Enhanced Caching with Supabase
```javascript
// src/api/supabaseCache.js
class SupabaseCache {
  constructor() {
    this.cache = new Map()
    this.defaultTTL = 5 * 60 * 1000 // 5 minutes
  }

  async getWithCache(key, queryFn, ttl = this.defaultTTL) {
    const cached = this.cache.get(key)
    
    if (cached && !this.isExpired(cached)) {
      return cached.data
    }

    const { data, error } = await queryFn()
    
    if (error) throw error

    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl
    })

    return data
  }

  invalidate(pattern) {
    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  isExpired(entry) {
    return entry.expiry < Date.now()
  }
}

export const supabaseCache = new SupabaseCache()
```

### 5. Real-time Updates

#### Supabase Realtime Integration
```javascript
// src/hooks/useRealtimeWorkouts.js
import { useEffect, useState } from 'react'
import { supabase } from '../config/supabase'

export function useRealtimeWorkouts(userId) {
  const [workouts, setWorkouts] = useState([])

  useEffect(() => {
    if (!userId) return

    // Subscribe to workout log changes
    const subscription = supabase
      .channel('workout_logs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workout_logs',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Workout log change:', payload)
          // Handle real-time updates
          handleWorkoutChange(payload)
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [userId])

  const handleWorkoutChange = (payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload
    
    setWorkouts(current => {
      switch (eventType) {
        case 'INSERT':
          return [...current, newRecord]
        case 'UPDATE':
          return current.map(w => w.id === newRecord.id ? newRecord : w)
        case 'DELETE':
          return current.filter(w => w.id !== oldRecord.id)
        default:
          return current
      }
    })
  }

  return workouts
}
```

## Data Models

### 1. User Model
```typescript
interface User {
  id: string
  authId: string
  email: string
  name: string
  experienceLevel: 'beginner' | 'intermediate' | 'advanced'
  preferredUnits: 'LB' | 'KG'
  age?: number
  weight?: number
  height?: number
  goals: string[]
  availableEquipment: string[]
  injuries: string[]
  preferences: Record<string, any>
  settings: Record<string, any>
  createdAt: string
  updatedAt: string
}
```

### 2. Exercise Model
```typescript
interface Exercise {
  id: string
  name: string
  primaryMuscleGroup: string
  exerciseType: string
  instructions: string
  isGlobal: boolean
  createdBy?: string
  createdAt: string
  updatedAt: string
}
```

### 3. Program Model
```typescript
interface Program {
  id: string
  userId: string
  name: string
  description: string
  duration: number
  daysPerWeek: number
  weightUnit: 'LB' | 'KG'
  difficulty: string
  goals: string[]
  equipment: string[]
  isTemplate: boolean
  isCurrent: boolean
  isActive: boolean
  startDate?: string
  completedWeeks: number
  workouts: ProgramWorkout[]
  createdAt: string
  updatedAt: string
}

interface ProgramWorkout {
  id: string
  programId: string
  weekNumber: number
  dayNumber: number
  name: string
  exercises: ProgramExercise[]
}

interface ProgramExercise {
  id: string
  workoutId: string
  exerciseId: string
  exercise: Exercise
  sets: number
  reps?: number
  restMinutes?: number
  notes?: string
  orderIndex: number
}
```

### 4. Workout Log Model
```typescript
interface WorkoutLog {
  id: string
  userId: string
  programId?: string
  weekIndex?: number
  dayIndex?: number
  name?: string
  type: string
  date: string
  completedDate?: string
  isFinished: boolean
  isDraft: boolean
  weightUnit: 'LB' | 'KG'
  duration?: number
  notes?: string
  exercises: WorkoutLogExercise[]
  createdAt: string
  updatedAt: string
}

interface WorkoutLogExercise {
  id: string
  workoutLogId: string
  exerciseId: string
  exercise: Exercise
  sets: number
  reps: number[]
  weights: number[]
  completed: boolean[]
  bodyweight?: number
  notes?: string
  isAdded: boolean
  addedType?: string
  originalIndex: number
  orderIndex: number
}
```

## Error Handling

### 1. Database Error Handling
```javascript
// src/utils/errorHandling.js
export class DatabaseError extends Error {
  constructor(message, code, details) {
    super(message)
    this.name = 'DatabaseError'
    this.code = code
    this.details = details
  }
}

export function handleSupabaseError(error) {
  console.error('Supabase error:', error)
  
  switch (error.code) {
    case 'PGRST116':
      throw new DatabaseError('Record not found', 'NOT_FOUND', error)
    case '23505':
      throw new DatabaseError('Duplicate record', 'DUPLICATE', error)
    case '23503':
      throw new DatabaseError('Referenced record not found', 'FOREIGN_KEY', error)
    default:
      throw new DatabaseError(error.message, error.code, error)
  }
}
```

### 2. Migration Error Recovery
```javascript
// src/utils/migrationErrorRecovery.js
export class MigrationErrorRecovery {
  static async handleFailedMigration(error, context) {
    console.error('Migration failed:', error, context)
    
    // Log error details
    await this.logMigrationError(error, context)
    
    // Attempt recovery based on error type
    switch (error.type) {
      case 'DATA_INTEGRITY':
        return await this.recoverDataIntegrity(context)
      case 'CONSTRAINT_VIOLATION':
        return await this.handleConstraintViolation(context)
      case 'TIMEOUT':
        return await this.retryWithBackoff(context)
      default:
        throw error
    }
  }
  
  static async logMigrationError(error, context) {
    // Log to monitoring service
    console.error('Migration error logged:', {
      error: error.message,
      context,
      timestamp: new Date().toISOString()
    })
  }
}
```

## Testing Strategy

### 1. Unit Tests
```javascript
// src/api/__tests__/supabaseClient.test.js
import { supabase } from '../supabaseClient'
import { createTestUser, createTestExercise } from '../testHelpers'

describe('Supabase Client', () => {
  test('should create and retrieve user', async () => {
    const testUser = await createTestUser()
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', testUser.id)
      .single()
    
    expect(error).toBeNull()
    expect(data.email).toBe(testUser.email)
  })
  
  test('should handle foreign key constraints', async () => {
    const { error } = await supabase
      .from('workout_logs')
      .insert({
        user_id: 'non-existent-id',
        date: new Date().toISOString()
      })
    
    expect(error.code).toBe('23503') // Foreign key violation
  })
})
```

### 2. Integration Tests
```javascript
// src/__tests__/workoutFlow.integration.test.js
describe('Workout Flow Integration', () => {
  test('should complete full workout flow', async () => {
    // Create user
    const user = await createTestUser()
    
    // Create program
    const program = await createTestProgram(user.id)
    
    // Start workout
    const workout = await startWorkout(user.id, program.id)
    
    // Log exercises
    await logExercise(workout.id, testExercise.id, {
      sets: 3,
      reps: [10, 10, 8],
      weights: [135, 135, 135]
    })
    
    // Complete workout
    await completeWorkout(workout.id)
    
    // Verify analytics updated
    const analytics = await getUserAnalytics(user.id)
    expect(analytics.length).toBeGreaterThan(0)
  })
})
```

### 3. Migration Tests
```javascript
// src/migration/__tests__/dataMigration.test.js
describe('Data Migration', () => {
  test('should migrate user data correctly', async () => {
    const firestoreUser = createMockFirestoreUser()
    const migratedUser = await migrateUser(firestoreUser)
    
    expect(migratedUser.email).toBe(firestoreUser.email)
    expect(migratedUser.authId).toBeDefined()
    expect(migratedUser.preferences).toEqual(firestoreUser.preferences)
  })
  
  test('should preserve workout log relationships', async () => {
    const firestoreLog = createMockWorkoutLog()
    const migratedLog = await migrateWorkoutLog(firestoreLog)
    
    expect(migratedLog.exercises.length).toBe(firestoreLog.exercises.length)
    expect(migratedLog.userId).toBeDefined()
  })
})
```

## Performance Considerations

### 1. Query Optimization
- Use proper indexes on frequently queried columns
- Implement query result caching with appropriate TTL
- Use Supabase's built-in connection pooling
- Optimize joins to avoid N+1 queries

### 2. Real-time Performance
- Limit real-time subscriptions to necessary data
- Use row-level security for efficient filtering
- Implement proper cleanup of subscriptions

### 3. Caching Strategy
- Cache frequently accessed reference data (exercises, muscle groups)
- Implement cache invalidation on data mutations
- Use browser storage for offline capability

### 4. Database Performance
- Regular VACUUM and ANALYZE operations
- Monitor query performance with pg_stat_statements
- Implement proper connection pooling
- Use read replicas for analytics queries if needed