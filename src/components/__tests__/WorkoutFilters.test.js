/**
 * WorkoutFilters Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import WorkoutFilters from '../WorkoutFilters';

// Mock lodash debounce
jest.mock('lodash', () => ({
  debounce: (fn) => {
    fn.cancel = jest.fn();
    return fn;
  }
}));

// Mock react-datepicker
jest.mock('react-datepicker', () => {
  return function MockDatePicker({ selected, onChange, placeholderText, ...props }) {
    return (
      <input
        type="date"
        value={selected ? selected.toISOString().split('T')[0] : ''}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value) : null)}
        placeholder={placeholderText}
        data-testid={props['data-testid'] || 'date-picker'}
        {...props}
      />
    );
  };
});

describe('WorkoutFilters', () => {
  const mockOnSearchChange = jest.fn();
  const mockOnDateFilterChange = jest.fn();
  const mockOnSortChange = jest.fn();
  const mockOnClearFilters = jest.fn();

  const defaultProps = {
    searchTerm: '',
    onSearchChange: mockOnSearchChange,
    dateFilter: { start: null, end: null },
    onDateFilterChange: mockOnDateFilterChange,
    sortOption: 'date-desc',
    onSortChange: mockOnSortChange,
    onClearFilters: mockOnClearFilters,
    workoutCount: 5
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders filter components correctly', () => {
    render(<WorkoutFilters {...defaultProps} />);

    expect(screen.getByText('Filter & Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Search Workouts')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort By')).toBeInTheDocument();
    expect(screen.getByText('Date Range Filter')).toBeInTheDocument();
    expect(screen.getByText('5 workouts')).toBeInTheDocument();
  });

  test('displays workout count correctly', () => {
    const { rerender } = render(<WorkoutFilters {...defaultProps} workoutCount={1} />);
    expect(screen.getByText('1 workout')).toBeInTheDocument();

    rerender(<WorkoutFilters {...defaultProps} workoutCount={10} />);
    expect(screen.getByText('10 workouts')).toBeInTheDocument();
  });

  test('handles search input changes with debouncing', async () => {
    const user = userEvent.setup();
    render(<WorkoutFilters {...defaultProps} />);

    const searchInput = screen.getByLabelText('Search Workouts');
    await user.type(searchInput, 'test search');

    expect(searchInput).toHaveValue('test search');
    expect(mockOnSearchChange).toHaveBeenCalledWith('test search');
  });

  test('handles sort option changes', async () => {
    const user = userEvent.setup();
    render(<WorkoutFilters {...defaultProps} />);

    const sortSelect = screen.getByLabelText('Sort By');
    await user.selectOptions(sortSelect, 'name-asc');

    expect(mockOnSortChange).toHaveBeenCalledWith('name-asc');
  });

  test('shows and hides date filters when toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<WorkoutFilters {...defaultProps} />);

    const dateToggle = screen.getByText('Date Range Filter');
    
    // Date filters should be hidden initially
    expect(screen.queryByLabelText('From Date')).not.toBeInTheDocument();
    
    // Click to show date filters
    await user.click(dateToggle);
    
    expect(screen.getByLabelText('From Date')).toBeInTheDocument();
    expect(screen.getByLabelText('To Date')).toBeInTheDocument();
  });

  test('handles date filter changes', async () => {
    const user = userEvent.setup();
    render(<WorkoutFilters {...defaultProps} />);

    // Show date filters
    await user.click(screen.getByText('Date Range Filter'));

    const startDateInput = screen.getByLabelText('From Date');
    await user.type(startDateInput, '2024-01-01');

    expect(mockOnDateFilterChange).toHaveBeenCalledWith({
      start: new Date('2024-01-01'),
      end: null
    });
  });

  test('validates date range - start date cannot be after end date', async () => {
    const user = userEvent.setup();
    const propsWithEndDate = {
      ...defaultProps,
      dateFilter: { start: null, end: new Date('2024-01-15') }
    };

    render(<WorkoutFilters {...propsWithEndDate} />);

    // Show date filters
    await user.click(screen.getByText('Date Range Filter'));

    const startDateInput = screen.getByLabelText('From Date');
    await user.type(startDateInput, '2024-01-20'); // After end date

    expect(screen.getByText('Start date cannot be after end date')).toBeInTheDocument();
    expect(mockOnDateFilterChange).not.toHaveBeenCalled();
  });

  test('validates date range - end date cannot be before start date', async () => {
    const user = userEvent.setup();
    const propsWithStartDate = {
      ...defaultProps,
      dateFilter: { start: new Date('2024-01-15'), end: null }
    };

    render(<WorkoutFilters {...propsWithStartDate} />);

    // Show date filters
    await user.click(screen.getByText('Date Range Filter'));

    const endDateInput = screen.getByLabelText('To Date');
    await user.type(endDateInput, '2024-01-10'); // Before start date

    expect(screen.getByText('End date cannot be before start date')).toBeInTheDocument();
    expect(mockOnDateFilterChange).not.toHaveBeenCalled();
  });

  test('prevents future dates', async () => {
    const user = userEvent.setup();
    render(<WorkoutFilters {...defaultProps} />);

    // Show date filters
    await user.click(screen.getByText('Date Range Filter'));

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    const futureDateString = futureDate.toISOString().split('T')[0];

    const startDateInput = screen.getByLabelText('From Date');
    await user.type(startDateInput, futureDateString);

    expect(screen.getByText('Date cannot be in the future')).toBeInTheDocument();
    expect(mockOnDateFilterChange).not.toHaveBeenCalled();
  });

  test('shows clear filters button when filters are active', () => {
    const propsWithActiveFilters = {
      ...defaultProps,
      searchTerm: 'test',
      sortOption: 'name-asc'
    };

    render(<WorkoutFilters {...propsWithActiveFilters} />);

    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  test('hides clear filters button when no filters are active', () => {
    render(<WorkoutFilters {...defaultProps} />);

    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });

  test('handles clear filters action', async () => {
    const user = userEvent.setup();
    const propsWithActiveFilters = {
      ...defaultProps,
      searchTerm: 'test',
      sortOption: 'name-asc'
    };

    render(<WorkoutFilters {...propsWithActiveFilters} />);

    const clearButton = screen.getByText('Clear');
    await user.click(clearButton);

    expect(mockOnClearFilters).toHaveBeenCalled();
  });

  test('displays active filters summary', () => {
    const propsWithActiveFilters = {
      ...defaultProps,
      searchTerm: 'test search',
      dateFilter: { 
        start: new Date('2024-01-01'), 
        end: new Date('2024-01-31') 
      },
      sortOption: 'name-asc'
    };

    render(<WorkoutFilters {...propsWithActiveFilters} />);

    expect(screen.getByText('Search: "test search"')).toBeInTheDocument();
    expect(screen.getByText(/From: 1\/1\/2024/)).toBeInTheDocument();
    expect(screen.getByText(/To: 1\/31\/2024/)).toBeInTheDocument();
    expect(screen.getByText('Sort: Name (A-Z)')).toBeInTheDocument();
  });

  test('allows removing individual active filters', async () => {
    const user = userEvent.setup();
    const propsWithActiveFilters = {
      ...defaultProps,
      searchTerm: 'test search',
      dateFilter: { 
        start: new Date('2024-01-01'), 
        end: new Date('2024-01-31') 
      }
    };

    render(<WorkoutFilters {...propsWithActiveFilters} />);

    // Remove search filter
    const searchRemoveButton = screen.getByText('Search: "test search"').parentElement.querySelector('button');
    await user.click(searchRemoveButton);

    expect(mockOnSearchChange).toHaveBeenCalledWith('');

    // Remove start date filter
    const startDateRemoveButton = screen.getByText(/From: 1\/1\/2024/).parentElement.querySelector('button');
    await user.click(startDateRemoveButton);

    expect(mockOnDateFilterChange).toHaveBeenCalledWith({
      start: null,
      end: new Date('2024-01-31')
    });
  });

  test('shows date filter as active when dates are set', () => {
    const propsWithDateFilter = {
      ...defaultProps,
      dateFilter: { start: new Date('2024-01-01'), end: null }
    };

    render(<WorkoutFilters {...propsWithDateFilter} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  test('automatically shows date filters when date filter is active', () => {
    const propsWithDateFilter = {
      ...defaultProps,
      dateFilter: { start: new Date('2024-01-01'), end: null }
    };

    render(<WorkoutFilters {...propsWithDateFilter} />);

    expect(screen.getByLabelText('From Date')).toBeInTheDocument();
    expect(screen.getByLabelText('To Date')).toBeInTheDocument();
  });

  test('updates local search term when prop changes', () => {
    const { rerender } = render(<WorkoutFilters {...defaultProps} searchTerm="" />);
    
    const searchInput = screen.getByLabelText('Search Workouts');
    expect(searchInput).toHaveValue('');

    rerender(<WorkoutFilters {...defaultProps} searchTerm="updated search" />);
    expect(searchInput).toHaveValue('updated search');
  });

  test('handles search errors gracefully', async () => {
    const user = userEvent.setup();
    
    // Mock console.error to avoid test output noise
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock the search change to throw an error
    const errorOnSearchChange = jest.fn(() => {
      throw new Error('Search error');
    });

    render(<WorkoutFilters {...defaultProps} onSearchChange={errorOnSearchChange} />);

    const searchInput = screen.getByLabelText('Search Workouts');
    await user.type(searchInput, 'test');

    expect(screen.getByText('Search functionality is temporarily unavailable')).toBeInTheDocument();

    console.error.mockRestore();
  });

  test('handles date filter errors gracefully', async () => {
    const user = userEvent.setup();
    
    // Mock console.error to avoid test output noise
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock the date filter change to throw an error
    const errorOnDateFilterChange = jest.fn(() => {
      throw new Error('Date filter error');
    });

    render(<WorkoutFilters {...defaultProps} onDateFilterChange={errorOnDateFilterChange} />);

    // Show date filters
    await user.click(screen.getByText('Date Range Filter'));

    const startDateInput = screen.getByLabelText('From Date');
    await user.type(startDateInput, '2024-01-01');

    expect(screen.getByText('Date filter is temporarily unavailable')).toBeInTheDocument();

    console.error.mockRestore();
  });

  test('renders all sort options correctly', () => {
    render(<WorkoutFilters {...defaultProps} />);

    const sortSelect = screen.getByLabelText('Sort By');
    const options = Array.from(sortSelect.options).map(option => option.text);

    expect(options).toEqual([
      'Date (Newest First)',
      'Date (Oldest First)',
      'Name (A-Z)',
      'Name (Z-A)',
      'Most Exercises',
      'Fewest Exercises'
    ]);
  });

  test('has proper accessibility attributes', () => {
    render(<WorkoutFilters {...defaultProps} />);

    const searchInput = screen.getByLabelText('Search Workouts');
    const sortSelect = screen.getByLabelText('Sort By');

    expect(searchInput).toHaveAttribute('id', 'search-workouts');
    expect(sortSelect).toHaveAttribute('id', 'sort-workouts');
    expect(searchInput).toHaveAttribute('placeholder', 'Search by workout name or exercise...');
  });

  test('handles empty or null props gracefully', () => {
    const minimalProps = {
      onSearchChange: mockOnSearchChange,
      onDateFilterChange: mockOnDateFilterChange,
      onSortChange: mockOnSortChange,
      onClearFilters: mockOnClearFilters,
      workoutCount: 0
    };

    render(<WorkoutFilters {...minimalProps} />);

    expect(screen.getByText('0 workouts')).toBeInTheDocument();
    expect(screen.getByLabelText('Search Workouts')).toHaveValue('');
    expect(screen.getByLabelText('Sort By')).toHaveValue('date-desc');
  });
});