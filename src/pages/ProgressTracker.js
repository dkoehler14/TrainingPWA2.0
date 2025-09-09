import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Container, Row, Col, Form, Table, Card, Nav, Badge, Spinner, Button, Alert } from 'react-bootstrap';
import { Broadcast } from 'react-bootstrap-icons';
import { useNavigate } from'react-router-dom';
import { Line, Bar } from 'react-chartjs-2';
import { useAuth } from '../hooks/useAuth';
import useRealtimeProgress, { useRealtimePRNotifications } from '../hooks/useRealtimeProgress';
import Select from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import '../styles/ProgressTracker.css';
import { supabase } from '../config/supabase';
import workoutLogService from '../services/workoutLogService';
import { getExercises } from '../services/exerciseService';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

function ProgressTracker() {
	const { user, isAuthenticated } = useAuth();
	const [exercises, setExercises] = useState([]);
	const [selectedExercise, setSelectedExercise] = useState(null);
	const [logs, setLogs] = useState([]);
	const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 3)));
	const [endDate, setEndDate] = useState(new Date());
	const [activeTab, setActiveTab] = useState('progress');

	// Loading states
	const [isLoading, setIsLoading] = useState(false);
	const [isExercisesLoading, setIsExercisesLoading] = useState(false);
	const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

	// Temporary
	const navigate = useNavigate();

	// Real-time progress tracking with PR notifications
	const {
		analytics: realtimeAnalytics,
		exerciseHistory: realtimeHistory,
		isConnected: isRealtimeConnected,
		lastUpdate,
		setAnalytics,
		setExerciseHistory
	} = useRealtimeProgress({
		enabled: true,
		exerciseId: selectedExercise?.value,
		onAnalyticsUpdate: (update) => {
			console.log('📈 Analytics updated in real-time:', update);
			// Refresh metrics when analytics are updated
			if (selectedExercise && update.data.exercise_id === selectedExercise.value) {
				fetchLogs(); // Refresh the current exercise data
			}
		},
		onHistoryUpdate: (update) => {
			console.log('🏋️ Exercise history updated in real-time:', update);
			// Update logs if it affects the current exercise
			if (selectedExercise && update.data.exercise_id === selectedExercise.value) {
				fetchLogs(); // Refresh the current exercise data
			}
		}
	});

	// PR notifications with enhanced display
	const {
		prNotifications,
		clearPRNotifications
	} = useRealtimePRNotifications({
		enabled: true,
		showNotifications: true,
		onPR: (prUpdate) => {
			console.log('🎉 New PR achieved!', prUpdate);
			// Could show a toast notification here
		}
	});

	// Combined metrics state to reduce re-renders
	const [metrics, setMetrics] = useState({
		pr: null,
		volume: 0,
		frequency: 0,
		estimatedOneRepMax: 0,
		exerciseProgress: [],
		consistencyScore: 0
	});

	useEffect(() => {
		fetchExercises();
	}, []);

	useEffect(() => {
		if (selectedExercise) {
			fetchLogs();
		}
	}, [selectedExercise, startDate, endDate]);

	const fetchExercises = useCallback(async () => {
		setIsExercisesLoading(true);
		try {
			// Fetch exercises using Supabase
			const exercisesData = await getExercises();
			
			const fetchedExercises = exercisesData.map(ex => ({
				value: ex.id,
				label: ex.name,
				primaryMuscleGroup: ex.primary_muscle_group || 'Other',
				exerciseType: ex.exercise_type || 'Unknown'
			}));
			setExercises(fetchedExercises);
			if (fetchedExercises.length > 0 && !selectedExercise) {
				setSelectedExercise(fetchedExercises[0]);
			}
		} catch (error) {
			console.error("Error fetching exercises:", error);
		} finally {
			setIsExercisesLoading(false);
		}
	}, [selectedExercise]);

	const fetchLogs = useCallback(async () => {
		if (!selectedExercise) return;
		setIsLoading(true);
		try {
			// Get exercise history using Supabase
			const exerciseHistory = await workoutLogService.getExerciseHistory(user.id, selectedExercise.value, 100);
			
			// Group by workout date and transform to match expected format
			const logsByDate = {};
			exerciseHistory.forEach(historyItem => {
				if (!historyItem.date) return;
				const dateKey = historyItem.date.toDateString();
				if (!logsByDate[dateKey]) {
					logsByDate[dateKey] = {
						id: `${selectedExercise.value}-${dateKey}`,
						date: historyItem.date,
						exercises: [{
							exerciseId: selectedExercise.value,
							sets: 0,
							reps: [],
							weights: [],
							completed: []
						}]
					};
				}

				const log = logsByDate[dateKey];
				const exercise = log.exercises[0];

				// Add this set to the exercise
				exercise.sets = Math.max(exercise.sets, historyItem.set);
				if (exercise.reps && Array.isArray(exercise.reps)) {
					exercise.reps[historyItem.set - 1] = historyItem.reps;
				}
				if (exercise.weights && Array.isArray(exercise.weights)) {
					exercise.weights[historyItem.set - 1] = historyItem.weight;
				}
				if (exercise.completed && Array.isArray(exercise.completed)) {
					exercise.completed[historyItem.set - 1] = historyItem.completed;
				}
			});
			
			// Convert to array and filter by date range
			const fetchedLogs = Object.values(logsByDate)
				.filter(log => {
					const logDate = log.date;
					return logDate >= startDate && logDate <= endDate;
				})
				.sort((a, b) => a.date - b.date)
				.filter(log => log.exercises && log.exercises[0] && log.exercises[0].completed && Array.isArray(log.exercises[0].completed) && log.exercises[0].completed.some(c => c === true));
			
			setLogs(fetchedLogs);
		} catch (error) {
			console.error("Error fetching logs:", error);
		} finally {
			setIsLoading(false);
		}
	}, [selectedExercise, startDate, endDate, user.id]);

	// Run analysis calculations in a separate effect to prevent UI blocking
	useEffect(() => {
		if (logs.length === 0) {
			// Reset charts and metrics if no logs
			setMetrics({
				pr: null,
				volume: 0,
				frequency: 0,
				estimatedOneRepMax: 0,
				exerciseProgress: [],
				consistencyScore: 0
			});
			return;
		}

		const analyzeData = async () => {
			setIsAnalysisLoading(true);
			try {
				// Do heavy calculations
				await calculateAllMetrics();
			} catch (error) {
				console.error("Error analyzing data:", error);
			} finally {
				setIsAnalysisLoading(false);
			}
		};

		analyzeData();
	}, [logs]);

	// Load exercises on mount
	useEffect(() => {
		fetchExercises();
	}, [fetchExercises]);

	// Fetch logs when selection changes
	useEffect(() => {
		if (selectedExercise) {
			fetchLogs();
		}
	}, [selectedExercise, startDate, endDate, fetchLogs]);

	// Calculate all metrics at once to avoid multiple re-renders
	const calculateAllMetrics = async () => {
		try {
			// Get all workout logs for the date range using Supabase
			const allLogs = await workoutLogService.getWorkoutHistory(user.id, 100);
			
			// Filter by date range
			const filteredLogs = allLogs.filter(log => {
				const logDate = new Date(log.completed_date || log.date);
				return logDate >= startDate && logDate <= endDate;
			});

			// Calculate all metrics
			const consistencyScore = calculateConsistencyScore(filteredLogs.map(log => ({ data: () => log })));
			const { pr, volume, frequency, estimatedOneRepMax } = calculateStats(logs);
			const exerciseProgress = calculateProgressTrend(logs);

			// Update all metrics at once
			setMetrics({
				pr,
				volume,
				frequency,
				estimatedOneRepMax,
				exerciseProgress,
				consistencyScore
			});
		} catch (error) {
			console.error("Error calculating metrics:", error);
		}
	};

	// Memoized chart data calculations to prevent recalculation on each render
	const chartData = useMemo(() => {
		if (!logs || logs.length === 0) return null;

		return {
			labels: logs.map(log => log.date.toLocaleDateString()),
			datasets: [{
				label: 'Max Weight (lbs)',
				data: logs.map(log => {
					if (!log.exercises || !log.exercises[0] || !log.exercises[0].weights || !Array.isArray(log.exercises[0].weights) || !log.exercises[0].completed || !Array.isArray(log.exercises[0].completed)) {
						return 0;
					}
					const exercise = log.exercises[0];
					const completedWeights = exercise.weights.filter((_, index) => exercise.completed[index])
					return completedWeights.length > 0 ? Math.max(...completedWeights) : 0;
				}),
				fill: false,
				borderColor: 'rgb(75, 192, 192)',
				tension: 0.1
			}]
		};
	}, [logs]);

	const volumeChartData = useMemo(() => {
		if (!logs || logs.length === 0) return null;

		return {
			labels: logs.map(log => log.date.toLocaleDateString()),
			datasets: [{
				label: 'Volume (weight × reps)',
				data: logs.map(log => {
					if (!log.exercises || !log.exercises[0] || !log.exercises[0].weights || !Array.isArray(log.exercises[0].weights) || !log.exercises[0].reps || !Array.isArray(log.exercises[0].reps) || !log.exercises[0].completed || !Array.isArray(log.exercises[0].completed)) {
						return 0;
					}
					const exercise = log.exercises[0];
					return exercise.weights.reduce((sum, weight, index) => {
						if (exercise.completed[index]) {
							return sum + weight * exercise.reps[index];
						}
						return sum;
					}, 0);
				}),
				fill: false,
				borderColor: 'rgb(153, 102, 255)',
				backgroundColor: 'rgba(153, 102, 255, 0.2)',
				tension: 0.1
			}]
		};
	}, [logs]);

	const restTimeTrends = useMemo(() => {
		if (!logs || logs.length === 0 || !logs.some(log => log.exercises && log.exercises[0] && log.exercises[0].restTimes)) return null;

		return {
			labels: logs.map(log => log.date.toLocaleDateString()),
			datasets: [{
				label: 'Average Rest Time (sec)',
				data: logs.map(log => {
					if (!log.exercises || !log.exercises[0]) return 0;
					const restTimes = log.exercises[0].restTimes || [];
					return restTimes.length ? restTimes.reduce((a, b) => a + b, 0) / restTimes.length : 0;
				}),
				fill: false,
				borderColor: 'rgb(255, 159, 64)',
				tension: 0.1
			}]
		};
	}, [logs]);

	// Improved trend analysis with linear regression
	const calculateProgressTrend = (logs) => {
		if (!logs || logs.length <= 1) return [];

		const results = [];

		// Calculate percent changes between consecutive workouts
		for (let i = 1; i < logs.length; i++) {
			const prevExercise = logs[i - 1].exercises && logs[i - 1].exercises[0];
			const currentExercise = logs[i].exercises && logs[i].exercises[0];

			if (!prevExercise || !prevExercise.weights || !Array.isArray(prevExercise.weights) || prevExercise.weights.length === 0 ||
				!currentExercise || !currentExercise.weights || !Array.isArray(currentExercise.weights) || currentExercise.weights.length === 0) {
				continue;
			}

			const prevMax = Math.max(...prevExercise.weights);
			const currentMax = Math.max(...currentExercise.weights);
			const percentChange = ((currentMax - prevMax) / prevMax) * 100;

			results.push({
				date: logs[i].date,
				percentChange: percentChange,
				prevMax,
				currentMax
			});
		}

		// Calculate linear regression on the max weights
		const points = logs.map((log, index) => {
			if (!log.exercises || !log.exercises[0] || !log.exercises[0].weights || !Array.isArray(log.exercises[0].weights) || log.exercises[0].weights.length === 0) {
				return null;
			}
			return {
				x: log.date.getTime(), // Convert to milliseconds
				y: Math.max(...log.exercises[0].weights)
			};
		}).filter(point => point !== null);

		// Simple linear regression
		const n = points.length;
		const sumX = points.reduce((sum, p) => sum + p.x, 0);
		const sumY = points.reduce((sum, p) => sum + p.y, 0);
		const sumXY = points.reduce((sum, p) => sum + (p.x * p.y), 0);
		const sumXX = points.reduce((sum, p) => sum + (p.x * p.x), 0);

		// Calculate slope and intercept
		const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
		const intercept = (sumY - slope * sumX) / n;

		// Add regression statistics to each result
		results.forEach((result, index) => {
			result.trendValue = slope * logs[index + 1].date.getTime() + intercept;
		});

		// Calculate 30-day projected gain
		const msIn30Days = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
		const projectedGain = slope * msIn30Days;
		const lastWeight = points[points.length - 1].y;
		const projectedWeight = lastWeight + projectedGain;

		// Calculate moving average (3-point window)
		const movingAverages = calculateMovingAverage(
			logs.map(log => {
				if (!log.exercises || !log.exercises[0] || !log.exercises[0].weights || !Array.isArray(log.exercises[0].weights) || log.exercises[0].weights.length === 0) {
					return 0;
				}
				return Math.max(...log.exercises[0].weights);
			}),
			3
		);

		// Add moving averages to the results
		for (let i = 0; i < results.length; i++) {
			results[i].movingAverage = movingAverages[i + 1]; // +1 because results start from the 2nd log
		}

		// Add regression metadata to the first result
		if (results.length > 0) {
			results[0].regressionMetadata = {
				slope,
				intercept,
				projectedGain,
				projectedWeight,
				ratePerMonth: projectedGain,
				trend: slope > 0.00001 ? 'increasing' : slope < -0.00001 ? 'decreasing' : 'stable',
				confidence: calculateRSquared(points, slope, intercept)
			};
		}

		return results;
	};

	// Helper function to calculate moving average
	const calculateMovingAverage = (data, windowSize = 3) => {
		const result = [];
		for (let i = 0; i < data.length; i++) {
			if (i < windowSize - 1) {
				result.push(null); // Not enough data yet
			} else {
				// Calculate average of last windowSize points
				const windowSum = data.slice(i - windowSize + 1, i + 1).reduce((sum, val) => sum + val, 0);
				result.push(windowSum / windowSize);
			}
		}
		return result;
	};

	// Calculate R-squared for the regression
	const calculateRSquared = (points, slope, intercept) => {
		if (points.length < 2) return 0;

		const yMean = points.reduce((sum, p) => sum + p.y, 0) / points.length;

		let ssTotal = 0;
		let ssResidual = 0;

		points.forEach(point => {
			const yPredicted = slope * point.x + intercept;
			ssTotal += Math.pow(point.y - yMean, 2);
			ssResidual += Math.pow(point.y - yPredicted, 2);
		});

		return ssTotal === 0 ? 0 : 1 - (ssResidual / ssTotal);
	};

	const calculateStats = (logs) => {
		if (!logs || logs.length === 0) return {
			pr: null,
			volume: 0,
			frequency: 0,
			estimatedOneRepMax: 0
		};

		let maxWeight = 0;
		let maxWeightDate = null;
		let totalVolume = 0;
		let workoutCount = logs.length;
		let oneRepMaxes = [];

		logs.forEach(log => {
			if (!log.exercises || !log.exercises[0]) return;
			const exercise = log.exercises[0];
			if (!exercise.weights || !Array.isArray(exercise.weights) || !exercise.reps || !Array.isArray(exercise.reps) || !exercise.completed || !Array.isArray(exercise.completed)) return;

			exercise.weights.forEach((weight, index) => {
				if (exercise.completed[index]) {
					// Update max weight and date
					if (weight > maxWeight) {
						maxWeight = weight;
						maxWeightDate = log.date;
					}
					// Add to total volume
					totalVolume += weight * exercise.reps[index];
					// Calculate 1RM for completed sets with reps <= 10
					if (exercise.reps[index] <= 10) {
						const oneRM = weight * (36 / (37 - exercise.reps[index]));
						oneRepMaxes.push(oneRM);
					}
				}
			});
		});

		return {
			pr: { weight: maxWeight, date: maxWeightDate },
			volume: totalVolume,
			frequency: workoutCount / ((endDate - startDate) / (1000 * 60 * 60 * 24 * 7)),
			estimatedOneRepMax: oneRepMaxes.length > 0 ? Math.max(...oneRepMaxes) : 0
		};
	};


	const calculateConsistencyScore = (logs) => {
		if (!logs || logs.length === 0) return 0;

		// Get total days in date range
		const daysBetween = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));

		// Get all unique workout dates
		const workoutDates = new Set();
		logs.forEach(doc => {
			const log = doc.data();
			// Handle both Firestore and Supabase date formats
			let date;
			if (log.completed_date) {
				date = new Date(log.completed_date).toDateString();
			} else if (log.date) {
				date = (log.date.toDate ? log.date.toDate() : new Date(log.date)).toDateString();
			}
			if (date) {
				workoutDates.add(date);
			}
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

		return Math.round((frequencyFactor * 0.7 + varianceFactor * 0.3) * 100);
	};


	// Render loading spinners when data is loading
	const renderLoadingSpinner = () => (
		<div className="text-center my-5">
			<Spinner animation="border" role="status" variant="primary">
				<span className="visually-hidden">Loading...</span>
			</Spinner>
			<p className="mt-2">Loading data...</p>
		</div>
	);

	return (
		<Container className="progress-tracker">
			<div className="d-flex justify-content-between align-items-center mb-3">
				<h1>Progress Tracker</h1>
				<div className="d-flex align-items-center">
					{/* Real-time connection indicator */}
					<Badge 
						bg={isRealtimeConnected ? 'success' : 'secondary'} 
						className="me-2 d-flex align-items-center"
						title={isRealtimeConnected ? 'Real-time updates active' : 'Real-time updates inactive'}
					>
						<Broadcast className="me-1" size={12} />
						{isRealtimeConnected ? 'Live Updates' : 'Offline'}
					</Badge>
					{lastUpdate && (
						<small className="text-muted">
							Last update: {new Date(lastUpdate.timestamp).toLocaleTimeString()}
						</small>
					)}
				</div>
			</div>

			{/* PR Notifications */}
			{prNotifications.length > 0 && (
				<Alert variant="success" dismissible onClose={clearPRNotifications} className="mb-3">
					<Alert.Heading>🎉 New Personal Records!</Alert.Heading>
					{prNotifications.slice(0, 3).map((pr, index) => (
						<div key={index} className="mb-1">
							<strong>{pr.exerciseName}:</strong> {pr.newPR} lbs 
							<span className="text-success"> (+{pr.improvement} lbs)</span>
							<small className="text-muted ms-2">
								{new Date(pr.date).toLocaleDateString()}
							</small>
						</div>
					))}
					{prNotifications.length > 3 && (
						<small className="text-muted">
							...and {prNotifications.length - 3} more PRs
						</small>
					)}
				</Alert>
			)}

			<Button 
                variant="primary" 
                size="lg" 
                onClick={() => navigate('/progress-tracker-2')}
            >
                Progress Tracker v2.0
            </Button>
			<Button 
                variant="primary" 
                size="lg" 
                onClick={() => navigate('/progress-tracker-3')}
            >
                Progress Tracker v3.0
            </Button>
			<Row>
				<Col md={6}>
					<Form.Group>
						<Form.Label>Exercise</Form.Label>
						{isExercisesLoading ? (
							<div className="d-flex align-items-center mb-3">
								<Spinner animation="border" size="sm" className="mr-2" />
								<span className="ml-2">Loading exercises...</span>
							</div>
						) : (
							<Select
								options={exercises}
								value={selectedExercise}
								onChange={setSelectedExercise}
								className="mb-3"
							/>
						)}
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
								{isAnalysisLoading ? (
									<Spinner animation="border" size="sm" />
								) : (
									<Badge bg={metrics.consistencyScore > 80 ? "success" : metrics.consistencyScore > 60 ? "warning" : "danger"} className="p-2">
										{metrics.consistencyScore}/100
									</Badge>
								)}
							</div>
							<Card.Text>
								{metrics.consistencyScore > 80 ? "Excellent consistency! Keep up the great work." :
									metrics.consistencyScore > 60 ? "Good consistency. Try to maintain a more regular schedule." :
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
					<Nav.Link eventKey="logs">Exercise Logs</Nav.Link>
				</Nav.Item>
			</Nav>

			{isLoading ? renderLoadingSpinner() : (
				<>
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
												{isAnalysisLoading ? (
													<Spinner animation="border" size="sm" />
												) : (
													metrics.pr ? `${metrics.pr.weight} lbs on ${metrics.pr.date.toLocaleDateString()}` : 'N/A'
												)}
											</Card.Text>
										</Card.Body>
									</Card>
								</Col>
								<Col md={3}>
									<Card>
										<Card.Body>
											<Card.Title>Estimated 1RM</Card.Title>
											<Card.Text>{metrics.estimatedOneRepMax.toFixed(1)} lbs</Card.Text>
										</Card.Body>
									</Card>
								</Col>
								<Col md={3}>
									<Card>
										<Card.Body>
											<Card.Title>Total Volume</Card.Title>
											<Card.Text>{metrics.volume.toFixed(0)} lbs</Card.Text>
										</Card.Body>
									</Card>
								</Col>
								<Col md={3}>
									<Card>
										<Card.Body>
											<Card.Title>Frequency</Card.Title>
											<Card.Text>{metrics.frequency.toFixed(2)} workouts/week</Card.Text>
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
													{metrics.exerciseProgress.map((progress, index) => (
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


					{activeTab === 'logs' && (
						<Row>
							<Col>
								<h2>Exercise Logs</h2>
								<Table striped bordered hover>
									<thead>
										<tr>
											<th>Date</th>
											<th>Sets (Completed/Total)</th>
											<th>Reps</th>
											<th>Weights (lbs)</th>
											<th>Total Volume</th>
										</tr>
									</thead>
									<tbody>
										{logs.map(log => {
											if (!log.exercises || !log.exercises[0] || !log.exercises[0].weights || !Array.isArray(log.exercises[0].weights) || !log.exercises[0].reps || !Array.isArray(log.exercises[0].reps) || !log.exercises[0].completed || !Array.isArray(log.exercises[0].completed)) {
												return (
													<tr key={log.id}>
														<td>{log.date.toLocaleDateString()}</td>
														<td colSpan="4">Invalid exercise data</td>
													</tr>
												);
											}

											const exercise = log.exercises[0];
											const totalVolume = exercise.weights.reduce((sum, weight, index) => {
												if (exercise.completed[index]) {
													return sum + weight * exercise.reps[index];
												}
												return sum;
											}, 0);

											return (
												<tr key={log.id}>
													<td>{log.date.toLocaleDateString()}</td>
													<td>{exercise.completed.filter(c => c).length} / {exercise.completed.length}</td>
													<td>{exercise.reps.map((rep, index) =>
														exercise.completed[index] ? rep : `(${rep})`).join(', ')}</td>
													<td>{exercise.weights.map((weight, index) =>
														exercise.completed[index] ? weight : `(${weight})`).join(', ')}</td>
													<td>{totalVolume.toFixed(0)}</td>
												</tr>
											);
										})}
									</tbody>
								</Table>
							</Col>
						</Row>
					)}
				</>
			)}
		</Container>
	)
}

export default ProgressTracker;