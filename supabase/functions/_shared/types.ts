// Global types for Supabase Edge Functions

export interface DatabaseUser {
  id: string
  auth_id: string
  email?: string
  name?: string
  weight?: number
  height?: number
  age?: number
  experience_level?: string
  preferred_units?: string
  goals?: string[]
  available_equipment?: string[]
  injuries?: string[]
  created_at: string
  updated_at: string
}

export interface Exercise {
  id: string
  name: string
  primary_muscle_group: string
  exercise_type: 'Weighted' | 'Bodyweight' | 'Bodyweight Loadable' | 'Cardio' | 'Time'
  instructions?: string
  is_global: boolean
  user_id?: string
  created_at: string
  updated_at: string
}

export interface WorkoutLog {
  id: string
  user_id: string
  program_id?: string
  week_index?: number
  day_index?: number
  name?: string
  type: string
  date: string
  completed_date?: string
  is_finished: boolean
  is_draft: boolean
  weight_unit: 'LB' | 'KG'
  duration?: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface WorkoutLogExercise {
  id: string
  workout_log_id: string
  exercise_id: string
  sets: number
  reps: number[]
  weights: number[]
  completed: boolean[]
  bodyweight?: number
  notes?: string
  is_added: boolean
  added_type?: string
  original_index: number
  order_index: number
  created_at: string
  updated_at: string
  exercises?: Exercise
}

export interface UserAnalytics {
  id: string
  user_id: string
  exercise_id: string
  total_volume: number
  max_weight: number
  total_reps: number
  total_sets: number
  last_workout_date: string
  pr_date?: string
  e1rm: number
  effective_reps: number
  intensity_distribution: Record<string, number>
  prs_by_rep_range: Record<string, any>
  staleness_score: number
  plateau_data: Record<string, any>
  created_at: string
  updated_at: string
}

export interface UserAnalyticsWithExercise extends UserAnalytics {
  exercises: Exercise
}

export interface Program {
  id: string
  user_id: string
  name: string
  description?: string
  duration: number
  days_per_week: number
  weight_unit: 'LB' | 'KG'
  difficulty?: string
  goals?: string[]
  equipment?: string[]
  is_template: boolean
  is_current: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserStatistics {
  id: string
  user_id: string
  total_workouts: number
  total_volume: number
  avg_e1rm: number
  total_effective_reps: number
  strongest_exercise_id?: string
  strongest_exercise_e1rm?: number
  last_workout_date?: string
  created_at: string
  updated_at: string
}

export interface UserAchievement {
  id: string
  user_id: string
  achievement_type: string
  achievement_data: Record<string, any>
  achieved_at: string
  created_at: string
}

export interface FunctionPerformanceMetric {
  id: string
  function_name: string
  execution_time_ms: number
  memory_usage_mb?: number
  success: boolean
  error_message?: string
  user_id?: string
  timestamp: string
  created_at: string
}

// Request/Response types
export interface WorkoutProcessRequest {
  workoutLogId: string
}

export interface WorkoutProcessResponse {
  success: boolean
  message: string
  exercisesProcessed: number
}

export interface CoachingInsight {
  type: 'strength' | 'volume' | 'frequency' | 'progression' | 'balance' | 'recovery'
  title: string
  message: string
  priority: 'high' | 'medium' | 'low'
  actionable: boolean
  data?: any
}

export interface CoachingInsightsResponse {
  insights: CoachingInsight[]
  summary: {
    totalExercises: number
    recentWorkouts: number
    avgE1RM: number
  }
}

export interface ValidationRequest {
  type: 'workout' | 'exercise' | 'program' | 'user_profile'
  data: any
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  sanitizedData?: any
}

export interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: any
  old_record?: any
  schema: string
}

// Helper types
export interface ExerciseSet {
  weight: number
  reps: number
  completed: boolean
}

export interface RepRange {
  min: number
  max: number
}

export interface PRRecord {
  e1RM: number
  weight: number
  reps: number
  date: string
}

// Constants
export const REP_RANGES: Record<string, RepRange> = {
  '1RM': { min: 1, max: 1 },
  '3RM': { min: 2, max: 3 },
  '5RM': { min: 4, max: 5 },
  '8RM': { min: 6, max: 8 },
  '12RM': { min: 9, max: 12 },
  '15RM': { min: 13, max: 20 }
}

export const RPE_TO_PERCENTAGE: Record<number, number> = {
  10: 1.00, 9.5: 0.98, 9: 0.96, 8.5: 0.94, 8: 0.92,
  7.5: 0.90, 7: 0.88, 6.5: 0.86, 6: 0.84, 5: 0.82
}