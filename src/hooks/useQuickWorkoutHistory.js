import { useState, useEffect, useCallback, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

const useQuickWorkoutHistory = () => {
  const { user, isAuthenticated } = useContext(AuthContext);
  const [workouts, setWorkouts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchWorkouts = useCallback(async (isRetry = false) => {
    
    if (!user) {
      setError('Please sign in to view your workout history');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Phase 1 Optimization: Longer TTL for historical data (30 minutes)
      // Historical workout data changes less frequently than active workouts
      // Use workoutLogService to get complete workout data with exercises
      const workoutLogService = (await import('../services/workoutLogService')).default;
      const workoutData = await workoutLogService.getWorkoutHistory(user.id, 50, 0);

      // Transform Supabase data structure to match expected frontend format
      const transformedWorkouts = workoutData.map(workout => {
        const exercises = (workout.workout_log_exercises || []).map(logExercise => ({
          exerciseId: logExercise.exercise_id,
          sets: logExercise.sets,
          reps: logExercise.reps || [],
          weights: logExercise.weights || [],
          completed: logExercise.completed || [],
          notes: logExercise.notes || '',
          bodyweight: logExercise.bodyweight || null
        }));

        return {
          id: workout.id,
          name: workout.name,
          type: workout.type,
          date: workout.completed_date || workout.date,
          completedDate: workout.completed_date,
          isFinished: workout.is_finished,
          isDraft: workout.is_draft,
          userId: workout.user_id,
          exercises: exercises
        };
      });

      // Validate workout data structure
      const validWorkouts = transformedWorkouts.filter(workout => {
        if (!workout || typeof workout !== 'object') {
          console.warn('Invalid workout data structure:', workout);
          return false;
        }
        return true;
      });

      setWorkouts(validWorkouts);
      
      // Reset retry count on successful fetch
      if (isRetry) {
        setRetryCount(0);
      }
    } catch (err) {
      console.error('Error fetching quick workout history:', err);
      
      // Provide user-friendly error messages based on error type
      let userFriendlyError = 'Failed to load workout history';
      
      if (err.code === 'permission-denied') {
        userFriendlyError = 'You don\'t have permission to access this data. Please sign in again.';
      } else if (err.code === 'unavailable') {
        userFriendlyError = 'Service temporarily unavailable. Please check your internet connection and try again.';
      } else if (err.code === 'deadline-exceeded' || err.message?.includes('timeout')) {
        userFriendlyError = 'Request timed out. Please check your internet connection and try again.';
      } else if (err.message?.includes('Network')) {
        userFriendlyError = 'Network error. Please check your internet connection and try again.';
      } else if (err.message?.includes('Firebase') || err.message?.includes('Firestore')) {
        userFriendlyError = 'Database connection error. Please try again in a moment.';
      }
      
      setError(userFriendlyError);
      
      // Increment retry count if this was a retry attempt
      if (isRetry) {
        setRetryCount(prev => prev + 1);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refetch = useCallback(() => {
    return fetchWorkouts(true);
  }, [fetchWorkouts]);

  // Auto-retry logic for transient errors
  useEffect(() => {
    if (error && retryCount < 2) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s
      
      const timer = setTimeout(() => {
        console.log(`Auto-retrying workout fetch (attempt ${retryCount + 1})`);
        fetchWorkouts(true);
      }, retryDelay);

      return () => clearTimeout(timer);
    }
  }, [error, retryCount, fetchWorkouts]);

  useEffect(() => {
    fetchWorkouts();
  }, [fetchWorkouts]);

  return {
    workouts,
    isLoading,
    error,
    refetch,
    retryCount
  };
};

export default useQuickWorkoutHistory;