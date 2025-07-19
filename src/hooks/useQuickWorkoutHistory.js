import { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import { getCollectionCached } from '../api/enhancedFirestoreCache';

const useQuickWorkoutHistory = () => {
  const [workouts, setWorkouts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchWorkouts = useCallback(async (isRetry = false) => {
    const user = auth.currentUser;
    
    if (!user) {
      setError('Please sign in to view your workout history');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const workoutData = await getCollectionCached(
        'workoutLogs',
        {
          where: [
            ['userId', '==', user.uid],
            ['type', '==', 'quick_workout'],
            ['isWorkoutFinished', '==', true]
          ],
          orderBy: [['completedDate', 'desc']]
        },
        15 * 60 * 1000 // 15 minutes TTL
      );

      // Validate workout data structure
      const validWorkouts = workoutData.filter(workout => {
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