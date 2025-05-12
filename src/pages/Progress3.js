import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Nav, Button, Form } from 'react-bootstrap';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Calendar, ChevronLeft, ChevronRight } from 'react-bootstrap-icons';
import '../styles/Progress3.css';

// Removed hardcoded MUSCLE_GROUPS since we'll now use the actual data from Firestore
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

function Analytics() {
    const [workoutLogs, setWorkoutLogs] = useState([]);
    const [exercises, setExercises] = useState([]);
    const [muscleGroups, setMuscleGroups] = useState({});
    const [selectedExercise, setSelectedExercise] = useState(null);
    const [activeTab, setActiveTab] = useState('volume'); // Changed default to 'volume' as it's the only tab shown
    const [dateRange, setDateRange] = useState('month'); // 'week', 'month', 'year', 'all'
    const [muscleGroupData, setMuscleGroupData] = useState([]);
    const [strengthMetrics, setStrengthMetrics] = useState([]);
    const [completionRate, setCompletionRate] = useState(0);
    const [volumeData, setVolumeData] = useState([]);
    const [personalRecords, setPersonalRecords] = useState([]);
    const user = auth.currentUser;

    useEffect(() => {
        const fetchData = async () => {
            if (user) {
                try {
                    // Fetch workout logs
                    const logsQuery = query(
                        collection(db, "workoutLogs"),
                        where("userId", "==", user.uid)
                    );
                    const logsSnapshot = await getDocs(logsQuery);
                    const logsData = logsSnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        date: doc.data().date.toDate()
                    }));
                    setWorkoutLogs(logsData);

                    // Fetch exercises
                    const exercisesSnapshot = await getDocs(collection(db, "exercises"));
                    const exercisesData = exercisesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setExercises(exercisesData);

                    if (exercisesData.length > 0) {
                        setSelectedExercise(exercisesData[0].id);

                        // Generate muscle groups mapping from the exercises data
                        const groupsMap = {};
                        exercisesData.forEach(exercise => {
                            const primaryGroup = exercise.primaryMuscleGroup;
                            if (!groupsMap[primaryGroup]) {
                                groupsMap[primaryGroup] = [];
                            }
                            groupsMap[primaryGroup].push(exercise.name);

                            // Also add exercise to secondary muscle groups if any
                            if (exercise.secondaryMuscleGroups && exercise.secondaryMuscleGroups.length > 0) {
                                exercise.secondaryMuscleGroups.forEach(secondaryGroup => {
                                    if (!groupsMap[secondaryGroup]) {
                                        groupsMap[secondaryGroup] = [];
                                    }
                                    // Only add if not already in the array (to avoid duplicates)
                                    if (!groupsMap[secondaryGroup].includes(exercise.name)) {
                                        groupsMap[secondaryGroup].push(exercise.name);
                                    }
                                });
                            }
                        });
                        setMuscleGroups(groupsMap);
                    }
                } catch (error) {
                    console.error("Error fetching data: ", error);
                }
            }
        };
        fetchData();
    }, [user]);

    useEffect(() => {
        if (workoutLogs.length > 0 && exercises.length > 0 && Object.keys(muscleGroups).length > 0) {
            processAnalyticsData();
        }
    }, [workoutLogs, exercises, muscleGroups, dateRange, selectedExercise]);

    const processAnalyticsData = () => {
        const filteredLogs = filterLogsByDateRange(workoutLogs);
        calculateVolumeByMuscleGroup(filteredLogs);
        calculateStrengthMetrics(filteredLogs);
        calculateWorkoutCompletionRate(filteredLogs);
        calculateVolumeProgression(filteredLogs);
        calculatePersonalRecords(workoutLogs); // Use all logs for PRs
    };

    const filterLogsByDateRange = (logs) => {
        const now = new Date();
        let startDate = new Date();

        switch (dateRange) {
            case 'week':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            case 'all':
            default:
                return logs;
        }

        return logs.filter(log => log.date >= startDate);
    };

    const calculateVolumeByMuscleGroup = (logs) => {
        const volumeByMuscle = {};

        // Initialize all muscle groups with zero volume
        Object.keys(muscleGroups).forEach(group => {
            volumeByMuscle[group] = 0;
        });

        logs.forEach(log => {
            log.exercises?.forEach(exercise => {
                const exerciseData = exercises.find(e => e.id === exercise.exerciseId);
                if (!exerciseData) return;

                // Get primary muscle group for this exercise
                const primaryMuscleGroup = exerciseData.primaryMuscleGroup;

                if (primaryMuscleGroup) {
                    // Calculate volume (sets × reps × weight)
                    let volume = calculateExerciseVolume(exercise);
                    volumeByMuscle[primaryMuscleGroup] = (volumeByMuscle[primaryMuscleGroup] || 0) + volume;

                    // Also add a portion of the volume to secondary muscle groups
                    if (exerciseData.secondaryMuscleGroups && exerciseData.secondaryMuscleGroups.length > 0) {
                        // Assign a fraction of the volume to secondary muscle groups (e.g., 40%)
                        const secondaryVolume = volume * 0.4 / exerciseData.secondaryMuscleGroups.length;

                        exerciseData.secondaryMuscleGroups.forEach(secondaryGroup => {
                            volumeByMuscle[secondaryGroup] = (volumeByMuscle[secondaryGroup] || 0) + secondaryVolume;
                        });
                    }
                }
            });
        });

        const muscleData = Object.entries(volumeByMuscle)
            .filter(([_, value]) => value > 0) // Remove muscle groups with zero volume
            .map(([name, value]) => ({
                name: name,
                value
            }));

        setMuscleGroupData(muscleData);
    };

    // Helper function to calculate volume for an exercise
    const calculateExerciseVolume = (exercise) => {
        let volume = 0;
        if (exercise.sets && exercise.reps && exercise.weights) {
            for (let i = 0; i < exercise.sets; i++) {
                volume += (exercise.reps[i] || 0) * (exercise.weights[i] || 0);
            }
        }
        return volume;
    };

    const calculateStrengthMetrics = (logs) => {
        if (!selectedExercise) return;

        // Group logs by date for the selected exercise
        const strengthData = [];
        const dateMap = new Map();

        logs.forEach(log => {
            const date = new Date(log.date).toLocaleDateString();
            log.exercises?.forEach(exercise => {
                if (exercise.exerciseId === selectedExercise) {
                    if (exercise.weights && exercise.weights.length > 0 && exercise.reps && exercise.reps.length > 0) {
                        // Calculate estimated 1RM using Brzycki formula: weight × (36 / (37 - reps))
                        const maxWeight = Math.max(...exercise.weights);
                        const matchingReps = exercise.reps[exercise.weights.indexOf(maxWeight)];

                        if (matchingReps <= 10) { // 1RM estimates are more accurate with lower rep ranges
                            const estimatedOneRM = Math.round(maxWeight * (36 / (37 - matchingReps)));

                            // If we have multiple entries for the same date, keep the highest 1RM
                            if (!dateMap.has(date) || dateMap.get(date).estimatedOneRM < estimatedOneRM) {
                                dateMap.set(date, {
                                    date,
                                    maxWeight,
                                    estimatedOneRM
                                });
                            }
                        }
                    }
                }
            });
        });

        // Convert to array and sort by date
        Array.from(dateMap.values()).forEach(entry => {
            strengthData.push(entry);
        });

        strengthData.sort((a, b) => new Date(a.date) - new Date(b.date));
        setStrengthMetrics(strengthData);
    };

    const calculateWorkoutCompletionRate = (logs) => {
        const totalPlannedWorkouts = logs.length;
        const completedWorkouts = logs.filter(log => log.isWorkoutFinished).length;

        const completionPercentage = totalPlannedWorkouts > 0
            ? Math.round((completedWorkouts / totalPlannedWorkouts) * 100)
            : 0;

        setCompletionRate(completionPercentage);
    };

    const calculateVolumeProgression = (logs) => {
        // Group logs by week and calculate total volume
        const volumeByWeek = new Map();

        logs.forEach(log => {
            const date = new Date(log.date);
            const weekNumber = getWeekNumber(date);
            const weekLabel = `Week ${weekNumber}`;

            let weeklyVolume = volumeByWeek.get(weekLabel) || 0;

            log.exercises?.forEach(exercise => {
                weeklyVolume += calculateExerciseVolume(exercise);
            });

            volumeByWeek.set(weekLabel, weeklyVolume);
        });

        // Convert to array format for charts
        const volumeProgressionData = Array.from(volumeByWeek.entries()).map(([week, volume]) => ({
            week,
            volume
        }));

        // Sort by week number
        volumeProgressionData.sort((a, b) => {
            const weekA = parseInt(a.week.split(' ')[1]);
            const weekB = parseInt(b.week.split(' ')[1]);
            return weekA - weekB;
        });

        setVolumeData(volumeProgressionData);
    };

    const calculatePersonalRecords = (logs) => {
        const prs = new Map();

        logs.forEach(log => {
            log.exercises?.forEach(exercise => {
                const exerciseData = exercises.find(e => e.id === exercise.exerciseId);
                if (!exerciseData) return;

                if (exercise.weights && exercise.weights.length > 0) {
                    const maxWeight = Math.max(...exercise.weights);
                    const currentPR = prs.get(exercise.exerciseId) || { weight: 0, date: null };

                    if (maxWeight > currentPR.weight) {
                        prs.set(exercise.exerciseId, {
                            exerciseId: exercise.exerciseId,
                            exerciseName: exerciseData.name,
                            weight: maxWeight,
                            date: log.date.toLocaleDateString()
                        });
                    }
                }
            });
        });

        setPersonalRecords(Array.from(prs.values()));
    };

    const getWeekNumber = (date) => {
        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
        const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
        return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    };

    const estimateOneRepMax = (weight, reps) => {
        // Brzycki formula: weight × (36 / (37 - reps))
        if (reps >= 36) return weight; // Formula breaks down at high reps
        return Math.round(weight * (36 / (37 - reps)));
    };

    const renderOverviewTab = () => {
        return (
            <div className="analytics-overview">
                <Row>
                    <Col md={6} className="mb-4">
                        <Card className="shadow-sm h-100">
                            <Card.Header>
                                <h5 className="mb-0">Workout Completion Rate</h5>
                            </Card.Header>
                            <Card.Body className="d-flex flex-column align-items-center justify-content-center">
                                <div className="progress-circle" style={{ width: '150px', height: '150px' }}>
                                    <svg viewBox="0 0 36 36" className="circular-chart">
                                        <path
                                            className="circle-bg"
                                            d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                                        />
                                        <path
                                            className="circle"
                                            strokeDasharray={`${completionRate}, 100`}
                                            d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                                        />
                                    </svg>
                                    <div className="progress-text">{completionRate}%</div>
                                </div>
                                <div className="text-center mt-3">
                                    Completion rate for {dateRange === 'week' ? 'the past week' :
                                        dateRange === 'month' ? 'the past month' :
                                        dateRange === 'year' ? 'the past year' : 'all time'}
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>

                    <Col md={6} className="mb-4">
                        <Card className="shadow-sm h-100">
                            <Card.Header>
                                <h5 className="mb-0">Volume by Muscle Group</h5>
                            </Card.Header>
                            <Card.Body>
                                <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                        <Pie
                                            data={muscleGroupData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {muscleGroupData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value) => `${value.toLocaleString()} lb`} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row>
                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm">
                            <Card.Header>
                                <h5 className="mb-0">Weekly Volume Progression</h5>
                            </Card.Header>
                            <Card.Body>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart
                                        data={volumeData}
                                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="week" />
                                        <YAxis />
                                        <Tooltip formatter={(value) => `${value.toLocaleString()} lb`} />
                                        <Legend />
                                        <Line type="monotone" dataKey="volume" stroke="#8884d8" activeDot={{ r: 8 }} name="Total Volume" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row>
                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm">
                            <Card.Header>
                                <h5 className="mb-0">Personal Records</h5>
                            </Card.Header>
                            <Card.Body>
                                <div className="table-responsive">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Exercise</th>
                                                <th>Maximum Weight</th>
                                                <th>Date Achieved</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {personalRecords.length > 0 ? (
                                                personalRecords.map((pr, index) => (
                                                    <tr key={index}>
                                                        <td>{pr.exerciseName}</td>
                                                        <td>{pr.weight} lb</td>
                                                        <td>{pr.date}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="3" className="text-center">No personal records found</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </div>
        );
    };

    const renderStrengthTab = () => {
        return (
            <div className="strength-analytics">
                <Row className="mb-4">
                    <Col>
                        <Card className="shadow-sm">
                            <Card.Header>
                                <div className="d-flex justify-content-between align-items-center">
                                    <h5 className="mb-0">Strength Progression</h5>
                                    <Form.Select
                                        className="w-auto"
                                        value={selectedExercise || ''}
                                        onChange={(e) => setSelectedExercise(e.target.value)}
                                    >
                                        {exercises.map(ex => (
                                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                                        ))}
                                    </Form.Select>
                                </div>
                            </Card.Header>
                            <Card.Body>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart
                                        data={strengthMetrics}
                                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Line type="monotone" dataKey="maxWeight" stroke="#82ca9d" name="Max Weight" />
                                        <Line type="monotone" dataKey="estimatedOneRM" stroke="#8884d8" name="Estimated 1RM" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                {selectedExercise && strengthMetrics.length > 0 && (
                    <Row>
                        <Col md={12} className="mb-4">
                            <Card className="shadow-sm">
                                <Card.Header>
                                    <h5 className="mb-0">Strength Metrics for {exercises.find(e => e.id === selectedExercise)?.name}</h5>
                                </Card.Header>
                                <Card.Body>
                                    <div className="table-responsive">
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Max Weight</th>
                                                    <th>Estimated 1RM</th>
                                                    <th>Progress</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {strengthMetrics.map((metric, index) => {
                                                    const prevMetric = index > 0 ? strengthMetrics[index - 1] : null;
                                                    const change = prevMetric ? metric.estimatedOneRM - prevMetric.estimatedOneRM : 0;
                                                    return (
                                                        <tr key={index}>
                                                            <td>{metric.date}</td>
                                                            <td>{metric.maxWeight} lb</td>
                                                            <td>{metric.estimatedOneRM} lb</td>
                                                            <td>
                                                                {index > 0 ? (
                                                                    <span className={change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-muted'}>
                                                                        {change > 0 ? '+' : ''}{change} lb
                                                                    </span>
                                                                ) : '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>
                )}
            </div>
        );
    };

    const renderVolumeTab = () => {
        // Calculate volume data by muscle group over time
        const muscleVolumeTrends = {};
        Object.keys(muscleGroups).forEach(group => {
            muscleVolumeTrends[group] = [];
        });

        // Group workout logs by weeks
        const logsByWeek = {};
        workoutLogs.forEach(log => {
            const date = new Date(log.date);
            const weekNumber = getWeekNumber(date);
            const weekLabel = `Week ${weekNumber}`;

            if (!logsByWeek[weekLabel]) {
                logsByWeek[weekLabel] = [];
            }
            logsByWeek[weekLabel].push(log);
        });

        // Calculate volume for each muscle group by week
        Object.entries(logsByWeek).forEach(([week, logs]) => {
            // Initialize volume for each muscle group for this week
            const weeklyVolume = {};
            Object.keys(muscleGroups).forEach(group => {
                weeklyVolume[group] = 0;
            });

            // Calculate volume for each exercise in this week's logs
            logs.forEach(log => {
                log.exercises?.forEach(exercise => {
                    const exerciseData = exercises.find(e => e.id === exercise.exerciseId);
                    if (!exerciseData) return;

                    // Calculate exercise volume
                    const volume = calculateExerciseVolume(exercise);

                    // Add volume to primary muscle group
                    const primaryGroup = exerciseData.primaryMuscleGroup;
                    if (primaryGroup) {
                        weeklyVolume[primaryGroup] = (weeklyVolume[primaryGroup] || 0) + volume;
                    }

                    // Add partial volume to secondary muscle groups
                    // if (exerciseData.secondaryMuscleGroups && exerciseData.secondaryMuscleGroups.length > 0) {
                    //     const secondaryVolume = volume * 0.4 / exerciseData.secondaryMuscleGroups.length;
                    //     exerciseData.secondaryMuscleGroups.forEach(secondaryGroup => {
                    //         weeklyVolume[secondaryGroup] = (weeklyVolume[secondaryGroup] || 0) + secondaryVolume;
                    //     });
                    // }
                });
            });

            // Add this week's volume data to each muscle group's trend
            Object.entries(weeklyVolume).forEach(([group, volume]) => {
                if (volume > 0) { // Only add data points for muscle groups with activity
                    muscleVolumeTrends[group].push({
                        week,
                        volume
                    });
                }
            });
        });

        // Sort each muscle group's data by week
        Object.keys(muscleVolumeTrends).forEach(group => {
            muscleVolumeTrends[group].sort((a, b) => {
                const weekA = parseInt(a.week.split(' ')[1]);
                const weekB = parseInt(b.week.split(' ')[1]);
                return weekA - weekB;
            });
        });

        // Prepare data for stacked bar chart
        const stackedData = [];
        const weeks = [...new Set(Object.values(muscleVolumeTrends)
            .flatMap(data => data.map(item => item.week)))].sort((a, b) => {
                const weekA = parseInt(a.split(' ')[1]);
                const weekB = parseInt(b.split(' ')[1]);
                return weekA - weekB;
            });

        weeks.forEach(week => {
            const weekData = { week };
            Object.entries(muscleVolumeTrends).forEach(([group, data]) => {
                const weekItem = data.find(item => item.week === week);
                weekData[group] = weekItem ? weekItem.volume : 0;
            });
            stackedData.push(weekData);
        });

        // Filter out inactive muscle groups (those with no data in any week)
        const activeGroups = Object.keys(muscleVolumeTrends).filter(group =>
            muscleVolumeTrends[group].some(data => data.volume > 0)
        );

        return (
            <div className="volume-analytics">
                <Row>
                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm">
                            <Card.Header>
                                <h5 className="mb-0">Volume Distribution by Muscle Group</h5>
                            </Card.Header>
                            <Card.Body>
                                <ResponsiveContainer width="100%" height={400}>
                                    <BarChart
                                        data={stackedData}
                                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="week" />
                                        <YAxis />
                                        <Tooltip formatter={(value) => `${value.toLocaleString()} lb`} />
                                        <Legend />
                                        {activeGroups.map((group, index) => (
                                            <Bar
                                                key={group}
                                                dataKey={group}
                                                stackId="a"
                                                fill={COLORS[index % COLORS.length]}
                                                name={group}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row>
                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm">
                            <Card.Header>
                                <h5 className="mb-0">Volume Trends by Muscle Group</h5>
                            </Card.Header>
                            <Card.Body>
                                <ResponsiveContainer width="100%" height={400}>
                                    <LineChart
                                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="week"
                                            allowDuplicatedCategory={false}
                                            type="category"
                                            allowDecimals={false}
                                        />
                                        <YAxis />
                                        <Tooltip formatter={(value) => `${value.toLocaleString()} lb`} />
                                        <Legend />
                                        {activeGroups.map((group, index) => (
                                            <Line
                                                key={group}
                                                data={muscleVolumeTrends[group]}
                                                type="monotone"
                                                dataKey="volume"
                                                name={group}
                                                stroke={COLORS[index % COLORS.length]}
                                                activeDot={{ r: 8 }}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </div>
        );
    };

    return (
        <Container fluid className="soft-container analytics-container">
            <Row className="justify-content-center">
                <Col md={10}>
                    <div className="soft-card analytics-card shadow border-0">
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <h1 className="soft-title analytics-title">Workout Analytics</h1>
                            <div className="d-flex">
                                <Form.Select
                                    className="me-2"
                                    value={dateRange}
                                    onChange={(e) => setDateRange(e.target.value)}
                                >
                                    <option value="week">Past Week</option>
                                    <option value="month">Past Month</option>
                                    <option value="year">Past Year</option>
                                    <option value="all">All Time</option>
                                </Form.Select>
                                <div className="date-range-display d-flex align-items-center">
                                    <Calendar className="me-2" />
                                    <span>
                                        {dateRange === 'week' ? 'Last 7 days' :
                                            dateRange === 'month' ? 'Last 30 days' :
                                                dateRange === 'year' ? 'Last 365 days' : 'All time'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <Nav tabs className="analytics-tabs mb-4">
                            <Nav.Item>
                                <Nav.Link
                                    className={activeTab === 'overview' ? 'active' : ''}
                                    onClick={() => setActiveTab('overview')}
                                >
                                    Overview
                                </Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link
                                    className={activeTab === 'volume'}
                                    onClick={() => setActiveTab('volume')}
                                >
                                    Volume Analysis
                                </Nav.Link>
                            </Nav.Item>
                            <Nav.Item>
                                <Nav.Link
                                    className={activeTab === 'strength'}
                                    onClick={() => setActiveTab('strength')}
                                >
                                    Strength Analysis
                                </Nav.Link>
                            </Nav.Item>
                        </Nav>

                        {activeTab === 'overview' && renderOverviewTab()}
                        {activeTab === 'strength' && renderStrengthTab()}
                        {activeTab === 'volume' && renderVolumeTab()}
                    </div>
                </Col>
            </Row>
        </Container>
    );
}

export default Analytics