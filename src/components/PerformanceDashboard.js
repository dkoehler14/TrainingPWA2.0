/**
 * Performance Dashboard Component
 * 
 * Displays comprehensive performance monitoring data for the programs data fetching optimization
 */

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Badge, Table, Accordion, Button, Modal } from 'react-bootstrap';
import { GraphUp, Clock, Database, Memory, Activity, Eye, EyeSlash } from 'react-bootstrap-icons';
import { getPerformanceStats, logPerformanceSummary, resetPerformanceStats } from '../utils/performanceMonitor';
import { getEnhancedCacheStats } from '../api/supabaseCache';

function PerformanceDashboard({ show = false, onToggle }) {
  const [performanceStats, setPerformanceStats] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Refresh performance stats
  const refreshStats = () => {
    try {
      const perfStats = getPerformanceStats();
      const enhancedCacheStats = getEnhancedCacheStats();
      setPerformanceStats(perfStats);
      setCacheStats(enhancedCacheStats);
    } catch (error) {
      console.error('Error refreshing performance stats:', error);
    }
  };

  // Auto-refresh stats every 5 seconds
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(refreshStats, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Initial load
  useEffect(() => {
    refreshStats();
  }, []);

  if (!show || !performanceStats) {
    return (
      <div style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 1000 }}>
        <Button
          variant="outline-info"
          size="sm"
          onClick={() => onToggle && onToggle()}
          title="Show Performance Dashboard"
        >
          <GraphUp /> Performance
        </Button>
      </div>
    );
  }

  const formatPercentage = (value) => {
    if (typeof value === 'string' && value.includes('%')) return value;
    return `${parseFloat(value || 0).toFixed(2)}%`;
  };

  const formatTime = (value) => {
    if (typeof value === 'string' && value.includes('ms')) return value;
    return `${parseFloat(value || 0).toFixed(2)}ms`;
  };

  const formatBytes = (bytes) => {
    if (typeof bytes === 'string') return bytes;
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <>
      <div style={{ 
        position: 'fixed', 
        top: '10px', 
        right: '10px', 
        zIndex: 1000,
        maxWidth: '400px',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <Card className="shadow-sm">
          <Card.Header className="d-flex justify-content-between align-items-center py-2">
            <div className="d-flex align-items-center">
              <GraphUp className="me-2" />
              <strong>Performance Monitor</strong>
            </div>
            <div>
              <Button
                variant="outline-secondary"
                size="sm"
                className="me-2"
                onClick={() => setAutoRefresh(!autoRefresh)}
                title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
              >
                {autoRefresh ? <Eye /> : <EyeSlash />}
              </Button>
              <Button
                variant="outline-primary"
                size="sm"
                className="me-2"
                onClick={refreshStats}
                title="Refresh stats"
              >
                <Activity />
              </Button>
              <Button
                variant="outline-info"
                size="sm"
                className="me-2"
                onClick={() => setShowModal(true)}
                title="View detailed stats"
              >
                <Database />
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => onToggle && onToggle()}
                title="Hide dashboard"
              >
                ×
              </Button>
            </div>
          </Card.Header>
          
          <Card.Body className="p-2">
            {/* Quick Stats */}
            <Row className="g-2 mb-3">
              <Col xs={6}>
                <Card className="text-center border-0 bg-light">
                  <Card.Body className="p-2">
                    <div className="h6 mb-1 text-primary">
                      {performanceStats.cachePerformance.overallCacheHitRate}
                    </div>
                    <small className="text-muted">Cache Hit Rate</small>
                  </Card.Body>
                </Card>
              </Col>
              <Col xs={6}>
                <Card className="text-center border-0 bg-light">
                  <Card.Body className="p-2">
                    <div className="h6 mb-1 text-success">
                      {performanceStats.databasePerformance.averageQueryTime}
                    </div>
                    <small className="text-muted">Avg Query Time</small>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="g-2 mb-3">
              <Col xs={6}>
                <Card className="text-center border-0 bg-light">
                  <Card.Body className="p-2">
                    <div className="h6 mb-1 text-info">
                      {performanceStats.memoryUsage.reductionPercentage}
                    </div>
                    <small className="text-muted">Memory Reduction</small>
                  </Card.Body>
                </Card>
              </Col>
              <Col xs={6}>
                <Card className="text-center border-0 bg-light">
                  <Card.Body className="p-2">
                    <div className="h6 mb-1 text-warning">
                      {performanceStats.databasePerformance.totalQueries}
                    </div>
                    <small className="text-muted">Total Queries</small>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* Optimization Impact */}
            <Accordion className="mb-2">
              <Accordion.Item eventKey="0">
                <Accordion.Header>
                  <Clock className="me-2" />
                  Optimization Impact
                </Accordion.Header>
                <Accordion.Body className="p-2">
                  <Table size="sm" className="mb-0">
                    <tbody>
                      <tr>
                        <td>Unified Cache Hits</td>
                        <td>
                          <Badge bg="success">
                            {performanceStats.cachePerformance.unifiedCacheHits}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td>Legacy Cache Hits</td>
                        <td>
                          <Badge bg="secondary">
                            {performanceStats.cachePerformance.legacyCacheHits}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td>Client-Side Filters</td>
                        <td>
                          <Badge bg="info">
                            {performanceStats.cachePerformance.clientSideFilters}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td>Duplicates Avoided</td>
                        <td>
                          <Badge bg="primary">
                            {performanceStats.cachePerformance.duplicateCacheEntriesAvoided}
                          </Badge>
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </Accordion.Body>
              </Accordion.Item>

              <Accordion.Item eventKey="1">
                <Accordion.Header>
                  <Memory className="me-2" />
                  Memory Usage
                </Accordion.Header>
                <Accordion.Body className="p-2">
                  <Table size="sm" className="mb-0">
                    <tbody>
                      <tr>
                        <td>Current Usage</td>
                        <td>{performanceStats.memoryUsage.currentUsage}</td>
                      </tr>
                      <tr>
                        <td>Peak Usage</td>
                        <td>{performanceStats.memoryUsage.peakUsage}</td>
                      </tr>
                      <tr>
                        <td>Reduction</td>
                        <td className="text-success">
                          {performanceStats.memoryUsage.reduction}
                        </td>
                      </tr>
                      <tr>
                        <td>Cache Memory Saved</td>
                        <td className="text-info">
                          {performanceStats.memoryUsage.duplicateCacheMemorySaved}
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </Accordion.Body>
              </Accordion.Item>

              <Accordion.Item eventKey="2">
                <Accordion.Header>
                  <Database className="me-2" />
                  Data Flow
                </Accordion.Header>
                <Accordion.Body className="p-2">
                  <Table size="sm" className="mb-0">
                    <tbody>
                      <tr>
                        <td>Programs Fetched</td>
                        <td>{performanceStats.dataFlow.totalProgramsFetched}</td>
                      </tr>
                      <tr>
                        <td>Template Filtered</td>
                        <td>{performanceStats.dataFlow.templateProgramsFiltered}</td>
                      </tr>
                      <tr>
                        <td>User Filtered</td>
                        <td>{performanceStats.dataFlow.userProgramsFiltered}</td>
                      </tr>
                      <tr>
                        <td>Avg Transform Time</td>
                        <td>{performanceStats.dataFlow.averageTransformationTime}</td>
                      </tr>
                      <tr>
                        <td>Avg Filter Time</td>
                        <td>{performanceStats.dataFlow.averageFilteringTime}</td>
                      </tr>
                      <tr>
                        <td>Errors</td>
                        <td>
                          <Badge bg={performanceStats.dataFlow.dataFlowErrors > 0 ? 'danger' : 'success'}>
                            {performanceStats.dataFlow.dataFlowErrors}
                          </Badge>
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </Accordion.Body>
              </Accordion.Item>
            </Accordion>

            {/* Session Info */}
            <div className="text-center">
              <small className="text-muted">
                Session: {performanceStats.session.duration} | 
                Queries/min: {performanceStats.session.queriesPerMinute}
              </small>
            </div>
          </Card.Body>
        </Card>
      </div>

      {/* Detailed Stats Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Detailed Performance Statistics</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Accordion>
            <Accordion.Item eventKey="0">
              <Accordion.Header>Database Performance</Accordion.Header>
              <Accordion.Body>
                <pre style={{ fontSize: '12px', maxHeight: '300px', overflow: 'auto' }}>
                  {JSON.stringify(performanceStats.databasePerformance, null, 2)}
                </pre>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="1">
              <Accordion.Header>Cache Performance</Accordion.Header>
              <Accordion.Body>
                <pre style={{ fontSize: '12px', maxHeight: '300px', overflow: 'auto' }}>
                  {JSON.stringify(performanceStats.cachePerformance, null, 2)}
                </pre>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="2">
              <Accordion.Header>Enhanced Cache Stats</Accordion.Header>
              <Accordion.Body>
                <pre style={{ fontSize: '12px', maxHeight: '300px', overflow: 'auto' }}>
                  {JSON.stringify(cacheStats, null, 2)}
                </pre>
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="warning" onClick={resetPerformanceStats}>
            Reset Stats
          </Button>
          <Button variant="info" onClick={logPerformanceSummary}>
            Log Summary
          </Button>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default PerformanceDashboard;