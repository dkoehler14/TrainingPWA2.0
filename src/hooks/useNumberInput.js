// src/hooks/useNumberInput.js
import { useEffect, useRef } from 'react';

export const useNumberInput = (ref) => {
  // Create a local ref to track the input element, in case the passed ref changes
  const inputRef = useRef(null);

  useEffect(() => {
    // Ensure we have a valid ref (either the passed ref or the local ref)
    const targetRef = ref.current || inputRef.current;
    if (!targetRef) {
      console.warn('Ref is null or undefined in useNumberInput (initial check)');
      return; // Exit early if no ref yet
    }

    console.log('Adding double-click listener to:', targetRef);
    const handleDoubleClick = (e) => {
      console.log('Double-click detected on:', e.target);
      e.target.select();
    };

    // Add the event listener
    targetRef.addEventListener('dblclick', handleDoubleClick);

    // Cleanup on unmount or ref change
    return () => {
      console.log('Removing double-click listener from:', targetRef);
      targetRef.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [ref]); // Depend on ref to re-run when it changes (e.g., due to dynamic rendering)

  // Optionally, update the local ref if the passed ref changes
  useEffect(() => {
    if (ref.current) {
      inputRef.current = ref.current;
    }
  }, [ref]);
};