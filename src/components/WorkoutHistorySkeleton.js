/**
 * WorkoutHistorySkeleton Component
 * 
 * Provides skeleton loading states for the workout history components
 * to improve perceived performance and user experience.
 */

import React from 'react';
import { Card, Row, Col, Placeholder } from 'react-bootstrap';
import '../styles/QuickWorkoutHistory.css';

// Skeleton for individual workout card
export const WorkoutCardSkeleton = () => (
  <Card className="soft-card workout-history-card mb-3">
    <Card.Body>
      <Row className="align-items-center">
        <Col md={8}>
          <div className="mb-2">
            <Placeholder as="h5" animation="glow">
              <Placeholder xs={7} />
            </Placeholder>
            <div className="d-flex align-items-center gap-3 mb-2">
              <Placeholder as="small" animation="glow">
                <Placeholder xs={3} />
              </Placeholder>
              <Placeholder as="small" animation="glow">
                <Placeholder xs={4} />
              </Placeholder>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Placeholder.Button variant="secondary" xs={3} />
            <Placeholder as="small" animation="glow">
              <Placeholder xs={2} />
            </Placeholder>
          </div>
        </Col>
        <Col md={4}>
          <div className="d-flex justify-content-md-end gap-2">
            <Placeholder.Button variant="outline-primary" xs={2} />
            <Placeholder.Button variant="outline-success" xs={2} />
            <Placeholder.Button variant="outline-danger" xs={2} />
          </div>
        </Col>
      </Row>
    </Card.Body>
  </Card>
);

// Skeleton for workout history list
export const WorkoutHistoryListSkeleton = ({ count = 5 }) => (
  <div>
    {Array.from({ length: count }, (_, index) => (
      <WorkoutCardSkeleton key={index} />
    ))}
  </div>
);

// Skeleton for workout stats card
export const WorkoutStatsCardSkeleton = () => (
  <Card className="soft-card stats-card mb-4">
    <Card.Header className="stats-header">
      <Placeholder as="h5" animation="glow" className="mb-0">
        <Placeholder xs={6} />
      </Placeholder>
    </Card.Header>
    <Card.Body className="stats-body">
      {/* Overview Stats Skeleton */}
      <div className="stats-overview-grid mb-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="stats-overview-item">
            <Placeholder as="div" animation="glow" className="stats-overview-value">
              <Placeholder xs={4} />
            </Placeholder>
            <Placeholder as="div" animation="glow" className="stats-overview-label">
              <Placeholder xs={6} />
            </Placeholder>
          </div>
        ))}
      </div>

      {/* Recent Activity Skeleton */}
      <Row>
        <Col md={6} className="mb-4">
          <Placeholder as="div" animation="glow" className="stats-section-title mb-3">
            <Placeholder xs={5} />
          </Placeholder>
          <div className="mb-2">
            <Placeholder as="div" animation="glow">
              <Placeholder xs={8} />
            </Placeholder>
          </div>
          <div className="mb-2">
            <Placeholder as="div" animation="glow">
              <Placeholder xs={6} />
            </Placeholder>
          </div>
          <div>
            <Placeholder as="div" animation="glow">
              <Placeholder xs={7} />
            </Placeholder>
          </div>
        </Col>
        <Col md={6}>
          <Placeholder as="div" animation="glow" className="stats-section-title mb-3">
            <Placeholder xs={5} />
          </Placeholder>
          <div className="mb-2">
            <Placeholder as="div" animation="glow">
              <Placeholder xs={8} />
            </Placeholder>
          </div>
          <div className="mb-2">
            <Placeholder as="div" animation="glow">
              <Placeholder xs={6} />
            </Placeholder>
          </div>
          <div>
            <Placeholder as="div" animation="glow">
              <Placeholder xs={7} />
            </Placeholder>
          </div>
        </Col>
      </Row>

      {/* Frequent Exercises Skeleton */}
      <div className="stats-section">
        <Placeholder as="div" animation="glow" className="stats-section-title mb-3">
          <Placeholder xs={6} />
        </Placeholder>
        <div className="frequent-exercises-table">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="d-flex justify-content-between align-items-center mb-2 p-2 bg-light rounded">
              <div className="d-flex align-items-center">
                <Placeholder.Button variant="light" xs={1} className="me-2" />
                <div>
                  <Placeholder as="div" animation="glow">
                    <Placeholder xs={4} />
                  </Placeholder>
                  <Placeholder as="small" animation="glow">
                    <Placeholder xs={3} />
                  </Placeholder>
                </div>
              </div>
              <Placeholder.Button variant="primary" xs={1} />
            </div>
          ))}
        </div>
      </div>
    </Card.Body>
  </Card>
);

// Skeleton for workout filters
export const WorkoutFiltersSkeleton = () => (
  <Card className="soft-card filters-card mb-4">
    <Card.Header className="filters-header">
      <div className="d-flex align-items-center justify-content-between">
        <Placeholder as="h6" animation="glow" className="mb-0">
          <Placeholder xs={4} />
        </Placeholder>
        <Placeholder.Button variant="info" xs={2} />
      </div>
    </Card.Header>
    <Card.Body className="filters-body">
      <Row>
        <Col md={6}>
          <Placeholder as="label" animation="glow" className="form-label">
            <Placeholder xs={4} />
          </Placeholder>
          <Placeholder as="div" animation="glow" className="form-control">
            <Placeholder xs={8} />
          </Placeholder>
        </Col>
        <Col md={6}>
          <Placeholder as="label" animation="glow" className="form-label">
            <Placeholder xs={3} />
          </Placeholder>
          <Placeholder as="div" animation="glow" className="form-select">
            <Placeholder xs={6} />
          </Placeholder>
        </Col>
      </Row>
    </Card.Body>
  </Card>
);

// Skeleton for workout detail view
export const WorkoutDetailSkeleton = () => (
  <div className="soft-container py-4">
    {/* Header Skeleton */}
    <div className="workout-detail-header">
      <div className="d-flex align-items-center justify-content-between flex-wrap">
        <div className="d-flex align-items-center flex-wrap">
          <Placeholder.Button variant="outline-secondary" className="me-3 mb-2" />
          <div>
            <Placeholder as="h1" animation="glow" className="soft-title mb-1">
              <Placeholder xs={8} />
            </Placeholder>
            <div className="d-flex align-items-center gap-3">
              <Placeholder as="small" animation="glow">
                <Placeholder xs={4} />
              </Placeholder>
              <Placeholder as="small" animation="glow">
                <Placeholder xs={3} />
              </Placeholder>
            </div>
          </div>
        </div>
        <div className="d-flex gap-2">
          <Placeholder.Button variant="outline-success" />
          <Placeholder.Button variant="outline-danger" />
        </div>
      </div>
    </div>

    {/* Stats Overview Skeleton */}
    <Row className="mb-4">
      <Col>
        <Card className="soft-card workout-stats-overview">
          <Card.Body>
            <Row className="text-center">
              {Array.from({ length: 4 }, (_, index) => (
                <Col key={index} md={3} sm={6} className="workout-stats-item">
                  <Placeholder as="div" animation="glow" className="workout-stats-value">
                    <Placeholder xs={3} />
                  </Placeholder>
                  <Placeholder as="div" animation="glow" className="workout-stats-label">
                    <Placeholder xs={5} />
                  </Placeholder>
                </Col>
              ))}
            </Row>
          </Card.Body>
        </Card>
      </Col>
    </Row>

    {/* Exercise Details Skeleton */}
    {Array.from({ length: 3 }, (_, index) => (
      <Card key={index} className="soft-card exercise-detail-card">
        <Card.Header className="exercise-detail-header">
          <Row className="align-items-center">
            <Col>
              <Placeholder as="h5" animation="glow" className="mb-1">
                <Placeholder xs={6} />
              </Placeholder>
              <div className="d-flex align-items-center gap-2">
                <Placeholder as="small" animation="glow">
                  <Placeholder xs={3} />
                </Placeholder>
                <Placeholder.Button variant="outline-secondary" xs={2} />
              </div>
            </Col>
            <Col xs="auto">
              <Placeholder.Button variant="success" xs={3} />
            </Col>
          </Row>
        </Card.Header>
        <Card.Body>
          <div className="workout-table">
            {Array.from({ length: 3 }, (_, setIndex) => (
              <div key={setIndex} className="d-flex justify-content-between align-items-center mb-2 p-2 bg-light rounded">
                <Placeholder.Button variant="light" xs={1} />
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={2} />
                </Placeholder>
                <Placeholder as="span" animation="glow">
                  <Placeholder xs={2} />
                </Placeholder>
                <Placeholder.Button variant="success" xs={2} />
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>
    ))}
  </div>
);

// Main skeleton component that combines all skeletons
const WorkoutHistorySkeleton = ({ type = 'list', count = 5 }) => {
  switch (type) {
    case 'stats':
      return <WorkoutStatsCardSkeleton />;
    case 'filters':
      return <WorkoutFiltersSkeleton />;
    case 'detail':
      return <WorkoutDetailSkeleton />;
    case 'card':
      return <WorkoutCardSkeleton />;
    case 'list':
    default:
      return (
        <div>
          <WorkoutStatsCardSkeleton />
          <WorkoutFiltersSkeleton />
          <WorkoutHistoryListSkeleton count={count} />
        </div>
      );
  }
};

export default WorkoutHistorySkeleton;