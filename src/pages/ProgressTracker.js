import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Table, Card, Nav, Badge } from 'react-bootstrap';
import { Line, Bar } from 'react-chartjs-2';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import Select from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import '../styles/ProgressTracker.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

function ProgressTracker() {
    const [exercises, setExercises] = useState([]);
    const [selectedExercise, setSelectedExercise] = useState(null);
    const [logs, setLogs] = useState([]);
    const [chartData, setChartData] = useState(null);
    const [volumeChartData, setVolumeChartData] = useState(null);
    const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 3)));
    const [endDate, setEndDate] = useState(new Date());
    const [pr, setPR] = useState(null);
    const [volume, setVolume] = useState(0);
    const [frequency, setFrequency] = useState(0);
    const [summaryStats, setSummaryStats] = useState({});
    const [activeTab, setActiveTab] = useState('progress');
    const [bodyPartFocus, setBodyPartFocus] = useState({});
    const [exerciseProgress, setExerciseProgress] = useState([]);
    const [estimatedOneRepMax, setEstimatedOneRepMax] = useState(0);
    const [restTimeTrends, setRestTimeTrends] = useState(null);
    const [consistencyScore, setConsistencyScore] = useState(0);

    useEffect(() => {
        fetchExercises();
    }, []);

    useEffect(() => {
        if (selectedExercise) {
            fetchLogs();
        }
    }, [selectedExercise, startDate, endDate]);

    const fetchExercises = async () => {
        const exercisesSnapshot = await getDocs(collection(db, "exercises"));
        const fetchedExercises = exercisesSnapshot.docs.map(doc => ({
            value: doc.id,
            label: doc.data().name,
            primaryMuscleGroup: doc.data().primaryMuscleGroup || 'Other'
        }));
        setExercises(fetchedExercises);
        if (fetchedExercises.length > 0) {
            setSelectedExercise(fetchedExercises[0]);
        }
    };

    const fetchLogs = async () => {
        const logsQuery = query(
            collection(db, "workoutLogs"),
            where("userId", "==", auth.currentUser.uid),
            where("date", ">=", startDate),
            where("date", "<=", endDate),
            orderBy("date", "asc") // Changed to ascending to better show progress over time
        );
        const logsSnapshot = await getDocs(logsQuery);
        const fetchedLogs = logsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date.toDate(),
                exercises: data.exercises.filter(ex => ex.exerciseId === selectedExercise.value)
            };
        }).filter(log => log.exercises.length > 0);
        setLogs(fetchedLogs);
        updateChartData(fetchedLogs);
        calculateStats(fetchedLogs);
        analyzeBodyPartFocus(logsSnapshot.docs);
        calculateConsistencyScore(logsSnapshot.docs);
    };

    const updateChartData = (logs) => {
        if (!logs || logs.length === 0) return;

        // Max weight chart
        const weightData = {
            labels: logs.map(log => log.date.toLocaleDateString()),
            datasets: [{
                label: 'Max Weight (lbs)',
                data: logs.map(log => Math.max(...log.exercises[0].weights)),
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }]
        };
        setChartData(weightData);

        // Volume chart
        const volumeData = {
            labels: logs.map(log => log.date.toLocaleDateString()),
            datasets: [{
                label: 'Volume (weight × reps)',
                data: logs.map(log => {
                    const exercise = log.exercises[0];
                    return exercise.weights.reduce((sum, weight, index) => {
                        return sum + weight * exercise.reps[index];
                    }, 0);
                }),
                fill: false,
                borderColor: 'rgb(153, 102, 255)',
                backgroundColor: 'rgba(153, 102, 255, 0.2)',
                tension: 0.1
            }]
        };
        setVolumeChartData(volumeData);

        // Calculate rest time trends if available
        if (logs.some(log => log.exercises[0].restTimes)) {
            const restTimeData = {
                labels: logs.map(log => log.date.toLocaleDateString()),
                datasets: [{
                    label: 'Average Rest Time (sec)',
                    data: logs.map(log => {
                        const restTimes = log.exercises[0].restTimes || [];
                        return restTimes.length ? restTimes.reduce((a, b) => a + b, 0) / restTimes.length : 0;
                    }),
                    fill: false,
                    borderColor: 'rgb(255, 159, 64)',
                    tension: 0.1
                }]
            };
            setRestTimeTrends(restTimeData);
        }

        // Calculate exercise progress trends
        const progressData = [];
        for (let i = 1; i < logs.length; i++) {
            const prevMax = Math.max(...logs[i - 1].exercises[0].weights);
            const currentMax = Math.max(...logs[i].exercises[0].weights);
            const percentChange = ((currentMax - prevMax) / prevMax) * 100;
            progressData.push({
                date: logs[i].date,
                percentChange: percentChange
            });
        }
        setExerciseProgress(progressData);
    };

    const calculateStats = (logs) => {
        if (!logs || logs.length === 0) return;

        let maxWeight = 0;
        let maxWeightDate = null;
        let totalVolume = 0;
        let workoutCount = logs.length;
        let oneRepMaxes = [];

        logs.forEach(log => {
            const exercise = log.exercises[0];
            const maxWeightForLog = Math.max(...exercise.weights);

            if (maxWeightForLog > maxWeight) {
                maxWeight = maxWeightForLog;
                maxWeightDate = log.date;
            }

            // Calculate volume
            const logVolume = exercise.weights.reduce((sum, weight, index) => {
                return sum + weight * exercise.reps[index];
            }, 0);
            totalVolume += logVolume;

            // Estimate 1RM for each set and take the highest
            exercise.weights.forEach((weight, idx) => {
                const reps = exercise.reps[idx];
                if (reps <= 10) { // Brzycki formula is most accurate for reps ≤ 10
                    // Brzycki formula: 1RM = weight × (36 / (37 - reps))
                    const oneRM = weight * (36 / (37 - reps));
                    oneRepMaxes.push(oneRM);
                }
            });
        });

        setPR({ weight: maxWeight, date: maxWeightDate });
        setVolume(totalVolume);
        setFrequency(workoutCount / ((endDate - startDate) / (1000 * 60 * 60 * 24 * 7)));

        // Set estimated 1RM (take the highest calculated value)
        if (oneRepMaxes.length > 0) {
            setEstimatedOneRepMax(Math.max(...oneRepMaxes));
        }

        calculateSummaryStats();
    };

    const calculateSummaryStats = async () => {
        const stats = {};
        const exercisesQuery = query(
            collection(db, "workoutLogs"),
            where("userId", "==", auth.currentUser.uid),
            where("date", ">=", startDate),
            where("date", "<=", endDate),
            orderBy("date", "desc")
        );

        const logsSnapshot = await getDocs(exercisesQuery);
        const allLogs = logsSnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            date: doc.data().date.toDate()
        }));

        // Group exercises by type
        exercises.forEach(exercise => {
            const exerciseLogs = allLogs.filter(log =>
                log.exercises.some(ex => ex.exerciseId === exercise.value)
            );

            if (exerciseLogs.length > 0) {
                // Find logs containing this exercise
                const allWeights = exerciseLogs.flatMap(log => {
                    const ex = log.exercises.find(e => e.exerciseId === exercise.value);
                    return ex ? ex.weights : [];
                });

                const maxWeight = Math.max(...allWeights);

                // Calculate volume trend (is it increasing or decreasing?)
                let volumeTrend = 'stable';
                if (exerciseLogs.length >= 2) {
                    const sortedLogs = [...exerciseLogs].sort((a, b) => a.date - b.date);
                    const firstHalf = sortedLogs.slice(0, Math.floor(sortedLogs.length / 2));
                    const secondHalf = sortedLogs.slice(Math.floor(sortedLogs.length / 2));

                    const firstHalfAvgVolume = firstHalf.reduce((sum, log) => {
                        const ex = log.exercises.find(e => e.exerciseId === exercise.value);
                        const setVolume = ex ? ex.weights.reduce((s, w, i) => s + w * ex.reps[i], 0) : 0;
                        return sum + setVolume;
                    }, 0) / firstHalf.length;

                    const secondHalfAvgVolume = secondHalf.reduce((sum, log) => {
                        const ex = log.exercises.find(e => e.exerciseId === exercise.value);
                        const setVolume = ex ? ex.weights.reduce((s, w, i) => s + w * ex.reps[i], 0) : 0;
                        return sum + setVolume;
                    }, 0) / secondHalf.length;

                    if (secondHalfAvgVolume > firstHalfAvgVolume * 1.05) {
                        volumeTrend = 'increasing';
                    } else if (secondHalfAvgVolume < firstHalfAvgVolume * 0.95) {
                        volumeTrend = 'decreasing';
                    }
                }

                stats[exercise.label] = {
                    maxWeight,
                    frequency: exerciseLogs.length,
                    bodyPart: exercise.primaryMuscleGroup,
                    volumeTrend
                };
            }
        });

        setSummaryStats(stats);
    };

    const analyzeBodyPartFocus = (logs) => {
        const bodyPartCount = {};

        logs.forEach(doc => {
            const log = doc.data();
            log.exercises.forEach(exercise => {
                const exerciseInfo = exercises.find(e => e.value === exercise.exerciseId);
                if (exerciseInfo) {
                    const muscleGroup = exerciseInfo.primaryMuscleGroup || 'Other';
                    bodyPartCount[muscleGroup] = (bodyPartCount[muscleGroup] || 0) + 1;
                }
            });
        });

        setBodyPartFocus(bodyPartCount);
    };

    const calculateConsistencyScore = (logs) => {
        if (!logs || logs.length === 0) return;

        // Get total days in date range
        const daysBetween = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));

        // Get all unique workout dates
        const workoutDates = new Set();
        logs.forEach(doc => {
            const log = doc.data();
            const date = log.date.toDate().toDateString();
            workoutDates.add(date);
        });

        // Calculate weekly workout frequency
        const weeksInRange = daysBetween / 7;
        const workoutsPerWeek = workoutDates.size / weeksInRange;

        // Calculate days between workouts and check for consistency
        const sortedDates = Array.from(workoutDates)
            .map(date => new Date(date))
            .sort((a, b) => a - b);

        let totalGapDays = 0;
        let gapCount = 0;

        for (let i = 1; i < sortedDates.length; i++) {
            const gap = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
            totalGapDays += gap;
            gapCount++;
        }

        // Calculate average gap between workouts
        const avgGap = gapCount > 0 ? totalGapDays / gapCount : 0;

        // Calculate variance in gaps (lower variance = more consistent)
        let variance = 0;
        for (let i = 1; i < sortedDates.length; i++) {
            const gap = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
            variance += Math.pow(gap - avgGap, 2);
        }
        variance = gapCount > 0 ? variance / gapCount : 0;

        // Calculate consistency score (0-100)
        // Higher frequency and lower variance = better score
        const frequencyFactor = Math.min(workoutsPerWeek / 4, 1); // Assumes 4+ workouts/week is ideal
        const varianceFactor = Math.max(0, 1 - (variance / 10)); // Lower variance is better

        const score = Math.round((frequencyFactor * 0.7 + varianceFactor * 0.3) * 100);
        setConsistencyScore(score);
    };

    return (
        <Container className="progress-tracker">
            <h1>Progress Tracker</h1>
            <Row>
                <Col md={6}>
                    <Form.Group>
                        <Form.Label>Exercise</Form.Label>
                        <Select
                            options={exercises}
                            value={selectedExercise}
                            onChange={setSelectedExercise}
                            className="mb-3"
                        />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>Date Range</Form.Label>
                        <div className="d-flex">
                            <DatePicker
                                selected={startDate}
                                onChange={date => setStartDate(date)}
                                selectsStart
                                startDate={startDate}
                                endDate={endDate}
                                className="form-control mr-2"
                            />
                            <DatePicker
                                selected={endDate}
                                onChange={date => setEndDate(date)}
                                selectsEnd
                                startDate={startDate}
                                endDate={endDate}
                                minDate={startDate}
                                className="form-control"
                            />
                        </div>
                    </Form.Group>
                </Col>
                <Col md={6}>
                    <Card className="mb-3">
                        <Card.Body>
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <h3 className="mb-0">Workout Consistency</h3>
                                <Badge bg={consistencyScore > 80 ? "success" : consistencyScore > 60 ? "warning" : "danger"} className="p-2">
                                    {consistencyScore}/100
                                </Badge>
                            </div>
                            <Card.Text>
                                {consistencyScore > 80 ? "Excellent consistency! Keep up the great work." :
                                    consistencyScore > 60 ? "Good consistency. Try to maintain a more regular schedule." :
                                        "Your workout schedule is inconsistent. Try to establish a more regular routine."}
                            </Card.Text>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <Nav variant="tabs" className="mb-3" activeKey={activeTab} onSelect={k => setActiveTab(k)}>
                <Nav.Item>
                    <Nav.Link eventKey="progress">Progress Metrics</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                    <Nav.Link eventKey="volume">Volume Analysis</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                    <Nav.Link eventKey="balance">Training Balance</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                    <Nav.Link eventKey="logs">Exercise Logs</Nav.Link>
                </Nav.Item>
            </Nav>

            {activeTab === 'progress' && (
                <>
                    <Row>
                        <Col>
                            {chartData && (
                                <Card className="mb-4">
                                    <Card.Body>
                                        <Card.Title>Weight Progression</Card.Title>
                                        <Line data={chartData} options={{ responsive: true }} />
                                    </Card.Body>
                                </Card>
                            )}
                        </Col>
                    </Row>
                    <Row>
                        <Col md={3}>
                            <Card>
                                <Card.Body>
                                    <Card.Title>Personal Record</Card.Title>
                                    <Card.Text>
                                        {pr ? `${pr.weight} lbs on ${pr.date.toLocaleDateString()}` : 'N/A'}
                                    </Card.Text>
                                </Card.Body>
                            </Card>
                        </Col>
                        <Col md={3}>
                            <Card>
                                <Card.Body>
                                    <Card.Title>Estimated 1RM</Card.Title>
                                    <Card.Text>{estimatedOneRepMax.toFixed(1)} lbs</Card.Text>
                                </Card.Body>
                            </Card>
                        </Col>
                        <Col md={3}>
                            <Card>
                                <Card.Body>
                                    <Card.Title>Total Volume</Card.Title>
                                    <Card.Text>{volume.toFixed(0)} lbs</Card.Text>
                                </Card.Body>
                            </Card>
                        </Col>
                        <Col md={3}>
                            <Card>
                                <Card.Body>
                                    <Card.Title>Frequency</Card.Title>
                                    <Card.Text>{frequency.toFixed(2)} workouts/week</Card.Text>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>
                    <Row className="mt-4">
                        <Col>
                            <Card>
                                <Card.Body>
                                    <Card.Title>Progressive Overload Analysis</Card.Title>
                                    <Table striped bordered hover>
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Progress Since Previous</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {exerciseProgress.map((progress, index) => (
                                                <tr key={index}>
                                                    <td>{progress.date.toLocaleDateString()}</td>
                                                    <td className={progress.percentChange > 0 ? "text-success" : progress.percentChange < 0 ? "text-danger" : ""}>
                                                        {progress.percentChange > 0 ? "+" : ""}{progress.percentChange.toFixed(1)}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>
                </>
            )}

            {activeTab === 'volume' && (
                <>
                    <Row>
                        <Col>
                            {volumeChartData && (
                                <Card className="mb-4">
                                    <Card.Body>
                                        <Card.Title>Volume Progression</Card.Title>
                                        <Line data={volumeChartData} options={{ responsive: true }} />
                                    </Card.Body>
                                </Card>
                            )}
                        </Col>
                    </Row>
                    <Row>
                        <Col>
                            {restTimeTrends && (
                                <Card>
                                    <Card.Body>
                                        <Card.Title>Rest Time Trends</Card.Title>
                                        <Line data={restTimeTrends} options={{ responsive: true }} />
                                    </Card.Body>
                                </Card>
                            )}
                        </Col>
                    </Row>
                </>
            )}

            {activeTab === 'balance' && (
                <Row>
                    <Col md={6}>
                        <Card>
                            <Card.Body>
                                <Card.Title>Body Part Training Distribution</Card.Title>
                                <div style={{ height: '300px' }}>
                                    {Object.keys(bodyPartFocus).length > 0 && (
                                        <Bar
                                            data={{
                                                labels: Object.keys(bodyPartFocus),
                                                datasets: [{
                                                    label: 'Frequency',
                                                    data: Object.values(bodyPartFocus),
                                                    backgroundColor: [
                                                        'rgba(255, 99, 132, 0.6)',
                                                        'rgba(54, 162, 235, 0.6)',
                                                        'rgba(255, 206, 86, 0.6)',
                                                        'rgba(75, 192, 192, 0.6)',
                                                        'rgba(153, 102, 255, 0.6)',
                                                        'rgba(255, 159, 64, 0.6)',
                                                        'rgba(199, 199, 199, 0.6)'
                                                    ]
                                                }]
                                            }}
                                            options={{
                                                responsive: true,
                                                maintainAspectRatio: false
                                            }}
                                        />
                                    )}
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={6}>
                        <Card>
                            <Card.Body>
                                <Card.Title>Exercise Progress Trends</Card.Title>
                                <Table striped bordered hover>
                                    <thead>
                                        <tr>
                                            <th>Exercise</th>
                                            <th>Max Weight</th>
                                            <th>Volume Trend</th>
                                            <th>Body Part</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(summaryStats).map(([exercise, stats]) => (
                                            <tr key={exercise}>
                                                <td>{exercise}</td>
                                                <td>{stats.maxWeight} lbs</td>
                                                <td>
                                                    <span className={
                                                        stats.volumeTrend === 'increasing' ? 'text-success' :
                                                            stats.volumeTrend === 'decreasing' ? 'text-danger' : ''
                                                    }>
                                                        {stats.volumeTrend === 'increasing' ? '↑' :
                                                            stats.volumeTrend === 'decreasing' ? '↓' : '→'} {stats.volumeTrend}
                                                    </span>
                                                </td>
                                                <td>{stats.bodyPart}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            )}

            {activeTab === 'logs' && (
                <Row>
                    <Col>
                        <h2>Exercise Logs</h2>
                        <Table striped bordered hover>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Sets</th>
                                    <th>Reps</th>
                                    <th>Weights (lbs)</th>
                                    <th>Total Volume</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => {
                                    const exercise = log.exercises[0];
                                    const totalVolume = exercise.weights.reduce((sum, weight, index) => {
                                        return sum + weight * exercise.reps[index];
                                    }, 0);

                                    return (
                                        <tr key={log.id}>
                                            <td>{log.date.toLocaleDateString()}</td>
                                            <td>{exercise.sets}</td>
                                            <td>{exercise.reps.join(', ')}</td>
                                            <td>{exercise.weights.join(', ')}</td>
                                            <td>{totalVolume.toFixed(0)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </Col>
                </Row>
            )}
        </Container>
    );
}

export default ProgressTracker;