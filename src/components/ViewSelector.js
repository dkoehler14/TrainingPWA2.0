import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { ChevronDown } from 'react-bootstrap-icons';
import '../styles/ViewSelector.css';

const ViewSelector = memo(({ 
  activeView, 
  onViewChange, 
  options = [],
  className = '',
  disabled = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Find the active option
  const activeOption = options.find(option => option.value === activeView) || options[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (event) => {
    if (disabled) return;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(0);
        } else if (focusedIndex >= 0) {
          handleOptionSelect(options[focusedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setFocusedIndex(-1);
        buttonRef.current?.focus();
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(0);
        } else {
          setFocusedIndex(prev => 
            prev < options.length - 1 ? prev + 1 : 0
          );
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          setFocusedIndex(options.length - 1);
        } else {
          setFocusedIndex(prev => 
            prev > 0 ? prev - 1 : options.length - 1
          );
        }
        break;
      case 'Tab':
        if (isOpen) {
          setIsOpen(false);
          setFocusedIndex(-1);
        }
        break;
      default:
        break;
    }
  };

  const handleOptionSelect = useCallback((option) => {
    if (disabled || option.value === activeView) return;
    
    onViewChange(option.value);
    setIsOpen(false);
    setFocusedIndex(-1);
    buttonRef.current?.focus();
  }, [disabled, activeView, onViewChange]);

  const handleButtonClick = useCallback(() => {
    if (disabled) return;
    
    setIsOpen(!isOpen);
    if (!isOpen) {
      setFocusedIndex(0);
    } else {
      setFocusedIndex(-1);
    }
  }, [disabled, isOpen]);

  return (
    <div 
      className={`view-selector ${className}`} 
      ref={dropdownRef}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`view-selector-button ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={handleButtonClick}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current view: ${activeOption?.label}. Click to change view.`}
      >
        <span className="view-selector-label">
          <span className="view-indicator-dot" aria-hidden="true"></span>
          {activeOption?.label || 'Select View'}
        </span>
        <ChevronDown 
          className={`view-selector-icon ${isOpen ? 'rotated' : ''}`}
          size={16}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div 
          className="view-selector-dropdown"
          role="listbox"
          aria-label="View options"
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              className={`view-selector-option ${
                option.value === activeView ? 'active' : ''
              } ${
                index === focusedIndex ? 'focused' : ''
              }`}
              role="option"
              aria-selected={option.value === activeView}
              onClick={() => handleOptionSelect(option)}
              onMouseEnter={() => setFocusedIndex(index)}
            >
              <span className="option-indicator" aria-hidden="true">
                {option.value === activeView && '✓'}
              </span>
              <span className="option-label">{option.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

ViewSelector.displayName = 'ViewSelector';

export default ViewSelector;