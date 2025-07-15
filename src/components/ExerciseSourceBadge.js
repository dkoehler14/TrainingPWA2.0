import React from 'react';
import { Globe, Person } from 'react-bootstrap-icons';

const ExerciseSourceBadge = ({ exercise, isGlobal, size = 'sm', showIcon = true, showText = true }) => {
  console.log('ExerciseSourceBadge props:', { exercise, isGlobal, size, showIcon, showText });
  
  // Handle both API patterns: exercise object or direct isGlobal prop
  const exerciseIsGlobal = isGlobal !== undefined
    ? isGlobal
    : (exercise?.isGlobal || exercise?.source === 'global' || !exercise?.userId);
  
  const badgeConfig = {
    global: {
      className: 'exercise-source-badge-global',
      bgColor: '#e3f2fd',
      textColor: '#0056D2',
      borderColor: '#0056D2',
      icon: Globe,
      text: 'Global'
    },
    custom: {
      className: 'exercise-source-badge-custom',
      bgColor: '#e8f5e8',
      textColor: '#28a745',
      borderColor: '#28a745',
      icon: Person,
      text: 'Custom'
    }
  };
  
  const config = exerciseIsGlobal ? badgeConfig.global : badgeConfig.custom;
  const IconComponent = config.icon;
  
  const sizeClasses = {
    xs: 'px-1 py-0',
    sm: 'px-2 py-1',
    md: 'px-3 py-1'
  };
  
  const iconSizes = {
    xs: 10,
    sm: 12,
    md: 14
  };
  
  return (
    <span
      className={`badge ${config.className} ${sizeClasses[size]}`}
      style={{
        backgroundColor: config.bgColor,
        color: config.textColor,
        border: `1px solid ${config.borderColor}`,
        fontSize: size === 'xs' ? '0.65rem' : size === 'sm' ? '0.75rem' : '0.85rem',
        fontWeight: '500',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem'
      }}
    >
      {showIcon && <IconComponent size={iconSizes[size]} />}
      {showText && config.text}
    </span>
  );
};

export default ExerciseSourceBadge;