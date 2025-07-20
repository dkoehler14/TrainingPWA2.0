/**
 * Utility functions for processing exercise history data into workout session cards
 */

/**
 * Groups exercise history data by workout sessions (same date)
 * @param {Array} historyData - Array of individual set entries
 * @returns {Array} Array of session objects with grouped sets
 */
export const groupExerciseHistoryBySessions = (historyData) => {
  if (!historyData || historyData.length === 0) {
    return [];
  }

  const sessions = {};
  
  historyData.forEach(entry => {
    // Group by date only, combining all workouts from the same date
    const dateKey = entry.date.toDateString();
    
    if (!sessions[dateKey]) {
      sessions[dateKey] = {
        date: entry.date,
        sets: [],
        exerciseType: entry.exerciseType
      };
    }
    
    sessions[dateKey].sets.push({
      setNumber: entry.set,
      weight: entry.weight,
      reps: entry.reps,
      totalWeight: entry.totalWeight || entry.weight,
      displayWeight: entry.displayWeight || entry.weight,
      bodyweight: entry.bodyweight,
      exerciseType: entry.exerciseType
    });
  });
  
  // Convert to array and sort by date (most recent first)
  const sessionArray = Object.values(sessions);
  
  // Sort sets within each session by set number and calculate summary
  sessionArray.forEach(session => {
    session.sets.sort((a, b) => a.setNumber - b.setNumber);
    
    // Calculate session summary for all sets from this date
    session.summary = calculateSessionSummary(session.sets, session.exerciseType);
  });
  
  // Sort sessions by date (most recent first)
  return sessionArray.sort((a, b) => b.date - a.date);
};

/**
 * Calculates summary statistics for a workout session
 * @param {Array} sets - Array of sets in the session
 * @param {string} exerciseType - Type of exercise (Regular, Bodyweight, etc.)
 * @returns {Object} Summary object with totals and averages
 */
export const calculateSessionSummary = (sets, exerciseType) => {
  if (!sets || sets.length === 0) {
    return {
      totalVolume: 0,
      avgWeight: 0,
      avgReps: 0,
      maxWeight: 0,
      maxReps: 0,
      totalSets: 0
    };
  }

  const totalVolume = sets.reduce((sum, set) => {
    const weight = set.totalWeight || set.weight || 0;
    const reps = set.reps || 0;
    return sum + (weight * reps);
  }, 0);

  const avgWeight = sets.reduce((sum, set) => sum + (set.totalWeight || set.weight || 0), 0) / sets.length;
  const avgReps = sets.reduce((sum, set) => sum + (set.reps || 0), 0) / sets.length;
  const maxWeight = Math.max(...sets.map(set => set.totalWeight || set.weight || 0));
  const maxReps = Math.max(...sets.map(set => set.reps || 0));

  return {
    totalVolume: Math.round(totalVolume),
    avgWeight: Math.round(avgWeight * 10) / 10, // Round to 1 decimal
    avgReps: Math.round(avgReps * 10) / 10, // Round to 1 decimal
    maxWeight,
    maxReps,
    totalSets: sets.length
  };
};

/**
 * Formats weight display for different exercise types
 * @param {Object} set - Set data object
 * @param {string} exerciseType - Type of exercise
 * @param {string} weightUnit - Weight unit (LB, KG)
 * @returns {string} Formatted weight display
 */
export const formatWeightDisplay = (set, exerciseType, weightUnit = 'LB') => {
  const reps = set.reps || 0;
  
  if (exerciseType === 'Bodyweight') {
    const bodyweight = set.bodyweight || set.weight || 0;
    return bodyweight > 0 ? `${bodyweight} × ${reps}` : `BW × ${reps}`;
  } else if (exerciseType === 'Bodyweight Loadable') {
    const bodyweight = set.bodyweight || 0;
    const additionalWeight = set.weight || 0;
    
    if (bodyweight > 0 && additionalWeight > 0) {
      return `${bodyweight + additionalWeight} × ${reps}`;
    } else if (bodyweight > 0) {
      return `${bodyweight} × ${reps}`;
    } else if (additionalWeight > 0) {
      return `${additionalWeight} × ${reps}`;
    } else {
      return `BW × ${reps}`;
    }
  } else {
    // Regular exercise
    const weight = set.weight || 0;
    return `${weight} × ${reps}`;
  }
};

/**
 * Formats session summary for display
 * @param {Object} session - Session object with summary data
 * @param {string} weightUnit - Weight unit (LB, KG)
 * @returns {string} Formatted summary string for display
 */
export const formatSessionSummary = (session, weightUnit = 'LB') => {
  if (!session || !session.summary) {
    return `${session?.sets?.length || 0} sets`;
  }
  
  const { summary, exerciseType } = session;
  const setCount = summary.totalSets || session.sets?.length || 0;
  
  // Simple format: "X sets • Y total volume"
  if (summary.totalVolume && summary.totalVolume > 0) {
    return `${setCount} sets • ${summary.totalVolume.toLocaleString()} ${weightUnit}`;
  }
  
  // Fallback to just set count
  return `${setCount} sets`;
};

/**
 * Checks if exercise history data is valid
 * @param {Array} historyData - Exercise history data
 * @returns {boolean} True if data is valid
 */
export const isValidHistoryData = (historyData) => {
  return Array.isArray(historyData) && historyData.length > 0;
};

/**
 * Gets empty state message based on context
 * @param {string} context - Context type ('no-history', 'loading', etc.)
 * @param {string} exerciseName - Name of the exercise
 * @returns {Object} Empty state configuration
 */
export const getEmptyStateConfig = (context = 'no-history', exerciseName = 'this exercise') => {
  if (context === 'loading') {
    return {
      icon: '⏳',
      title: 'Loading History...',
      message: 'Fetching your workout data'
    };
  }
  
  return {
    icon: '📊',
    title: 'No History Found',
    message: `No completed sets found for ${exerciseName}. Complete some sets to see your progress here!`
  };
};