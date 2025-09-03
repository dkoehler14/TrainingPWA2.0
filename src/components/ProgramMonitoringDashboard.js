import React, { useState, useEffect } from 'react'
import { Card, Row, Col, ProgressBar, Badge, Button, Alert, Spinner, Table } from 'react-bootstrap'
import { 
  getClientProgramProgress, 
  getProgramCompletionAnalytics, 
  generateProgramEffectivenessReport 
} from '../services/coachProgramMonitoringService'
import { useAuth } from '../hooks/useAuth'
import '../styles/ProgramMonitoringDashboard.css'

/**
 * Program Monitoring Dashboard Component
 * Displays comprehensive program progress tracking and analytics for coaches
 * Requirements: 4.2, 4.3, 5.5
 */
const ProgramMonitoringDashboard = ({ clientId, programId, showFullAnalytics = false }) => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [programProgress, setProgramProgress] = useState(null)
  const [completionAnalytics, setCompletionAnalytics] = useState(null)
  const [effectivenessReport, setEffectivenessReport] = useState(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState('90d')

  useEffect(() => {
    if (user?.id) {
      loadMonitoringData()
    }
  }, [user?.id, clientId, programId, selectedTimeframe])

  const loadMonitoringData = async () => {
    try {
      setLoading(true)
      setError(null)

      const promises = []

      // Load specific program progress if clientId and programId provided
      if (clientId && programId) {
        promises.push(
          getClientProgramProgress(user.id, clientId, programId)
            .then(data => setProgramProgress(data))
        )
      }

      // Load completion analytics if showing full analytics
      if (showFullAnalytics) {
        promises.push(
          getProgramCompletionAnalytics(user.id, { timeframe: selectedTimeframe })
            .then(data => setCompletionAnalytics(data))
        )

        promises.push(
          generateProgramEffectivenessReport(user.id, { timeframe: selectedTimeframe })
            .then(data => setEffectivenessReport(data))
        )
      }

      await Promise.all(promises)
    } catch (err) {
      console.error('Error loading monitoring data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString()
  }

  const formatLastActivity = (timestamp) => {
    if (!timestamp) return 'No activity'
    const days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    return `${days} days ago`
  }

  const getProgressVariant = (rate) => {
    if (rate >= 80) return 'success'
    if (rate >= 60) return 'info'
    if (rate >= 40) return 'warning'
    return 'danger'
  }

  const getEffectivenessColor = (score) => {
    if (score >= 80) return 'success'
    if (score >= 60) return 'info'
    if (score >= 40) return 'warning'
    return 'danger'
  }

  if (loading) {
    return (
      <div className="text-center p-4">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading monitoring data...</span>
        </Spinner>
        <p className="mt-2">Loading program monitoring data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="danger">
        <Alert.Heading>Error Loading Monitoring Data</Alert.Heading>
        <p>{error}</p>
        <Button variant="outline-danger" onClick={loadMonitoringData}>
          Try Again
        </Button>
      </Alert>
    )
  }

  return (
    <div className="program-monitoring-dashboard">
      {/* Individual Program Progress */}
      {programProgress && (
        <Card className="mb-4">
          <Card.Header>
            <h5 className="mb-0">
              Program Progress: {programProgress.program.name}
            </h5>
            <small className="text-muted">
              Client: {programProgress.program.assigned_client?.name || 'Unknown Client'}
            </small>
          </Card.Header>
          <Card.Body>
            <Row>
              <Col md={6}>
                <h6>Overall Progress</h6>
                <div className="mb-3">
                  <div className="d-flex justify-content-between mb-1">
                    <span>Completion Rate</span>
                    <span>{programProgress.progressMetrics.overall.completionRate}%</span>
                  </div>
                  <ProgressBar 
                    now={programProgress.progressMetrics.overall.completionRate} 
                    variant={getProgressVariant(programProgress.progressMetrics.overall.completionRate)}
                  />
                </div>
                <div className="mb-3">
                  <div className="d-flex justify-content-between mb-1">
                    <span>Adherence Rate</span>
                    <span>{programProgress.progressMetrics.overall.adherenceRate}%</span>
                  </div>
                  <ProgressBar 
                    now={programProgress.progressMetrics.overall.adherenceRate} 
                    variant={getProgressVariant(programProgress.progressMetrics.overall.adherenceRate)}
                  />
                </div>
              </Col>
              <Col md={6}>
                <h6>Program Stats</h6>
                <Row>
                  <Col xs={6}>
                    <div className="text-center">
                      <h4 className="text-primary mb-0">
                        {programProgress.progressMetrics.overall.completedWorkouts}
                      </h4>
                      <small className="text-muted">Completed</small>
                    </div>
                  </Col>
                  <Col xs={6}>
                    <div className="text-center">
                      <h4 className="text-secondary mb-0">
                        {programProgress.progressMetrics.overall.totalWorkouts}
                      </h4>
                      <small className="text-muted">Total</small>
                    </div>
                  </Col>
                </Row>
                <hr />
                <div className="d-flex justify-content-between">
                  <span>Current Week:</span>
                  <Badge bg="info">{programProgress.progressMetrics.overall.currentWeek}</Badge>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Days Since Start:</span>
                  <span>{programProgress.progressMetrics.overall.daysSinceStart}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Last Workout:</span>
                  <span>
                    {programProgress.progressMetrics.lastWorkout ? 
                      formatDate(programProgress.progressMetrics.lastWorkout.completed_date) : 
                      'None'
                    }
                  </span>
                </div>
              </Col>
            </Row>

            {/* Weekly Progress */}
            <h6 className="mt-4 mb-3">Weekly Progress</h6>
            <Row>
              {Object.entries(programProgress.progressMetrics.weekly).map(([week, weekData]) => (
                <Col key={week} md={3} className="mb-2">
                  <Card className="h-100">
                    <Card.Body className="p-2">
                      <div className="text-center">
                        <h6 className="mb-1">Week {week}</h6>
                        <ProgressBar 
                          now={weekData.completionRate} 
                          variant={getProgressVariant(weekData.completionRate)}
                          className="mb-1"
                          style={{ height: '8px' }}
                        />
                        <small className="text-muted">
                          {weekData.completedWorkouts}/{weekData.totalWorkouts}
                        </small>
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>

            {/* Top Exercises Progress */}
            {Object.keys(programProgress.progressMetrics.exercises).length > 0 && (
              <>
                <h6 className="mt-4 mb-3">Exercise Progress</h6>
                <Table responsive size="sm">
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Sessions</th>
                      <th>Max Weight</th>
                      <th>Avg Volume</th>
                      <th>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(programProgress.progressMetrics.exercises)
                      .slice(0, 5) // Show top 5 exercises
                      .map(([exerciseId, exerciseData]) => (
                        <tr key={exerciseId}>
                          <td>{exerciseData.exerciseName}</td>
                          <td>{exerciseData.timesPerformed}</td>
                          <td>{Math.round(exerciseData.maxWeight)} lbs</td>
                          <td>{Math.round(exerciseData.averageVolume)}</td>
                          <td>
                            <Badge bg={
                              exerciseData.progressTrend === 'improving' ? 'success' :
                              exerciseData.progressTrend === 'declining' ? 'danger' :
                              exerciseData.progressTrend === 'stable' ? 'info' : 'secondary'
                            }>
                              {exerciseData.progressTrend.replace('_', ' ')}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Full Analytics Dashboard */}
      {showFullAnalytics && (
        <>
          {/* Timeframe Selector */}
          <Card className="mb-4">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Program Analytics Dashboard</h5>
                <div>
                  <label className="me-2">Timeframe:</label>
                  <select 
                    value={selectedTimeframe} 
                    onChange={(e) => setSelectedTimeframe(e.target.value)}
                    className="form-select form-select-sm d-inline-block w-auto"
                  >
                    <option value="30d">Last 30 Days</option>
                    <option value="90d">Last 90 Days</option>
                    <option value="6m">Last 6 Months</option>
                    <option value="1y">Last Year</option>
                  </select>
                </div>
              </div>
            </Card.Body>
          </Card>

          {/* Completion Analytics */}
          {completionAnalytics && (
            <Card className="mb-4">
              <Card.Header>
                <h5 className="mb-0">Program Completion Overview</h5>
              </Card.Header>
              <Card.Body>
                <Row>
                  <Col md={3}>
                    <div className="text-center">
                      <h3 className="text-primary mb-0">
                        {completionAnalytics.totalPrograms}
                      </h3>
                      <small className="text-muted">Total Programs</small>
                    </div>
                  </Col>
                  <Col md={3}>
                    <div className="text-center">
                      <h3 className="text-success mb-0">
                        {completionAnalytics.completionStats.overallCompletionRate}%
                      </h3>
                      <small className="text-muted">Avg Completion</small>
                    </div>
                  </Col>
                  <Col md={3}>
                    <div className="text-center">
                      <h3 className="text-info mb-0">
                        {completionAnalytics.completionStats.activePrograms}
                      </h3>
                      <small className="text-muted">Active Programs</small>
                    </div>
                  </Col>
                  <Col md={3}>
                    <div className="text-center">
                      <h3 className="text-warning mb-0">
                        {completionAnalytics.completionStats.inactivePrograms}
                      </h3>
                      <small className="text-muted">Inactive Programs</small>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          )}

          {/* Effectiveness Report */}
          {effectivenessReport && (
            <>
              {/* Summary Cards */}
              <Row className="mb-4">
                <Col md={3}>
                  <Card className="text-center">
                    <Card.Body>
                      <h4 className="text-primary">
                        {effectivenessReport.summary.averageCompletionRate}%
                      </h4>
                      <small className="text-muted">Average Completion Rate</small>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center">
                    <Card.Body>
                      <h4 className="text-success">
                        {effectivenessReport.summary.highPerformingPrograms}
                      </h4>
                      <small className="text-muted">High Performing Programs</small>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center">
                    <Card.Body>
                      <h4 className="text-info">
                        {effectivenessReport.summary.clientRetentionRate}%
                      </h4>
                      <small className="text-muted">Client Retention Rate</small>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center">
                    <Card.Body>
                      <h4 className="text-warning">
                        {effectivenessReport.summary.lowPerformingPrograms}
                      </h4>
                      <small className="text-muted">Programs Need Attention</small>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Program Analysis */}
              <Card className="mb-4">
                <Card.Header>
                  <h5 className="mb-0">Program Effectiveness Analysis</h5>
                </Card.Header>
                <Card.Body>
                  <Table responsive>
                    <thead>
                      <tr>
                        <th>Program</th>
                        <th>Client</th>
                        <th>Completion</th>
                        <th>Effectiveness Score</th>
                        <th>Last Activity</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectivenessReport.programAnalysis.slice(0, 10).map((program) => (
                        <tr key={program.programId}>
                          <td>
                            <strong>{program.programName}</strong>
                            <br />
                            <small className="text-muted">
                              {program.difficulty} • {program.expectedDuration}w
                            </small>
                          </td>
                          <td>{program.clientName}</td>
                          <td>
                            <ProgressBar 
                              now={program.completionRate} 
                              variant={getProgressVariant(program.completionRate)}
                              style={{ height: '20px' }}
                            />
                            <small>{program.completionRate}%</small>
                          </td>
                          <td>
                            <Badge bg={getEffectivenessColor(program.effectivenessScore)}>
                              {program.effectivenessScore}
                            </Badge>
                          </td>
                          <td>
                            {formatLastActivity(program.lastWorkout)}
                          </td>
                          <td>
                            <Badge bg={program.isActive ? 'success' : 'secondary'}>
                              {program.isActive ? 'Active' : 'Completed'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>

              {/* Insights */}
              {effectivenessReport.insights && effectivenessReport.insights.length > 0 && (
                <Card className="mb-4">
                  <Card.Header>
                    <h5 className="mb-0">Coaching Insights</h5>
                  </Card.Header>
                  <Card.Body>
                    {effectivenessReport.insights.map((insight, index) => (
                      <Alert 
                        key={index} 
                        variant={
                          insight.type === 'success' ? 'success' :
                          insight.type === 'improvement' ? 'warning' :
                          insight.type === 'attention' ? 'danger' : 'info'
                        }
                        className="mb-2"
                      >
                        <Alert.Heading className="h6">{insight.title}</Alert.Heading>
                        <p className="mb-0">{insight.message}</p>
                      </Alert>
                    ))}
                  </Card.Body>
                </Card>
              )}

              {/* Client Analysis */}
              {effectivenessReport.clientAnalysis && effectivenessReport.clientAnalysis.length > 0 && (
                <Card>
                  <Card.Header>
                    <h5 className="mb-0">Client Engagement Analysis</h5>
                  </Card.Header>
                  <Card.Body>
                    <Table responsive>
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Programs</th>
                          <th>Avg Completion</th>
                          <th>Engagement Score</th>
                          <th>Last Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {effectivenessReport.clientAnalysis.map((client, index) => (
                          <tr key={index}>
                            <td><strong>{client.clientName}</strong></td>
                            <td>
                              {client.completedPrograms}/{client.totalPrograms}
                              <br />
                              <small className="text-muted">completed</small>
                            </td>
                            <td>
                              <ProgressBar 
                                now={client.averageCompletionRate} 
                                variant={getProgressVariant(client.averageCompletionRate)}
                                style={{ height: '20px' }}
                              />
                              <small>{client.averageCompletionRate}%</small>
                            </td>
                            <td>
                              <Badge bg={getEffectivenessColor(client.engagementScore)}>
                                {client.engagementScore}
                              </Badge>
                            </td>
                            <td>
                              {formatLastActivity(client.lastActivity)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card.Body>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export default ProgramMonitoringDashboard