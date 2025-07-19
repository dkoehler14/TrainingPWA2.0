/**
 * WorkoutFilters Component
 * 
 * Provides search, filtering, and sorting functionality for quick workout history.
 * Includes debounced search input, date range filtering, sort options, and clear filters
 * with enhanced error handling and user feedback.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Form, Button, Badge, InputGroup, Alert } from 'react-bootstrap';
import { Search, Calendar, SortDown, X, Funnel, ExclamationTriangle } from 'react-bootstrap-icons';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { debounce } from 'lodash';
import '../styles/QuickWorkoutHistory.css';

const WorkoutFilters = ({
  searchTerm,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  sortOption,
  onSortChange,
  onClearFilters,
  workoutCount
}) => {
  // Local state for immediate UI updates
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm || '');
  const [showDateFilters, setShowDateFilters] = useState(false);
  const [dateError, setDateError] = useState(null);
  const [searchError, setSearchError] = useState(null);

  // Sort options
  const sortOptions = [
    { value: 'date-desc', label: 'Date (Newest First)' },
    { value: 'date-asc', label: 'Date (Oldest First)' },
    { value: 'name-asc', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
    { value: 'exercise-count-desc', label: 'Most Exercises' },
    { value: 'exercise-count-asc', label: 'Fewest Exercises' }
  ];

  // Create debounced search function
  const debouncedSearch = useCallback(
    debounce((searchValue) => {
      onSearchChange(searchValue);
    }, 300), // 300ms debounce
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onSearchChange]
  );

  // Handle search input changes
  const handleSearchChange = (e) => {
    try {
      const value = e.target.value;
      setLocalSearchTerm(value);
      setSearchError(null);
      debouncedSearch(value);
    } catch (error) {
      console.error('Error handling search input:', error);
      setSearchError('Search functionality is temporarily unavailable');
    }
  };

  // Handle date filter changes
  const handleDateFilterChange = (field, date) => {
    try {
      setDateError(null);
      
      // Validate date range
      if (field === 'start' && date && dateFilter?.end && date > dateFilter.end) {
        setDateError('Start date cannot be after end date');
        return;
      }
      
      if (field === 'end' && date && dateFilter?.start && date < dateFilter.start) {
        setDateError('End date cannot be before start date');
        return;
      }
      
      // Validate date is not in the future
      if (date && date > new Date()) {
        setDateError('Date cannot be in the future');
        return;
      }

      const newDateFilter = {
        ...dateFilter,
        [field]: date
      };
      onDateFilterChange(newDateFilter);
    } catch (error) {
      console.error('Error handling date filter:', error);
      setDateError('Date filter is temporarily unavailable');
    }
  };

  // Handle clear filters
  const handleClearFilters = () => {
    setLocalSearchTerm('');
    setShowDateFilters(false);
    onClearFilters();
  };

  // Check if any filters are active
  const hasActiveFilters = () => {
    return localSearchTerm || 
           dateFilter?.start || 
           dateFilter?.end || 
           sortOption !== 'date-desc';
  };

  // Update local search term when prop changes (for external updates)
  useEffect(() => {
    setLocalSearchTerm(searchTerm || '');
  }, [searchTerm]);

  // Show date filters if date filter is active
  useEffect(() => {
    if (dateFilter?.start || dateFilter?.end) {
      setShowDateFilters(true);
    }
  }, [dateFilter]);

  return (
    <Card className="soft-card filters-card">
      <Card.Header className="filters-header d-flex align-items-center justify-content-between flex-wrap">
        <div className="d-flex align-items-center mb-2 mb-md-0">
          <Funnel className="me-2" />
          <h6 className="mb-0">Filter & Search</h6>
        </div>
        <div className="d-flex align-items-center flex-wrap">
          <Badge bg="info" className="me-2 mb-2 mb-md-0">
            {workoutCount} workout{workoutCount !== 1 ? 's' : ''}
          </Badge>
          {hasActiveFilters() && (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={handleClearFilters}
              className="d-flex align-items-center"
            >
              <X className="me-1" size={14} />
              <span className="d-none d-sm-inline">Clear</span>
            </Button>
          )}
        </div>
      </Card.Header>
      <Card.Body className="filters-body">
        <Row>
          {/* Search Input */}
          <Col md={6} className="filter-input-group">
            <Form.Group>
              <Form.Label htmlFor="search-workouts">Search Workouts</Form.Label>
              <InputGroup>
                <InputGroup.Text>
                  <Search size={16} />
                </InputGroup.Text>
                <Form.Control
                  id="search-workouts"
                  type="text"
                  placeholder="Search by workout name or exercise..."
                  value={localSearchTerm}
                  onChange={handleSearchChange}
                />
              </InputGroup>
            </Form.Group>
          </Col>

          {/* Sort Options */}
          <Col md={6} className="filter-input-group">
            <Form.Group>
              <Form.Label htmlFor="sort-workouts">Sort By</Form.Label>
              <InputGroup>
                <InputGroup.Text>
                  <SortDown size={16} />
                </InputGroup.Text>
                <Form.Select
                  id="sort-workouts"
                  value={sortOption}
                  onChange={(e) => onSortChange(e.target.value)}
                >
                  {sortOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Form.Select>
              </InputGroup>
            </Form.Group>
          </Col>
        </Row>

        {/* Date Filter Toggle */}
        <Row className="mb-3">
          <Col>
            <Button
              variant={showDateFilters ? "primary" : "outline-primary"}
              size="sm"
              onClick={() => setShowDateFilters(!showDateFilters)}
              className="d-flex align-items-center date-filter-toggle"
            >
              <Calendar className="me-2" size={16} />
              <span className="d-none d-sm-inline">Date Range Filter</span>
              <span className="d-sm-none">Date Filter</span>
              {(dateFilter?.start || dateFilter?.end) && (
                <Badge bg="light" text="dark" className="ms-2">
                  Active
                </Badge>
              )}
            </Button>
          </Col>
        </Row>

        {/* Error Messages */}
        {(searchError || dateError) && (
          <Row className="mb-3">
            <Col>
              {searchError && (
                <Alert variant="warning" className="mb-2">
                  <ExclamationTriangle className="me-2" size={16} />
                  {searchError}
                </Alert>
              )}
              {dateError && (
                <Alert variant="warning" className="mb-2">
                  <ExclamationTriangle className="me-2" size={16} />
                  {dateError}
                </Alert>
              )}
            </Col>
          </Row>
        )}

        {/* Date Range Filters */}
        {showDateFilters && (
          <div className="date-filter-section">
            <Row>
              <Col md={6} className="mb-3">
                <Form.Group>
                  <Form.Label>From Date</Form.Label>
                  <DatePicker
                    selected={dateFilter?.start}
                    onChange={(date) => handleDateFilterChange('start', date)}
                    selectsStart
                    startDate={dateFilter?.start}
                    endDate={dateFilter?.end}
                    maxDate={dateFilter?.end || new Date()}
                    placeholderText="Select start date"
                    className="form-control"
                    dateFormat="MMM d, yyyy"
                    isClearable
                  />
                </Form.Group>
              </Col>
              <Col md={6} className="mb-3">
                <Form.Group>
                  <Form.Label>To Date</Form.Label>
                  <DatePicker
                    selected={dateFilter?.end}
                    onChange={(date) => handleDateFilterChange('end', date)}
                    selectsEnd
                    startDate={dateFilter?.start}
                    endDate={dateFilter?.end}
                    minDate={dateFilter?.start}
                    maxDate={new Date()}
                    placeholderText="Select end date"
                    className="form-control"
                    dateFormat="MMM d, yyyy"
                    isClearable
                  />
                </Form.Group>
              </Col>
            </Row>
          </div>
        )}

        {/* Active Filters Summary */}
        {hasActiveFilters() && (
          <div className="active-filters-section">
            <div className="d-flex flex-wrap">
              {localSearchTerm && (
                <Badge bg="secondary" className="filter-badge d-flex align-items-center">
                  Search: "{localSearchTerm}"
                  <Button
                    variant="link"
                    size="sm"
                    className="btn-link p-0 ms-1 text-white"
                    onClick={() => {
                      setLocalSearchTerm('');
                      onSearchChange('');
                    }}
                  >
                    <X size={12} />
                  </Button>
                </Badge>
              )}
              {dateFilter?.start && (
                <Badge bg="secondary" className="filter-badge d-flex align-items-center">
                  From: {dateFilter.start.toLocaleDateString()}
                  <Button
                    variant="link"
                    size="sm"
                    className="btn-link p-0 ms-1 text-white"
                    onClick={() => handleDateFilterChange('start', null)}
                  >
                    <X size={12} />
                  </Button>
                </Badge>
              )}
              {dateFilter?.end && (
                <Badge bg="secondary" className="filter-badge d-flex align-items-center">
                  To: {dateFilter.end.toLocaleDateString()}
                  <Button
                    variant="link"
                    size="sm"
                    className="btn-link p-0 ms-1 text-white"
                    onClick={() => handleDateFilterChange('end', null)}
                  >
                    <X size={12} />
                  </Button>
                </Badge>
              )}
              {sortOption !== 'date-desc' && (
                <Badge bg="secondary" className="filter-badge">
                  Sort: {sortOptions.find(opt => opt.value === sortOption)?.label}
                </Badge>
              )}
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default WorkoutFilters;