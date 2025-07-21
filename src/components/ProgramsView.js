import React, { memo, useEffect, useRef } from 'react';
import Programs from '../pages/Programs';

/**
 * ProgramsView - Wrapper component for the Programs page
 * 
 * This component serves as a wrapper around the existing Programs page component
 * to maintain all existing functionality while being used within the consolidated
 * ProgramsWorkoutHub page.
 * 
 * Features:
 * - State preservation: Maintains component state when switching views
 * - Performance optimization: Memoized to prevent unnecessary re-renders
 * - Lifecycle management: Handles mount/unmount and active state changes
 */
const ProgramsView = memo(({ 
  userRole, 
  initialState = {}, 
  onStateChange = () => {}, 
  isActive = true 
}) => {
  const programsRef = useRef(null);
  const stateRef = useRef(initialState);

  // Update state reference when initialState changes
  useEffect(() => {
    stateRef.current = { ...stateRef.current, ...initialState };
  }, [initialState]);

  // Handle state changes and notify parent
  const handleStateChange = (newState) => {
    stateRef.current = { ...stateRef.current, ...newState };
    onStateChange(stateRef.current);
  };

  // Notify parent of state changes when component becomes inactive
  useEffect(() => {
    if (!isActive && Object.keys(stateRef.current).length > 0) {
      onStateChange(stateRef.current);
    }
  }, [isActive, onStateChange]);

  return (
    <div 
      ref={programsRef}
      style={{ 
        height: isActive ? 'auto' : '0',
        overflow: isActive ? 'visible' : 'hidden',
        visibility: isActive ? 'visible' : 'hidden'
      }}
    >
      <Programs 
        userRole={userRole}
        initialState={stateRef.current}
        onStateChange={handleStateChange}
      />
    </div>
  );
});

ProgramsView.displayName = 'ProgramsView';

export default ProgramsView;