// Cache Demo Component - Shows enhanced caching features and migration example
import React, { useState, useEffect, useContext } from 'react';
import { Card, Button, Badge, Table, Alert, Tabs, Tab } from 'react-bootstrap';
import { AuthContext } from '../context/AuthContext';
import {
  getCacheStats,
  getEnhancedCacheStats,
  debugCache,
  invalidateUserCache,
  invalidateWorkoutCache,
  invalidateProgramCache,
  invalidateExerciseCache,
  warmUserCache,
} from '../api/supabaseCache';
import cacheWarmingService from '../services/supabaseCacheWarmingService';

const CacheDemo = () => {
  const { user, isAuthenticated } = useContext(AuthContext);
  const [cacheStats, setCacheStats] = useState(null);
  const [enhancedStats, setEnhancedStats] = useState(null);
  const [warmingStats, setWarmingStats] = useState(null);
  const [debugData, setDebugData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('reads');

  // Refresh cache statistics
  const refreshStats = () => {
    setCacheStats(getCacheStats());
    setEnhancedStats(getEnhancedCacheStats());
    setWarmingStats(cacheWarmingService.getWarmingStats());
  };

  // Load debug data
  const loadDebugData = () => {
    const data = debugCache();
    setDebugData(data.slice(0, 10)); // Show top 10 entries
  };

  useEffect(() => {
    refreshStats();
    loadDebugData();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      refreshStats();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Cache warming demonstrations
  const handleWarmUserCache = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await warmUserCache(user.id, 'high');
      refreshStats();
    } catch (error) {
      console.error('Cache warming failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSmartWarmCache = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await cacheWarmingService.smartWarmCache(user.id, {
        lastVisitedPage: 'demo',
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay()
      });
      refreshStats();
    } catch (error) {
      console.error('Smart cache warming failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProgressiveWarmCache = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      await cacheWarmingService.progressiveWarmCache(user.id);
      refreshStats();
    } catch (error) {
      console.error('Progressive cache warming failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Cache invalidation demonstrations
  const handleInvalidateUserCache = () => {
    if (!user) return;
    invalidateUserCache(user.id);
    refreshStats();
  };

  const handleInvalidateWorkoutCache = () => {
    if (!user) return;
    invalidateWorkoutCache(user.id);
    refreshStats();
  };

  const handleInvalidateProgramCache = () => {
    if (!user) return;
    invalidateProgramCache(user.id);
    refreshStats();
  };

  const handleInvalidateExerciseCache = () => {
    invalidateExerciseCache();
    refreshStats();
  };

  const renderDatabaseReads = () => (
    <div>
      <Card className="mb-3">
        <Card.Header>
          <h5>🗄️ Database Read Tracking</h5>
        </Card.Header>
        <Card.Body>
          {enhancedStats ? (
            <div className="row">
              <div className="col-md-4">
                <Table striped bordered hover size="sm">
                  <tbody>
                    <tr>
                      <td><strong>Total Database Reads</strong></td>
                      <td className="text-danger">{enhancedStats.databaseReads.total}</td>
                    </tr>
                    <tr>
                      <td><strong>Cache Hits</strong></td>
                      <td className="text-success">{enhancedStats.cachePerformance.cacheHits}</td>
                    </tr>
                    <tr>
                      <td><strong>Read Reduction Rate</strong></td>
                      <td>
                        <Badge bg={parseFloat(enhancedStats.cachePerformance.readReductionRate) > 50 ? 'success' : 'warning'}>
                          {enhancedStats.cachePerformance.readReductionRate}
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Performance Improvement</strong></td>
                      <td>
                        <Badge bg={parseFloat(enhancedStats.cachePerformance.performanceImprovement) > 0 ? 'success' : 'secondary'}>
                          {enhancedStats.cachePerformance.performanceImprovement}
                        </Badge>
                      </td>
                    </tr>
                  </tbody>
                </Table>
              </div>
              <div className="col-md-4">
                <Table striped bordered hover size="sm">
                  <tbody>
                    <tr>
                      <td><strong>Estimated Cost</strong></td>
                      <td className="text-danger">{enhancedStats.costAnalysis.estimatedCost}</td>
                    </tr>
                    <tr>
                      <td><strong>Estimated Savings</strong></td>
                      <td className="text-success">{enhancedStats.costAnalysis.estimatedSavings}</td>
                    </tr>
                    <tr>
                      <td><strong>Monthly Cost Projection</strong></td>
                      <td className="text-warning">{enhancedStats.costAnalysis.projectedMonthlyCost}</td>
                    </tr>
                    <tr>
                      <td><strong>Monthly Savings Projection</strong></td>
                      <td className="text-success">{enhancedStats.costAnalysis.projectedMonthlySavings}</td>
                    </tr>
                  </tbody>
                </Table>
              </div>
              <div className="col-md-4">
                <Table striped bordered hover size="sm">
                  <tbody>
                    <tr>
                      <td><strong>Database Bandwidth</strong></td>
                      <td className="text-danger">{enhancedStats.bandwidth.databaseBandwidth}</td>
                    </tr>
                    <tr>
                      <td><strong>Bandwidth Saved</strong></td>
                      <td className="text-success">{enhancedStats.bandwidth.totalBandwidthSaved}</td>
                    </tr>
                    <tr>
                      <td><strong>Bandwidth Reduction</strong></td>
                      <td>
                        <Badge bg={parseFloat(enhancedStats.bandwidth.bandwidthReductionRate) > 30 ? 'success' : 'warning'}>
                          {enhancedStats.bandwidth.bandwidthReductionRate}
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Avg DB Query Time</strong></td>
                      <td>{enhancedStats.cachePerformance.avgDatabaseQueryTime}</td>
                    </tr>
                  </tbody>
                </Table>
              </div>
            </div>
          ) : (
            <Alert variant="info">Loading database read statistics...</Alert>
          )}
          
          {enhancedStats && (!enhancedStats.recentActivity || !enhancedStats.recentActivity.topCollections) && (
            <Alert variant="info">
              <strong>Simplified Mode Active:</strong> Some detailed statistics are disabled for better performance. 
              The cache system is still working but with reduced complexity.
            </Alert>
          )}
        </Card.Body>
      </Card>

      {enhancedStats && enhancedStats.recentActivity && enhancedStats.recentActivity.topTables && enhancedStats.recentActivity.topTables.length > 0 && (
        <Card className="mb-3">
          <Card.Header>
            <h5>📈 Top Tables by Reads</h5>
          </Card.Header>
          <Card.Body>
            <Table striped bordered hover size="sm">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Database Reads</th>
                  <th>Average Query Time</th>
                </tr>
              </thead>
              <tbody>
                {enhancedStats.recentActivity.topTables.map((tableData, index) => (
                  <tr key={index}>
                    <td><Badge bg="info">{tableData.table}</Badge></td>
                    <td className="text-danger">{tableData.reads}</td>
                    <td>{tableData.avgTime}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {enhancedStats && enhancedStats.recentActivity && enhancedStats.recentActivity.queryHistory && enhancedStats.recentActivity.queryHistory.length > 0 && (
        <Card className="mb-3">
          <Card.Header>
            <h5>📋 Recent Query Activity</h5>
          </Card.Header>
          <Card.Body>
            <Table striped bordered hover size="sm">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Table</th>
                  <th>Query Time</th>
                  <th>Data Size</th>
                </tr>
              </thead>
              <tbody>
                {enhancedStats.recentActivity.queryHistory.map((query, index) => (
                  <tr key={index}>
                    <td>{new Date(query.timestamp).toLocaleTimeString()}</td>
                    <td>
                      <Badge bg={query.type === 'database-read' ? 'danger' : 'success'}>
                        {query.type === 'database-read' ? '🗄️ DB Read' : '⚡ Cache Hit'}
                      </Badge>
                    </td>
                    <td>{query.table}</td>
                    <td>{query.queryTime?.toFixed(2)}ms</td>
                    <td>{query.dataSize ? (query.dataSize / 1024).toFixed(2) + ' KB' : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}
    </div>
  );

  const renderCacheStats = () => (
    <Card className="mb-3">
      <Card.Header>
        <h5>📊 Cache Statistics</h5>
      </Card.Header>
      <Card.Body>
        {cacheStats ? (
          <div className="row">
            <div className="col-md-6">
              <Table striped bordered hover size="sm">
                <tbody>
                  <tr>
                    <td><strong>Hit Rate</strong></td>
                    <td>
                      <Badge bg={parseFloat(cacheStats.hitRate) > 70 ? 'success' : 'warning'}>
                        {cacheStats.hitRate}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Total Queries</strong></td>
                    <td>{cacheStats.totalQueries}</td>
                  </tr>
                  <tr>
                    <td><strong>Cache Hits</strong></td>
                    <td className="text-success">{cacheStats.hits}</td>
                  </tr>
                  <tr>
                    <td><strong>Cache Misses</strong></td>
                    <td className="text-warning">{cacheStats.misses}</td>
                  </tr>
                  <tr>
                    <td><strong>Invalidations</strong></td>
                    <td className="text-info">{cacheStats.invalidations}</td>
                  </tr>
                </tbody>
              </Table>
            </div>
            <div className="col-md-6">
              <Table striped bordered hover size="sm">
                <tbody>
                  <tr>
                    <td><strong>Cache Size</strong></td>
                    <td>{cacheStats.cacheSize} entries</td>
                  </tr>
                  <tr>
                    <td><strong>Memory Usage</strong></td>
                    <td>{cacheStats.memoryUsage}</td>
                  </tr>
                  <tr>
                    <td><strong>Avg Query Time</strong></td>
                    <td>{cacheStats.averageQueryTime.toFixed(2)}ms</td>
                  </tr>
                </tbody>
              </Table>
            </div>
          </div>
        ) : (
          <Alert variant="info">Loading cache statistics...</Alert>
        )}
      </Card.Body>
    </Card>
  );

  const renderWarmingStats = () => (
    <Card className="mb-3">
      <Card.Header>
        <h5>🔥 Cache Warming Statistics</h5>
      </Card.Header>
      <Card.Body>
        {warmingStats ? (
          <div className="row">
            <div className="col-md-6">
              <Table striped bordered hover size="sm">
                <tbody>
                  <tr>
                    <td><strong>Success Rate</strong></td>
                    <td>
                      <Badge bg={parseFloat(warmingStats.successRate) > 80 ? 'success' : 'warning'}>
                        {warmingStats.successRate}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Total Events</strong></td>
                    <td>{warmingStats.totalEvents}</td>
                  </tr>
                  <tr>
                    <td><strong>Successful</strong></td>
                    <td className="text-success">{warmingStats.successfulEvents}</td>
                  </tr>
                  <tr>
                    <td><strong>Failed</strong></td>
                    <td className="text-danger">{warmingStats.failedEvents}</td>
                  </tr>
                </tbody>
              </Table>
            </div>
            <div className="col-md-6">
              <Table striped bordered hover size="sm">
                <tbody>
                  <tr>
                    <td><strong>Average Duration</strong></td>
                    <td>{warmingStats.averageDuration}</td>
                  </tr>
                  <tr>
                    <td><strong>Currently Warming</strong></td>
                    <td>
                      <Badge bg={warmingStats.currentlyWarming ? 'primary' : 'secondary'}>
                        {warmingStats.currentlyWarming ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Queue Size</strong></td>
                    <td>{warmingStats.queueSize}</td>
                  </tr>
                </tbody>
              </Table>
            </div>
          </div>
        ) : (
          <Alert variant="info">Loading warming statistics...</Alert>
        )}
      </Card.Body>
    </Card>
  );

  const renderDebugData = () => (
    <Card className="mb-3">
      <Card.Header>
        <h5>🔍 Cache Debug Data (Top 10 Entries)</h5>
        <Button variant="outline-secondary" size="sm" onClick={loadDebugData}>
          Refresh
        </Button>
      </Card.Header>
      <Card.Body>
        {debugData.length > 0 ? (
          <Table striped bordered hover size="sm">
            <thead>
              <tr>
                <th>Collection</th>
                <th>Type</th>
                <th>Access Count</th>
                <th>Size</th>
                <th>Age</th>
                <th>TTL</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {debugData.map((entry, index) => (
                <tr key={index}>
                  <td>{entry.key.path}</td>
                  <td>
                    <Badge bg="info" className="text-uppercase">
                      {entry.key.type}
                    </Badge>
                  </td>
                  <td>{entry.accessCount}</td>
                  <td>{(entry.size / 1024).toFixed(2)} KB</td>
                  <td>{Math.round(entry.age / 1000)}s</td>
                  <td>{Math.round(entry.ttl / 1000)}s</td>
                  <td>
                    <Badge bg={entry.expired ? 'danger' : 'success'}>
                      {entry.expired ? 'Expired' : 'Valid'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Alert variant="info">No cache entries found</Alert>
        )}
      </Card.Body>
    </Card>
  );

  const renderControls = () => (
    <Card className="mb-3">
      <Card.Header>
        <h5>🎛️ Cache Controls</h5>
      </Card.Header>
      <Card.Body>
        <div className="row">
          <div className="col-md-6">
            <h6>Cache Warming</h6>
            <div className="d-grid gap-2">
              <Button 
                variant="primary" 
                onClick={handleWarmUserCache}
                disabled={loading || !user}
              >
                🔥 Warm User Cache
              </Button>
              <Button 
                variant="info" 
                onClick={handleSmartWarmCache}
                disabled={loading || !user}
              >
                🧠 Smart Warm Cache
              </Button>
              <Button 
                variant="success" 
                onClick={handleProgressiveWarmCache}
                disabled={loading || !user}
              >
                📈 Progressive Warm Cache
              </Button>
            </div>
          </div>
          <div className="col-md-6">
            <h6>Cache Invalidation</h6>
            <div className="d-grid gap-2">
              <Button 
                variant="warning" 
                onClick={handleInvalidateUserCache}
                disabled={!user}
              >
                🗑️ Invalidate User Cache
              </Button>
              <Button 
                variant="outline-warning" 
                onClick={handleInvalidateWorkoutCache}
                disabled={!user}
              >
                🏋️ Invalidate Workout Cache
              </Button>
              <Button 
                variant="outline-warning" 
                onClick={handleInvalidateProgramCache}
                disabled={!user}
              >
                📋 Invalidate Program Cache
              </Button>
              <Button 
                variant="outline-warning" 
                onClick={handleInvalidateExerciseCache}
              >
                💪 Invalidate Exercise Cache
              </Button>
            </div>
          </div>
        </div>
      </Card.Body>
    </Card>
  );

  const renderMigrationGuide = () => (
    <Card className="mb-3">
      <Card.Header>
        <h5>🔄 Migration Guide</h5>
      </Card.Header>
      <Card.Body>
        <Alert variant="info">
          <h6>Enhanced Cache Features:</h6>
          <ul>
            <li><strong>Granular Invalidation:</strong> Target specific cache entries instead of broad invalidation</li>
            <li><strong>Cache Warming:</strong> Proactively load data for better performance</li>
            <li><strong>Performance Monitoring:</strong> Track cache hit rates and query performance</li>
            <li><strong>Smart Caching:</strong> Context-aware cache warming based on user behavior</li>
            <li><strong>Memory Management:</strong> Automatic cleanup and size monitoring</li>
          </ul>
        </Alert>
        
        <Alert variant="info">
          <h6>Current Implementation:</h6>
          <ul>
            <li><strong>Supabase Cache:</strong> Using <code>../api/supabaseCache</code> for all cache operations</li>
            <li><strong>Smart Invalidation:</strong> Context-aware cache invalidation with <code>invalidateWorkoutCache(userId)</code></li>
            <li><strong>Automatic Warming:</strong> Background cache warming integrated with user behavior</li>
            <li><strong>Real-time Monitoring:</strong> Live performance tracking with <code>getCacheStats()</code></li>
          </ul>
        </Alert>
      </Card.Body>
    </Card>
  );

  if (!user) {
    return (
      <Alert variant="warning">
        Please log in to view cache demo features.
      </Alert>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <h2>🚀 Enhanced Cache System Demo</h2>
          <p className="text-muted">
            Demonstration of the enhanced Supabase caching system with granular invalidation, 
            cache warming, and performance monitoring.
          </p>
          
          <Tabs activeKey={activeTab} onSelect={setActiveTab} className="mb-3">
            <Tab eventKey="reads" title="🗄️ Database Reads">
              {renderDatabaseReads()}
            </Tab>
            
            <Tab eventKey="stats" title="📊 Statistics">
              {renderCacheStats()}
              {renderWarmingStats()}
            </Tab>
            
            <Tab eventKey="debug" title="🔍 Debug">
              {renderDebugData()}
            </Tab>
            
            <Tab eventKey="controls" title="🎛️ Controls">
              {renderControls()}
            </Tab>
            
            <Tab eventKey="migration" title="🔄 Migration">
              {renderMigrationGuide()}
            </Tab>
          </Tabs>
          
          {loading && (
            <Alert variant="info">
              <div className="d-flex align-items-center">
                <div className="spinner-border spinner-border-sm me-2" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                Processing cache operation...
              </div>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
};

export default CacheDemo;