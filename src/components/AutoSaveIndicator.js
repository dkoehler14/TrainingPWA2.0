import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock } from 'react-bootstrap-icons';

/**
 * Component to show auto-save status
 */
function AutoSaveIndicator({ isActive = false, className = '' }) {
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (isActive) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  if (!showSaved) return null;

  return (
    <div className={`d-flex align-items-center text-success ${className}`} style={{ fontSize: '0.875rem' }}>
      <CheckCircle className="me-1" size={16} />
      <span>Draft saved</span>
    </div>
  );
}

export default AutoSaveIndicator;