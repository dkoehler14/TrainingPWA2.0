/**
 * WorkoutHistorySkeleton Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutHistorySkeleton, { 
  WorkoutCardSkeleton, 
  WorkoutHistoryListSkeleton,
  WorkoutStatsCardSkeleton,
  WorkoutFiltersSkeleton,
  WorkoutDetailSkeleton
} from '../WorkoutHistorySkeleton';

describe('WorkoutHistorySkeleton Components', () => {
  test('renders WorkoutCardSkeleton', () => {
    render(<WorkoutCardSkeleton />);
    
    // Check for placeholder elements
    const placeholders = screen.getAllByRole('button', { hidden: true });
    expect(placeholders.length).toBeGreaterThan(0);
  });

  test('renders WorkoutHistoryListSkeleton with default count', () => {
    render(<WorkoutHistoryListSkeleton />);
    
    // Should render 5 skeleton cards by default
    const cards = document.querySelectorAll('.workout-history-card');
    expect(cards.length).toBe(5);
  });

  test('renders WorkoutHistoryListSkeleton with custom count', () => {
    render(<WorkoutHistoryListSkeleton count={3} />);
    
    // Should render 3 skeleton cards
    const cards = document.querySelectorAll('.workout-history-card');
    expect(cards.length).toBe(3);
  });

  test('renders WorkoutStatsCardSkeleton', () => {
    render(<WorkoutStatsCardSkeleton />);
    
    // Check for stats card structure
    const statsCard = document.querySelector('.stats-card');
    expect(statsCard).toBeInTheDocument();
    
    // Check for placeholder elements
    const placeholders = document.querySelectorAll('.placeholder');
    expect(placeholders.length).toBeGreaterThan(0);
  });

  test('renders WorkoutFiltersSkeleton', () => {
    render(<WorkoutFiltersSkeleton />);
    
    // Check for filters card structure
    const filtersCard = document.querySelector('.filters-card');
    expect(filtersCard).toBeInTheDocument();
  });

  test('renders WorkoutDetailSkeleton', () => {
    render(<WorkoutDetailSkeleton />);
    
    // Check for detail view structure
    const detailContainer = document.querySelector('.soft-container');
    expect(detailContainer).toBeInTheDocument();
    
    // Check for exercise detail cards
    const exerciseCards = document.querySelectorAll('.exercise-detail-card');
    expect(exerciseCards.length).toBe(3); // Should render 3 skeleton exercise cards
  });

  test('renders main WorkoutHistorySkeleton with default type', () => {
    render(<WorkoutHistorySkeleton />);
    
    // Should render stats, filters, and list skeletons
    expect(document.querySelector('.stats-card')).toBeInTheDocument();
    expect(document.querySelector('.filters-card')).toBeInTheDocument();
    expect(document.querySelectorAll('.workout-history-card').length).toBe(5);
  });

  test('renders WorkoutHistorySkeleton with stats type', () => {
    render(<WorkoutHistorySkeleton type="stats" />);
    
    expect(document.querySelector('.stats-card')).toBeInTheDocument();
    expect(document.querySelector('.filters-card')).not.toBeInTheDocument();
  });

  test('renders WorkoutHistorySkeleton with filters type', () => {
    render(<WorkoutHistorySkeleton type="filters" />);
    
    expect(document.querySelector('.filters-card')).toBeInTheDocument();
    expect(document.querySelector('.stats-card')).not.toBeInTheDocument();
  });

  test('renders WorkoutHistorySkeleton with detail type', () => {
    render(<WorkoutHistorySkeleton type="detail" />);
    
    expect(document.querySelector('.soft-container')).toBeInTheDocument();
    expect(document.querySelectorAll('.exercise-detail-card').length).toBe(3);
  });

  test('renders WorkoutHistorySkeleton with card type', () => {
    render(<WorkoutHistorySkeleton type="card" />);
    
    expect(document.querySelectorAll('.workout-history-card').length).toBe(1);
  });

  test('renders WorkoutHistorySkeleton with custom count', () => {
    render(<WorkoutHistorySkeleton type="list" count={3} />);
    
    // Should render 3 skeleton cards in the list
    expect(document.querySelectorAll('.workout-history-card').length).toBe(3);
  });

  test('skeleton elements have proper accessibility attributes', () => {
    render(<WorkoutCardSkeleton />);
    
    // Placeholder buttons should be disabled and have proper tabindex
    const placeholderButtons = screen.getAllByRole('button', { hidden: true });
    placeholderButtons.forEach(button => {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('tabindex', '-1');
    });
  });

  test('skeleton elements have proper CSS classes', () => {
    render(<WorkoutHistoryListSkeleton count={1} />);
    
    // Check for proper CSS classes
    expect(document.querySelector('.soft-card')).toBeInTheDocument();
    expect(document.querySelector('.workout-history-card')).toBeInTheDocument();
    expect(document.querySelector('.placeholder')).toBeInTheDocument();
  });
});