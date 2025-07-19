/**
 * Utility functions for calculating workout statistics from quick workout history
 */

/**
 * Calculate total workout count
 * @param {Array} workouts - Array of workout documents
 * @returns {number} Total number of workouts
 */
export const calculateTotalWorkouts = (workouts) => {
  if (!Array.isArray(workouts)) return 0;
  return workouts.length;
};

/**
 * Calculate exercise frequency analysis from workout data
 * @param {Array} workouts - Array of workout documents
 * @param {Array} exercisesMetadata - Array of exercise metadata for name lookup
 * @returns {Array} Array of exercises with frequency counts, sorted by frequency
 */
export const calculateExerciseFrequency = (workouts, exercisesMetadata = []) => {
  if (!Array.isArray(workouts) || workouts.length === 0) return [];

  const exerciseFrequency = {};

  // Count exercise occurrences across all workouts
  workouts.forEach(workout => {
    if (workout.exercises && Array.isArray(workout.exercises)) {
      workout.exercises.forEach(exercise => {
        const exerciseId = exercise.exerciseId;
        if (exerciseId) {
          exerciseFrequency[exerciseId] = (exerciseFrequency[exerciseId] || 0) + 1;
        }
      });
    }
  });

  // Convert to array and add exercise metadata
  const frequencyArray = Object.entries(exerciseFrequency).map(([exerciseId, count]) => {
    const exerciseInfo = exercisesMetadata.find(ex => ex.id === exerciseId);
    return {
      exerciseId,
      name: exerciseInfo?.name || 'Unknown Exercise',
      primaryMuscleGroup: exerciseInfo?.primaryMuscleGroup || 'Unknown',
      exerciseType: exerciseInfo?.exerciseType || 'Unknown',
      frequency: count,
      percentage: workouts.length > 0 ? Math.round((count / workouts.length) * 100) : 0
    };
  });

  // Sort by frequency (descending)
  return frequencyArray.sort((a, b) => b.frequency - a.frequency);
};

/**
 * Get the most frequent exercises (top N)
 * @param {Array} workouts - Array of workout documents
 * @param {Array} exercisesMetadata - Array of exercise metadata
 * @param {number} limit - Number of top exercises to return (default: 5)
 * @returns {Array} Top N most frequent exercises
 */
export const getMostFrequentExercises = (workouts, exercisesMetadata = [], limit = 5) => {
  const frequencyData = calculateExerciseFrequency(workouts, exercisesMetadata);
  return frequencyData.slice(0, limit);
};

/**
 * Calculate recent activity patterns
 * @param {Array} workouts - Array of workout documents
 * @param {number} days - Number of days to look back (default: 30)
 * @returns {Object} Recent activity statistics
 */
export const calculateRecentActivity = (workouts, days = 30) => {
  if (!Array.isArray(workouts) || workouts.length === 0) {
    return {
      recentWorkouts: 0,
      averageWorkoutsPerWeek: 0,
      lastWorkoutDate: null,
      daysSinceLastWorkout: null,
      workoutStreak: 0
    };
  }

  const now = new Date();
  const cutoffDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

  // Filter workouts within the specified time period
  const recentWorkouts = workouts.filter(workout => {
    const workoutDate = workout.completedDate?.toDate?.() || workout.completedDate || new Date(workout.date);
    return workoutDate >= cutoffDate;
  });

  // Calculate average workouts per week
  const weeksInPeriod = days / 7;
  const averageWorkoutsPerWeek = weeksInPeriod > 0 ? Math.round((recentWorkouts.length / weeksInPeriod) * 10) / 10 : 0;

  // Get last workout date and calculate days since
  let lastWorkoutDate = null;
  let daysSinceLastWorkout = null;
  
  if (workouts.length > 0) {
    const lastWorkout = workouts[0]; // Assuming workouts are sorted by date desc
    lastWorkoutDate = lastWorkout.completedDate?.toDate?.() || lastWorkout.completedDate || new Date(lastWorkout.date);
    daysSinceLastWorkout = Math.floor((now - lastWorkoutDate) / (24 * 60 * 60 * 1000));
  }

  // Calculate current workout streak (consecutive days with workouts)
  const workoutStreak = calculateWorkoutStreak(workouts);

  return {
    recentWorkouts: recentWorkouts.length,
    averageWorkoutsPerWeek,
    lastWorkoutDate,
    daysSinceLastWorkout,
    workoutStreak
  };
};

/**
 * Calculate current workout streak (consecutive workout days)
 * @param {Array} workouts - Array of workout documents (should be sorted by date desc)
 * @returns {number} Number of consecutive days with workouts
 */
export const calculateWorkoutStreak = (workouts) => {
  if (!Array.isArray(workouts) || workouts.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Group workouts by date
  const workoutDates = new Set();
  workouts.forEach(workout => {
    const workoutDate = workout.completedDate?.toDate?.() || workout.completedDate || new Date(workout.date);
    const dateString = workoutDate.toDateString();
    workoutDates.add(dateString);
  });

  let streak = 0;
  let currentDate = new Date(today);

  // Check each day going backwards from today
  while (true) {
    const dateString = currentDate.toDateString();
    if (workoutDates.has(dateString)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      // If today has no workout, check yesterday to allow for current day flexibility
      if (streak === 0 && currentDate.toDateString() === today.toDateString()) {
        currentDate.setDate(currentDate.getDate() - 1);
        continue;
      }
      break;
    }
  }

  return streak;
};

/**
 * Calculate workout frequency metrics over different time periods
 * @param {Array} workouts - Array of workout documents
 * @returns {Object} Frequency metrics for different periods
 */
export const calculateWorkoutFrequencyMetrics = (workouts) => {
  if (!Array.isArray(workouts) || workouts.length === 0) {
    return {
      last7Days: 0,
      last30Days: 0,
      last90Days: 0,
      thisMonth: 0,
      thisYear: 0,
      allTime: 0
    };
  }

  const now = new Date();
  const last7Days = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  const last30Days = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  const last90Days = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
  
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisYearStart = new Date(now.getFullYear(), 0, 1);

  const getWorkoutDate = (workout) => {
    return workout.completedDate?.toDate?.() || workout.completedDate || new Date(workout.date);
  };

  return {
    last7Days: workouts.filter(w => getWorkoutDate(w) >= last7Days).length,
    last30Days: workouts.filter(w => getWorkoutDate(w) >= last30Days).length,
    last90Days: workouts.filter(w => getWorkoutDate(w) >= last90Days).length,
    thisMonth: workouts.filter(w => getWorkoutDate(w) >= thisMonthStart).length,
    thisYear: workouts.filter(w => getWorkoutDate(w) >= thisYearStart).length,
    allTime: workouts.length
  };
};

/**
 * Calculate total sets and exercises across all workouts
 * @param {Array} workouts - Array of workout documents
 * @returns {Object} Total sets and exercises statistics
 */
export const calculateTotalSetsAndExercises = (workouts) => {
  if (!Array.isArray(workouts) || workouts.length === 0) {
    return {
      totalSets: 0,
      totalExercises: 0,
      averageSetsPerWorkout: 0,
      averageExercisesPerWorkout: 0
    };
  }

  let totalSets = 0;
  let totalExercises = 0;

  workouts.forEach(workout => {
    if (workout.exercises && Array.isArray(workout.exercises)) {
      totalExercises += workout.exercises.length;
      
      workout.exercises.forEach(exercise => {
        totalSets += exercise.sets || 0;
      });
    }
  });

  const workoutCount = workouts.length;

  return {
    totalSets,
    totalExercises,
    averageSetsPerWorkout: workoutCount > 0 ? Math.round((totalSets / workoutCount) * 10) / 10 : 0,
    averageExercisesPerWorkout: workoutCount > 0 ? Math.round((totalExercises / workoutCount) * 10) / 10 : 0
  };
};

/**
 * Get comprehensive workout statistics
 * @param {Array} workouts - Array of workout documents
 * @param {Array} exercisesMetadata - Array of exercise metadata
 * @returns {Object} Complete statistics object
 */
export const getWorkoutStatistics = (workouts, exercisesMetadata = []) => {
  const totalWorkouts = calculateTotalWorkouts(workouts);
  const frequentExercises = getMostFrequentExercises(workouts, exercisesMetadata, 5);
  const recentActivity = calculateRecentActivity(workouts, 30);
  const frequencyMetrics = calculateWorkoutFrequencyMetrics(workouts);
  const setsAndExercises = calculateTotalSetsAndExercises(workouts);

  return {
    totalWorkouts,
    frequentExercises,
    recentActivity,
    frequencyMetrics,
    setsAndExercises,
    hasData: totalWorkouts > 0
  };
};