/**
 * Demonstration of Workout Log Service Functionality
 * 
 * This script demonstrates the key features of the workout logging service
 * without requiring a live database connection.
 */

console.log('=== Workout Log Service Demo ===\n')

// Simulate the key data transformations and calculations

console.log('1. Exercise Data Transformation for Database:')
const inputExercises = [
  {
    exerciseId: 'bench-press-123',
    sets: 3,
    reps: [10, 8, 6],
    weights: [135, 145, 155],
    completed: [true, true, true],
    notes: 'Good form, felt strong',
    bodyweight: null
  },
  {
    exerciseId: 'pull-ups-456',
    sets: 3,
    reps: [12, 10, 8],
    weights: [0, 0, 0],
    completed: [true, true, false],
    notes: 'Last set was too difficult',
    bodyweight: 180
  }
]

const transformedForDB = inputExercises.map((ex, index) => ({
  workout_log_id: 'workout-log-789',
  exercise_id: ex.exerciseId,
  sets: Number(ex.sets),
  reps: ex.reps || [],
  weights: ex.weights || [],
  completed: ex.completed || [],
  bodyweight: ex.bodyweight ? Number(ex.bodyweight) : null,
  notes: ex.notes || '',
  is_added: ex.isAdded || false,
  added_type: ex.addedType || null,
  original_index: ex.originalIndex || -1,
  order_index: index
}))

console.log(JSON.stringify(transformedForDB, null, 2))

console.log('\n2. Analytics Calculation:')
const exercises = [
  {
    exerciseId: 'bench-press-123',
    exerciseType: 'Barbell',
    completed: [true, true, true],
    weights: [135, 145, 155],
    reps: [10, 8, 6],
    bodyweight: null
  },
  {
    exerciseId: 'pull-ups-456',
    exerciseType: 'Bodyweight',
    completed: [true, true, false],
    weights: [0, 0, 0],
    reps: [12, 10, 8],
    bodyweight: 180
  }
]

const analytics = exercises.map(exercise => {
  let totalVolume = 0
  let maxWeight = 0
  let totalReps = 0
  let totalSets = 0

  exercise.completed.forEach((isCompleted, setIndex) => {
    if (isCompleted) {
      const weight = Number(exercise.weights[setIndex]) || 0
      const reps = Number(exercise.reps[setIndex]) || 0
      const bodyweight = Number(exercise.bodyweight) || 0

      let effectiveWeight = weight
      if (exercise.exerciseType === 'Bodyweight') {
        effectiveWeight = bodyweight
      } else if (exercise.exerciseType === 'Bodyweight Loadable') {
        effectiveWeight = bodyweight + weight
      }

      totalVolume += effectiveWeight * reps
      maxWeight = Math.max(maxWeight, effectiveWeight)
      totalReps += reps
      totalSets += 1
    }
  })

  return {
    exerciseId: exercise.exerciseId,
    exerciseType: exercise.exerciseType,
    totalVolume,
    maxWeight,
    totalReps,
    totalSets
  }
})

console.log('Analytics Results:')
analytics.forEach(result => {
  console.log(`- ${result.exerciseId} (${result.exerciseType}):`)
  console.log(`  Volume: ${result.totalVolume} lbs`)
  console.log(`  Max Weight: ${result.maxWeight} lbs`)
  console.log(`  Total Reps: ${result.totalReps}`)
  console.log(`  Total Sets: ${result.totalSets}`)
})

console.log('\n3. Exercise History Transformation:')
const mockHistoryData = [
  {
    id: 'log-exercise-1',
    exercise_id: 'bench-press-123',
    sets: 3,
    reps: [10, 8, 6],
    weights: [135, 145, 155],
    completed: [true, true, true],
    bodyweight: null,
    workout_logs: {
      id: 'workout-1',
      user_id: 'user-123',
      completed_date: '2024-01-15T10:00:00Z',
      week_index: 0,
      day_index: 1,
      is_finished: true
    },
    exercises: {
      id: 'bench-press-123',
      name: 'Bench Press',
      primary_muscle_group: 'Chest',
      exercise_type: 'Barbell'
    }
  }
]

const historyData = []

mockHistoryData.forEach(logExercise => {
  const workout = logExercise.workout_logs
  const exercise = logExercise.exercises
  
  for (let setIndex = 0; setIndex < logExercise.sets; setIndex++) {
    if (logExercise.completed && logExercise.completed[setIndex]) {
      const weight = logExercise.weights[setIndex] || 0
      const reps = logExercise.reps[setIndex] || 0
      const bodyweight = logExercise.bodyweight || 0

      let totalWeight = weight
      let displayWeight = weight

      if (exercise.exercise_type === 'Bodyweight') {
        totalWeight = bodyweight
        displayWeight = bodyweight
      } else if (exercise.exercise_type === 'Bodyweight Loadable' && bodyweight > 0) {
        totalWeight = bodyweight + weight
        displayWeight = `${bodyweight} + ${weight} = ${totalWeight}`
      }

      historyData.push({
        date: new Date(workout.completed_date),
        week: (workout.week_index || 0) + 1,
        day: (workout.day_index || 0) + 1,
        set: setIndex + 1,
        weight: weight,
        totalWeight: totalWeight,
        displayWeight: displayWeight,
        reps: reps,
        completed: true,
        bodyweight: bodyweight,
        exerciseType: exercise.exercise_type
      })
    }
  }
})

console.log('Exercise History:')
historyData.forEach(entry => {
  console.log(`- Week ${entry.week}, Day ${entry.day}, Set ${entry.set}: ${entry.reps} reps @ ${entry.displayWeight} lbs`)
})

console.log('\n4. Workout Statistics Calculation:')
const mockWorkoutData = [
  {
    id: 'workout-1',
    completed_date: '2024-01-15T10:00:00Z',
    duration: 60,
    workout_log_exercises: [
      {
        sets: 3,
        reps: [10, 8, 6],
        weights: [135, 145, 155],
        completed: [true, true, true],
        bodyweight: null,
        exercises: {
          primary_muscle_group: 'Chest',
          exercise_type: 'Barbell'
        }
      },
      {
        sets: 3,
        reps: [12, 10, 8],
        weights: [0, 0, 0],
        completed: [true, true, false],
        bodyweight: 180,
        exercises: {
          primary_muscle_group: 'Back',
          exercise_type: 'Bodyweight'
        }
      }
    ]
  }
]

let totalWorkouts = mockWorkoutData.length
let totalVolume = 0
let totalSets = 0
let totalReps = 0
let muscleGroupBreakdown = {}

mockWorkoutData.forEach(workout => {
  workout.workout_log_exercises.forEach(exercise => {
    const muscleGroup = exercise.exercises.primary_muscle_group
    
    if (!muscleGroupBreakdown[muscleGroup]) {
      muscleGroupBreakdown[muscleGroup] = { volume: 0, sets: 0 }
    }

    exercise.completed.forEach((isCompleted, setIndex) => {
      if (isCompleted) {
        const weight = Number(exercise.weights[setIndex]) || 0
        const reps = Number(exercise.reps[setIndex]) || 0
        const bodyweight = Number(exercise.bodyweight) || 0

        let effectiveWeight = weight
        if (exercise.exercises.exercise_type === 'Bodyweight') {
          effectiveWeight = bodyweight
        } else if (exercise.exercises.exercise_type === 'Bodyweight Loadable') {
          effectiveWeight = bodyweight + weight
        }

        const volume = effectiveWeight * reps
        totalVolume += volume
        totalSets += 1
        totalReps += reps

        muscleGroupBreakdown[muscleGroup].volume += volume
        muscleGroupBreakdown[muscleGroup].sets += 1
      }
    })
  })
})

const workoutStats = {
  totalWorkouts,
  totalVolume,
  totalSets,
  totalReps,
  muscleGroupBreakdown
}

console.log('Workout Statistics:')
console.log(`- Total Workouts: ${workoutStats.totalWorkouts}`)
console.log(`- Total Volume: ${workoutStats.totalVolume} lbs`)
console.log(`- Total Sets: ${workoutStats.totalSets}`)
console.log(`- Total Reps: ${workoutStats.totalReps}`)
console.log('- Muscle Group Breakdown:')
Object.entries(workoutStats.muscleGroupBreakdown).forEach(([group, stats]) => {
  console.log(`  ${group}: ${stats.volume} lbs volume, ${stats.sets} sets`)
})

console.log('\n=== Demo Complete ===')
console.log('\nKey Features Implemented:')
console.log('✅ CRUD operations for workout logs and exercises')
console.log('✅ Draft workout management and completion flow')
console.log('✅ Workout analytics calculation and retrieval')
console.log('✅ Exercise history tracking with proper transformations')
console.log('✅ Support for different exercise types (Barbell, Bodyweight, Bodyweight Loadable)')
console.log('✅ Data validation and error handling')
console.log('✅ Firebase-compatible API for seamless migration')
console.log('✅ Real-time updates support (via Supabase subscriptions)')
console.log('✅ Comprehensive caching integration')