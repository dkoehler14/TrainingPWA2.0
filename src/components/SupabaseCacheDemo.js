/**
 * Supabase Cache Demo Component
 * 
 * This component demonstrates the enhanced Supabase caching system
 * with performance monitoring and statistics.
 */

import React, { useState, useEffect } from 'react'
import { Container, Row, Col, Card, Button, Table, Badge, Alert } from 'react-bootstrap'
import {
    supabaseCache,
    getCacheStats,
    getEnhancedCacheStats,
    performCacheCleanup,
    getCacheMemoryStatus,
    clearCache
} from '../api/supabaseCache'

export default function SupabaseCacheDemo() {
    const [stats, setStats] = useState(null)
    const [enhancedStats, setEnhancedStats] = useState(null)
    const [memoryStatus, setMemoryStatus] = useState(null)
    const [isLoading, setIsLoading] = useState(false)

    const refreshStats = () => {
        setStats(getCacheStats())
        setEnhancedStats(getEnhancedCacheStats())
        setMemoryStatus(getCacheMemoryStatus())
    }

    useEffect(() => {
        refreshStats()
        const interval = setInterval(refreshStats, 5000) // Refresh every 5 seconds
        return () => clearInterval(interval)
    }, [])

    const handleCacheCleanup = async () => {
        setIsLoading(true)
        try {
            const result = await performCacheCleanup(0.3)
            console.log('Cache cleanup result:', result)
            refreshStats()
        } catch (error) {
            console.error('Cache cleanup failed:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleClearCache = () => {
        clearCache()
        refreshStats()
    }

    const simulateQueries = async () => {
        setIsLoading(true)
        try {
            // Simulate some cache operations
            const mockQuery = () => Promise.resolve({
                data: [{ id: Math.random(), name: 'Test Data' }],
                error: null
            })

            // Execute several queries to populate cache
            for (let i = 0; i < 5; i++) {
                await supabaseCache.getWithCache(
                    `demo-query-${i}`,
                    mockQuery,
                    { table: 'demo', tags: ['demo', 'test'] }
                )
            }

            // Execute some duplicate queries to show cache hits
            for (let i = 0; i < 3; i++) {
                await supabaseCache.getWithCache(
                    `demo-query-${i}`,
                    mockQuery,
                    { table: 'demo', tags: ['demo', 'test'] }
                )
            }

            refreshStats()
        } catch (error) {
            console.error('Query simulation failed:', error)
        } finally {
            setIsLoading(false)
        }
    }

    if (!stats) {
        return <div>Loading cache statistics...</div>
    }

    return (
        <Container className="mt-4">
            <Row>
                <Col>
                    <h2>🗄️ Supabase Cache System Demo</h2>
                    <p className="text-muted">
                        This demo shows the enhanced caching system for Supabase with performance monitoring,
                        intelligent cleanup, and detailed statistics.
                    </p>
                </Col>
            </Row>

            {/* Memory Status Alert */}
            {memoryStatus && memoryStatus.needed && (
                <Row className="mb-3">
                    <Col>
                        <Alert variant={memoryStatus.critical ? 'danger' : 'warning'}>
                            <strong>Memory Usage Alert:</strong> Cache is using {memoryStatus.currentUsage}
                            (threshold: {memoryStatus.threshold})
                            {memoryStatus.critical && ' - Critical cleanup needed!'}
                        </Alert>
                    </Col>
                </Row>
            )}

            {/* Control Buttons */}
            <Row className="mb-4">
                <Col>
                    <Button
                        variant="primary"
                        onClick={simulateQueries}
                        disabled={isLoading}
                        className="me-2"
                    >
                        {isLoading ? 'Running...' : 'Simulate Queries'}
                    </Button>
                    <Button
                        variant="warning"
                        onClick={handleCacheCleanup}
                        disabled={isLoading}
                        className="me-2"
                    >
                        {isLoading ? 'Cleaning...' : 'Cleanup Cache'}
                    </Button>
                    <Button
                        variant="danger"
                        onClick={handleClearCache}
                        className="me-2"
                    >
                        Clear All Cache
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={refreshStats}
                    >
                        Refresh Stats
                    </Button>
                </Col>
            </Row>

            {/* Basic Statistics */}
            <Row className="mb-4">
                <Col md={6}>
                    <Card>
                        <Card.Header>
                            <h5>📊 Basic Cache Statistics</h5>
                        </Card.Header>
                        <Card.Body>
                            <Table striped size="sm">
                                <tbody>
                                    <tr>
                                        <td>Cache Size</td>
                                        <td><Badge bg="info">{stats.cacheSize}</Badge></td>
                                    </tr>
                                    <tr>
                                        <td>Hit Rate</td>
                                        <td><Badge bg="success">{stats.hitRate}</Badge></td>
                                    </tr>
                                    <tr>
                                        <td>Total Queries</td>
                                        <td><Badge bg="primary">{stats.totalQueries}</Badge></td>
                                    </tr>
                                    <tr>
                                        <td>Cache Hits</td>
                                        <td><Badge bg="success">{stats.hits}</Badge></td>
                                    </tr>
                                    <tr>
                                        <td>Cache Misses</td>
                                        <td><Badge bg="warning">{stats.misses}</Badge></td>
                                    </tr>
                                    <tr>
                                        <td>Memory Usage</td>
                                        <td><Badge bg="info">{stats.memoryUsage}</Badge></td>
                                    </tr>
                                    <tr>
                                        <td>Invalidations</td>
                                        <td><Badge bg="secondary">{stats.invalidations}</Badge></td>
                                    </tr>
                                </tbody>
                            </Table>
                        </Card.Body>
                    </Card>
                </Col>

                <Col md={6}>
                    <Card>
                        <Card.Header>
                            <h5>⚡ Performance Metrics</h5>
                        </Card.Header>
                        <Card.Body>
                            {enhancedStats && (
                                <Table striped size="sm">
                                    <tbody>
                                        <tr>
                                            <td>Database Reads</td>
                                            <td><Badge bg="primary">{enhancedStats.databaseReads.total}</Badge></td>
                                        </tr>
                                        <tr>
                                            <td>Cache Served</td>
                                            <td><Badge bg="success">{enhancedStats.cachePerformance.cacheHits}</Badge></td>
                                        </tr>
                                        <tr>
                                            <td>Read Reduction</td>
                                            <td><Badge bg="success">{enhancedStats.cachePerformance.readReductionRate}</Badge></td>
                                        </tr>
                                        <tr>
                                            <td>Performance Gain</td>
                                            <td><Badge bg="success">{enhancedStats.cachePerformance.performanceImprovement}</Badge></td>
                                        </tr>
                                        <tr>
                                            <td>Avg DB Query Time</td>
                                            <td><Badge bg="info">{enhancedStats.cachePerformance.avgDatabaseQueryTime}</Badge></td>
                                        </tr>
                                        <tr>
                                            <td>Avg Cache Time</td>
                                            <td><Badge bg="info">{enhancedStats.cachePerformance.avgCacheQueryTime}</Badge></td>
                                        </tr>
                                        <tr>
                                            <td>Session Duration</td>
                                            <td><Badge bg="secondary">{enhancedStats.session.duration}</Badge></td>
                                        </tr>
                                    </tbody>
                                </Table>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* Cost Analysis */}
            {enhancedStats && (
                <Row className="mb-4">
                    <Col>
                        <Card>
                            <Card.Header>
                                <h5>💰 Cost Analysis</h5>
                            </Card.Header>
                            <Card.Body>
                                <Row>
                                    <Col md={3}>
                                        <div className="text-center">
                                            <h6>Estimated Cost</h6>
                                            <Badge bg="warning" className="fs-6">
                                                {enhancedStats.costAnalysis.estimatedCost}
                                            </Badge>
                                        </div>
                                    </Col>
                                    <Col md={3}>
                                        <div className="text-center">
                                            <h6>Estimated Savings</h6>
                                            <Badge bg="success" className="fs-6">
                                                {enhancedStats.costAnalysis.estimatedSavings}
                                            </Badge>
                                        </div>
                                    </Col>
                                    <Col md={3}>
                                        <div className="text-center">
                                            <h6>Monthly Cost</h6>
                                            <Badge bg="info" className="fs-6">
                                                {enhancedStats.costAnalysis.projectedMonthlyCost}
                                            </Badge>
                                        </div>
                                    </Col>
                                    <Col md={3}>
                                        <div className="text-center">
                                            <h6>Monthly Savings</h6>
                                            <Badge bg="success" className="fs-6">
                                                {enhancedStats.costAnalysis.projectedMonthlySavings}
                                            </Badge>
                                        </div>
                                    </Col>
                                </Row>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            )}

            {/* Bandwidth Tracking */}
            {enhancedStats && (
                <Row className="mb-4">
                    <Col>
                        <Card>
                            <Card.Header>
                                <h5>📡 Bandwidth Tracking</h5>
                            </Card.Header>
                            <Card.Body>
                                <Row>
                                    <Col md={4}>
                                        <div className="text-center">
                                            <h6>Database Bandwidth</h6>
                                            <Badge bg="primary" className="fs-6">
                                                {enhancedStats.bandwidth.databaseBandwidth}
                                            </Badge>
                                        </div>
                                    </Col>
                                    <Col md={4}>
                                        <div className="text-center">
                                            <h6>Bandwidth Saved</h6>
                                            <Badge bg="success" className="fs-6">
                                                {enhancedStats.bandwidth.totalBandwidthSaved}
                                            </Badge>
                                        </div>
                                    </Col>
                                    <Col md={4}>
                                        <div className="text-center">
                                            <h6>Reduction Rate</h6>
                                            <Badge bg="success" className="fs-6">
                                                {enhancedStats.bandwidth.bandwidthReductionRate}
                                            </Badge>
                                        </div>
                                    </Col>
                                </Row>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            )}

            {/* Top Tables */}
            {enhancedStats && enhancedStats.recentActivity.topTables.length > 0 && (
                <Row>
                    <Col>
                        <Card>
                            <Card.Header>
                                <h5>🔥 Most Active Tables</h5>
                            </Card.Header>
                            <Card.Body>
                                <Table striped size="sm">
                                    <thead>
                                        <tr>
                                            <th>Table</th>
                                            <th>Reads</th>
                                            <th>Avg Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {enhancedStats.recentActivity.topTables.map((table, index) => (
                                            <tr key={index}>
                                                <td>{table.table}</td>
                                                <td><Badge bg="primary">{table.reads}</Badge></td>
                                                <td><Badge bg="info">{table.avgTime}</Badge></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            )}
        </Container>
    )
}