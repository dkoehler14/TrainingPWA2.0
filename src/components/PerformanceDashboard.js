/**
 * Performance Dashboard Component
 * 
 * Provides a comprehensive view of application performance including:
 * - Real-time performance metrics
 * - Database query performance
 * - Cache hit rates and statistics
 * - Performance alerts and recommendations
 * - Historical performance trends
 */

import React, { useState, useEffect, useCallback } from 'react'
import { performanceMonitor, getPerformanceDashboard } from '../utils/performanceMonitor'
import { optimizedSupabase } from '../utils/optimizedSupabaseClient'
import '../styles/PerformanceDashboard.css'

const PerformanceDashboard = ({ isVisible = false, onClose }) => {
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(30) // seconds
  const [alerts, setAlerts] = useState([])

  // Refresh dashboard data
  const refreshData = useCallback(async () => {
    try {
      setLoading(true)
      const data = getPerformanceDashboard()
      const stats = optimizedSupabase.getStats()
      
      setDashboardData({
        ...data,
        clientStats: stats
      })
      
      // Update alerts
      setAlerts(data.alerts.recent.filter(alert => !alert.acknowledged))
    } catch (error) {
      console.error('Failed to refresh performance dashboard:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-refresh effect
  useEffect(() => {
    if (!isVisible) return

    refreshData()

    if (autoRefresh) {
      const interval = setInterval(refreshData, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
  }, [isVisible, autoRefresh, refreshInterval, refreshData])

  // Alert callback
  useEffect(() => {
    const handleAlert = (alert) => {
      setAlerts(prev => [alert, ...prev.slice(0, 9)]) // Keep last 10 alerts
    }

    performanceMonitor.onAlert(handleAlert)
  }, [])

  const acknowledgeAlert = (alertId) => {
    performanceMonitor.acknowledgeAlert(alertId)
    setAlerts(prev => prev.filter(alert => alert.id !== alertId))
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const getPerformanceColor = (value, thresholds) => {
    if (value <= thresholds.good) return 'performance-good'
    if (value <= thresholds.warning) return 'performance-warning'
    return 'performance-critical'
  }

  const renderOverviewTab = () => {
    if (!dashboardData) return null

    const { overview, realtime, database, cache } = dashboardData

    return (
      <div className="performance-overview">
        <div className="metrics-grid">
          <div className="metric-card">
            <h3>Application Uptime</h3>
            <div className="metric-value">{overview.appUptime}</div>
          </div>
          
          <div className="metric-card">
            <h3>Database Operations</h3>
            <div className="metric-value">{overview.totalDatabaseOperations.toLocaleString()}</div>
            <div className="metric-subtitle">Avg: {overview.averageDatabaseTime}</div>
          </div>
          
          <div className="metric-card">
            <h3>Cache Hit Rate</h3>
            <div className={`metric-value ${getPerformanceColor(parseFloat(overview.cacheHitRate), { good: 80, warning: 60 })}`}>
              {overview.cacheHitRate}
            </div>
          </div>
          
          <div className="metric-card">
            <h3>Active Alerts</h3>
            <div className={`metric-value ${overview.activeAlerts > 0 ? 'performance-critical' : 'performance-good'}`}>
              {overview.activeAlerts}
            </div>
          </div>
        </div>

        <div className="realtime-metrics">
          <h3>Real-time Metrics (Last 5 minutes)</h3>
          <div className="realtime-grid">
            <div className="realtime-metric">
              <span className="metric-label">Queries/min:</span>
              <span className="metric-value">{realtime.queriesPerMinute}</span>
            </div>
            <div className="realtime-metric">
              <span className="metric-label">Cache Hits/min:</span>
              <span className="metric-value">{realtime.cacheHitsPerMinute}</span>
            </div>
            <div className="realtime-metric">
              <span className="metric-label">Errors/min:</span>
              <span className="metric-value">{realtime.errorsPerMinute}</span>
            </div>
            <div className="realtime-metric">
              <span className="metric-label">Avg Response:</span>
              <span className="metric-value">{realtime.averageResponseTime}ms</span>
            </div>
          </div>
        </div>

        {alerts.length > 0 && (
          <div className="alerts-section">
            <h3>Active Alerts</h3>
            <div className="alerts-list">
              {alerts.slice(0, 5).map(alert => (
                <div key={alert.id} className={`alert alert-${alert.severity}`}>
                  <div className="alert-content">
                    <div className="alert-message">{alert.message}</div>
                    <div className="alert-time">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <button 
                    className="alert-acknowledge"
                    onClick={() => acknowledgeAlert(alert.id)}
                  >
                    ✓
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderDatabaseTab = () => {
    if (!dashboardData) return null

    const { database } = dashboardData

    return (
      <div className="performance-database">
        <div className="database-overview">
          <h3>Database Performance</h3>
          <div className="database-stats">
            <div className="stat-item">
              <span className="stat-label">Slow Operations:</span>
              <span className="stat-value">{database.slowOperations}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Connection Pool:</span>
              <span className="stat-value">
                {database.connectionPool.activeConnections}/{database.connectionPool.maxConnections}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Error Rate:</span>
              <span className="stat-value">{database.connectionPool.errorRate}</span>
            </div>
          </div>
        </div>

        <div className="operations-by-table">
          <h4>Operations by Table</h4>
          <div className="table-stats">
            {Object.entries(database.queryPerformance || {}).map(([table, stats]) => (
              <div key={table} className="table-stat">
                <div className="table-name">{table}</div>
                <div className="table-metrics">
                  <span>Queries: {stats.queryCount}</span>
                  <span>Avg: {stats.averageTime}ms</span>
                  <span>Max: {stats.maxTime}ms</span>
                  <span className={stats.slowQueries > 0 ? 'performance-warning' : ''}>
                    Slow: {stats.slowQueries}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderCacheTab = () => {
    if (!dashboardData) return null

    const { cache } = dashboardData

    return (
      <div className="performance-cache">
        <div className="cache-overview">
          <h3>Cache Performance</h3>
          <div className="cache-stats">
            <div className="stat-item">
              <span className="stat-label">Hit Rate:</span>
              <span className={`stat-value ${getPerformanceColor(cache.hitRate, { good: 80, warning: 60 })}`}>
                {cache.hitRate.toFixed(1)}%
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Miss Rate:</span>
              <span className="stat-value">{cache.missRate.toFixed(1)}%</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Operations:</span>
              <span className="stat-value">{cache.operations.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {cache.detailed && (
          <div className="cache-detailed">
            <h4>Detailed Cache Statistics</h4>
            <div className="cache-details">
              <div className="detail-section">
                <h5>Database Reads</h5>
                <p>Total: {cache.detailed.databaseReads?.total || 0}</p>
                <p>This Session: {cache.detailed.databaseReads?.thisSession || 0}</p>
              </div>
              
              <div className="detail-section">
                <h5>Performance</h5>
                <p>Improvement: {cache.detailed.cachePerformance?.performanceImprovement || '0%'}</p>
                <p>DB Avg: {cache.detailed.cachePerformance?.avgDatabaseQueryTime || '0ms'}</p>
                <p>Cache Avg: {cache.detailed.cachePerformance?.avgCacheQueryTime || '0ms'}</p>
              </div>
              
              <div className="detail-section">
                <h5>Cost Analysis</h5>
                <p>Estimated Cost: ${cache.detailed.costAnalysis?.estimatedCost || '0.0000'}</p>
                <p>Estimated Savings: ${cache.detailed.costAnalysis?.estimatedSavings || '0.0000'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderTrendsTab = () => {
    if (!dashboardData || !dashboardData.trends) return null

    const { trends } = dashboardData

    return (
      <div className="performance-trends">
        <h3>Performance Trends (Last Hour)</h3>
        <div className="trends-chart">
          {trends.map((interval, index) => (
            <div key={interval.timestamp} className="trend-interval">
              <div className="interval-time">
                {new Date(interval.timestamp).toLocaleTimeString()}
              </div>
              <div className="interval-metrics">
                <div className="trend-metric">
                  <span className="trend-label">DB Ops:</span>
                  <span className="trend-value">{interval.databaseOps}</span>
                </div>
                <div className="trend-metric">
                  <span className="trend-label">Cache Hits:</span>
                  <span className="trend-value">{interval.cacheHits}</span>
                </div>
                <div className="trend-metric">
                  <span className="trend-label">Errors:</span>
                  <span className="trend-value">{interval.errors}</span>
                </div>
                <div className="trend-metric">
                  <span className="trend-label">Avg Time:</span>
                  <span className="trend-value">{interval.avgResponseTime.toFixed(0)}ms</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderRecommendationsTab = () => {
    if (!dashboardData || !dashboardData.recommendations) return null

    const { recommendations } = dashboardData

    return (
      <div className="performance-recommendations">
        <h3>Performance Recommendations</h3>
        {recommendations.length === 0 ? (
          <div className="no-recommendations">
            <p>✅ No performance issues detected. Your application is running optimally!</p>
          </div>
        ) : (
          <div className="recommendations-list">
            {recommendations.map((rec, index) => (
              <div key={index} className={`recommendation recommendation-${rec.priority}`}>
                <div className="recommendation-header">
                  <h4>{rec.title}</h4>
                  <span className={`priority priority-${rec.priority}`}>{rec.priority}</span>
                </div>
                <p className="recommendation-description">{rec.description}</p>
                <div className="recommendation-action">
                  <strong>Action:</strong> {rec.action}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!isVisible) return null

  return (
    <div className="performance-dashboard-overlay">
      <div className="performance-dashboard">
        <div className="dashboard-header">
          <h2>Performance Dashboard</h2>
          <div className="dashboard-controls">
            <label className="auto-refresh-control">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="refresh-interval"
              >
                <option value={10}>10s</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
                <option value={300}>5m</option>
              </select>
            )}
            <button onClick={refreshData} className="refresh-button" disabled={loading}>
              {loading ? '⟳' : '↻'} Refresh
            </button>
            <button onClick={onClose} className="close-button">✕</button>
          </div>
        </div>

        <div className="dashboard-tabs">
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab ${activeTab === 'database' ? 'active' : ''}`}
            onClick={() => setActiveTab('database')}
          >
            Database
          </button>
          <button
            className={`tab ${activeTab === 'cache' ? 'active' : ''}`}
            onClick={() => setActiveTab('cache')}
          >
            Cache
          </button>
          <button
            className={`tab ${activeTab === 'trends' ? 'active' : ''}`}
            onClick={() => setActiveTab('trends')}
          >
            Trends
          </button>
          <button
            className={`tab ${activeTab === 'recommendations' ? 'active' : ''}`}
            onClick={() => setActiveTab('recommendations')}
          >
            Recommendations
          </button>
        </div>

        <div className="dashboard-content">
          {loading && <div className="loading-indicator">Loading performance data...</div>}
          
          {!loading && (
            <>
              {activeTab === 'overview' && renderOverviewTab()}
              {activeTab === 'database' && renderDatabaseTab()}
              {activeTab === 'cache' && renderCacheTab()}
              {activeTab === 'trends' && renderTrendsTab()}
              {activeTab === 'recommendations' && renderRecommendationsTab()}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PerformanceDashboard