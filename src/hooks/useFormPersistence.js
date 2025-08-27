import { useEffect, useCallback } from 'react'

/**
 * Hook to persist form state to localStorage and restore it on component mount
 * Prevents data loss when switching tabs or refreshing the page
 */
export function useFormPersistence(key, state, setState, options = {}) {
  const { 
    debounceMs = 500,
    exclude = [],
    condition = () => true 
  } = options

  // Save state to localStorage
  const saveState = useCallback((stateToSave) => {
    if (!condition()) return
    
    try {
      // Filter out excluded keys
      const filteredState = { ...stateToSave }
      exclude.forEach(key => delete filteredState[key])
      
      localStorage.setItem(key, JSON.stringify(filteredState))
    } catch (error) {
      console.warn('Failed to save form state to localStorage:', error)
    }
  }, [key, exclude, condition])

  // Load state from localStorage
  const loadState = useCallback(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsedState = JSON.parse(saved)
        return parsedState
      }
    } catch (error) {
      console.warn('Failed to load form state from localStorage:', error)
    }
    return null
  }, [key])

  // Clear saved state
  const clearSavedState = useCallback(() => {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.warn('Failed to clear saved form state:', error)
    }
  }, [key])

  // Load state on mount
  useEffect(() => {
    const savedState = loadState()
    if (savedState && condition()) {
      setState(prevState => ({ ...prevState, ...savedState }))
    }
  }, [loadState, setState, condition])

  // Save state when it changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveState(state)
    }, debounceMs)

    return () => clearTimeout(timeoutId)
  }, [state, saveState, debounceMs])



  return {
    clearSavedState,
    loadState,
    saveState: (stateToSave) => saveState(stateToSave || state)
  }
}