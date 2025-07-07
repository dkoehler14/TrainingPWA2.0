/**
 * Shared utility functions for program-related operations
 */

/**
 * Parses flattened weekly configurations into a nested structure
 * Handles both old format (week1_day1_exercises) and new format (week1_day1)
 * 
 * @param {Object} flattenedConfigs - The flattened configuration object from Firestore
 * @param {number} duration - Number of weeks in the program
 * @param {number} daysPerWeek - Number of days per week in the program
 * @returns {Array} Nested array structure: [week][day] = { name: string, exercises: Array }
 */
export const parseWeeklyConfigs = (flattenedConfigs, duration, daysPerWeek) => {
  // Validate input parameters
  if (!flattenedConfigs || typeof flattenedConfigs !== 'object') {
    console.warn('parseWeeklyConfigs: Invalid flattenedConfigs provided');
    return [];
  }
  
  if (!duration || !daysPerWeek || duration < 1 || daysPerWeek < 1) {
    console.warn('parseWeeklyConfigs: Invalid duration or daysPerWeek provided', { duration, daysPerWeek });
    return [];
  }

  try {
    // Initialize the nested structure with empty arrays
    const weeklyConfigs = Array.from({ length: duration }, () =>
      Array.from({ length: daysPerWeek }, () => ({ name: undefined, exercises: [] }))
    );

    // Process each key in the flattened configuration
    for (let key in flattenedConfigs) {
      if (flattenedConfigs.hasOwnProperty(key)) {
        let match = key.match(/week(\d+)_day(\d+)_exercises/);
        let weekIndex, dayIndex, exercises = [], dayName = undefined;
        
        if (match) {
          // Handle old format: week1_day1_exercises
          weekIndex = parseInt(match[1], 10) - 1;
          dayIndex = parseInt(match[2], 10) - 1;
          const exerciseData = flattenedConfigs[key];
          exercises = Array.isArray(exerciseData) ? exerciseData : [];
        } else {
          // Handle new format: week1_day1
          match = key.match(/week(\d+)_day(\d+)$/);
          if (match) {
            weekIndex = parseInt(match[1], 10) - 1;
            dayIndex = parseInt(match[2], 10) - 1;
            const dayObj = flattenedConfigs[key];
            if (dayObj && typeof dayObj === 'object') {
              exercises = Array.isArray(dayObj.exercises) ? dayObj.exercises : [];
              dayName = dayObj.name;
            }
          }
        }
        
        // Validate indices and update the structure
        if (
          typeof weekIndex === 'number' && typeof dayIndex === 'number' &&
          weekIndex >= 0 && dayIndex >= 0 &&
          weekIndex < weeklyConfigs.length && dayIndex < weeklyConfigs[weekIndex].length
        ) {
          // Ensure exercises is always an array with proper structure
          weeklyConfigs[weekIndex][dayIndex].exercises = exercises.map(ex => ({
            exerciseId: ex.exerciseId || '',
            sets: ex.sets || 3,
            reps: ex.reps || 8,
            notes: ex.notes || ''
          }));
          
          if (dayName) {
            weeklyConfigs[weekIndex][dayIndex].name = dayName;
          } else if (!weeklyConfigs[weekIndex][dayIndex].name) {
            weeklyConfigs[weekIndex][dayIndex].name = `Day ${dayIndex + 1}`;
          }
        } else {
          console.warn('parseWeeklyConfigs: Invalid indices for key', {
            key, weekIndex, dayIndex, duration, daysPerWeek
          });
        }
      }
    }

    return weeklyConfigs;
  } catch (error) {
    console.error('parseWeeklyConfigs: Error parsing weekly configs', error);
    return [];
  }
};