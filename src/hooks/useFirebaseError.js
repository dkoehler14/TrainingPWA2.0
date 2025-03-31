import { useState } from 'react';

const useFirebaseError = () => {
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleError = (error) => {
    console.error('Firebase Error:', error);
    
    let errorMessage = 'An unexpected error occurred.';
    
    if (error.code) {
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = 'User not found.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Invalid password.';
          break;
        case 'auth/email-already-in-use':
          errorMessage = 'Email is already registered.';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password should be at least 6 characters.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your connection.';
          break;
        case 'permission-denied':
          errorMessage = 'You do not have permission to perform this action.';
          break;
        case 'not-found':
          errorMessage = 'The requested resource was not found.';
          break;
        default:
          errorMessage = error.message || 'An unexpected error occurred.';
      }
    }
    
    setError(errorMessage);
    return errorMessage;
  };

  const clearError = () => {
    setError(null);
  };

  const withErrorHandling = async (operation) => {
    setIsLoading(true);
    clearError();
    
    try {
      const result = await operation();
      clearError();
      return result;
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    error,
    isLoading,
    handleError,
    clearError,
    withErrorHandling,
    setError
  };
};

export default useFirebaseError; 