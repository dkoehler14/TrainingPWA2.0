import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { getSubcollectionCached, warmUserCache } from '../api/enhancedFirestoreCache';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import '../styles/CompoundLiftTracker.css';

const CompoundLiftTracker = () => {
    const [compoundData, setCompoundData] = useState({
        lifts: [],
        progressionData: [],
        prHistory: {},
        intensityData: []
    });
    const [loading, setLoading] = useState(true);
    const [selectedLift, setSelectedLift] = useState('all');
    const [timeRange, setTimeRange] = useState('6months');
    const [userId, setUserId] = useState(null);

    // Big 4 compound lifts
    const COMPOUND_LIFTS = [
        'Squat',
        'Bench Press', 
        'Deadlift',
        'Overhead Press'
    ];

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            setUserId(user ? user.uid : null);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        // Warm cache before fetching data for better performance
        warmUserCache(userId, 'normal').then(() => {
            fetchCompoundLiftData();
        }).catch(() => {
            // If cache warming fails, still fetch data
            fetchCompoundLiftData();
        });
    }, [userId, timeRange]);

    const fetchCompoundLiftData = async () => {
        setLoading(true);
        
        try {
            // Fetch exercise analytics for compound lifts
            const exerciseAnalytics = await getSubcollectionCached(
                `userAnalytics/${userId}`, 
                'exerciseAnalytics', 
                {}, 
                15 * 60 * 1000
            );

            // Filter for compound lifts
            const compoundLifts = exerciseAnalytics.filter(exercise => 
                exercise.isCompoundLift && 
                COMPOUND_LIFTS.some(lift => exercise.exerciseName?.toLowerCase().includes(lift.toLowerCase()))
            );

            // Fetch PR history for each compound lift
            const prHistoryData = {};
            for (const lift of compoundLifts) {
                try {
                    const prHistory = await getSubcollectionCached(
                        `userAnalytics/${userId}/exerciseAnalytics/${lift.id}`,
                        'prHistory',
                        {},
                        15 * 60 * 1000
                    );
                    prHistoryData[lift.exerciseName] = prHistory;
                } catch (error) {
                    console.log(`No PR history found for ${lift.exerciseName}`);
                    prHistoryData[lift.exerciseName] = [];
                }
            }

            // Process data for charts
            const processedData = processCompoundLiftData(compoundLifts, prHistoryData);
            setCompoundData(processedData);

        } catch (error) {
            console.error('Error fetching compound lift data:', error);
            setCompoundData({
                lifts: [],
                progressionData: [],
                prHistory: {},
                intensityData: []
            });
        } finally {
            setLoading(false);
        }
    };

    const processCompoundLiftData = (lifts, prHistory) => {
        // Process progression data
        const progressionData = [];
        const intensityData = [];
        
        lifts.forEach(lift => {
            const liftPRs = prHistory[lift.exerciseName] || [];
            
            // Sort PRs by date
            const sortedPRs = liftPRs
                .filter(pr => pr.achievedDate)
                .sort((a, b) => a.achievedDate.toDate() - b.achievedDate.toDate());

            // Filter by time range
            const cutoffDate = getTimeRangeCutoff(timeRange);
            const filteredPRs = sortedPRs.filter(pr => pr.achievedDate.toDate() >= cutoffDate);

            filteredPRs.forEach(pr => {
                progressionData.push({
                    date: pr.achievedDate.toDate().toLocaleDateString(),
                    exercise: lift.exerciseName,
                    e1RM: Math.round(pr.e1RM),
                    repRange: pr.repRange,
                    weight: pr.weight,
                    reps: pr.reps
                });
            });

            // Process intensity distribution
            if (lift.intensityDistribution) {
                Object.entries(lift.intensityDistribution).forEach(([intensity, count]) => {
                    intensityData.push({
                        exercise: lift.exerciseName,
                        intensity: `${intensity}%`,
                        intensityValue: parseInt(intensity),
                        sets: count
                    });
                });
            }
        });

        // Sort progression data by date
        progressionData.sort((a, b) => new Date(a.date) - new Date(b.date));

        return {
            lifts,
            progressionData,
            prHistory,
            intensityData
        };
    };

    const getTimeRangeCutoff = (range) => {
        const now = new Date();
        switch (range) {
            case '3months':
                return new Date(now.setMonth(now.getMonth() - 3));
            case '6months':
                return new Date(now.setMonth(now.getMonth() - 6));
            case '1year':
                return new Date(now.setFullYear(now.getFullYear() - 1));
            default:
                return new Date(0); // All time
        }
    };

    const getFilteredProgressionData = () => {
        if (selectedLift === 'all') {
            return compoundData.progressionData;
        }
        return compoundData.progressionData.filter(data => data.exercise === selectedLift);
    };

    const getFilteredIntensityData = () => {
        if (selectedLift === 'all') {
            return compoundData.intensityData;
        }
        return compoundData.intensityData.filter(data => data.exercise === selectedLift);
    };

    const getLiftColor = (exercise) => {
        const colors = {
            'Squat': '#8884d8',
            'Bench Press': '#82ca9d',
            'Deadlift': '#ffc658',
            'Overhead Press': '#ff7c7c'
        };
        
        for (const [lift, color] of Object.entries(colors)) {
            if (exercise?.toLowerCase().includes(lift.toLowerCase())) {
                return color;
            }
        }
        return '#8884d8';
    };

    const calculatePredictedE1RM = (currentE1RM, daysAhead = 30) => {
        // Simple linear prediction based on recent progress
        // In a real app, this would use more sophisticated modeling
        const growthRate = 0.02; // 2% per month assumption
        return Math.round(currentE1RM * (1 + (growthRate * daysAhead / 30)));
    };

    if (loading) {
        return (
            <div className="compound-lift-tracker loading">
                <div className="loading-spinner"></div>
                <p>Loading compound lift data...</p>
            </div>
        );
    }

    if (!userId) {
        return (
            <div className="compound-lift-tracker auth-required">
                <h3>🏋️ Compound Lift Tracker</h3>
                <p>Please log in to track your compound lift progress.</p>
            </div>
        );
    }

    if (compoundData.lifts.length === 0) {
        return (
            <div className="compound-lift-tracker empty">
                <h3>🏋️ Compound Lift Tracker</h3>
                <p>No compound lift data found. Start logging Squat, Bench Press, Deadlift, or Overhead Press workouts to see your progress!</p>
            </div>
        );
    }

    const filteredProgressionData = getFilteredProgressionData();
    const filteredIntensityData = getFilteredIntensityData();

    return (
        <div className="compound-lift-tracker">
            <div className="tracker-header">
                <h3>🏋️ Compound Lift Tracker</h3>
                <p className="tracker-subtitle">Track your Big 4 lifts with e1RM progression and intensity analysis</p>
            </div>

            {/* Controls */}
            <div className="tracker-controls">
                <div className="control-group">
                    <label htmlFor="lift-select">Exercise:</label>
                    <select 
                        id="lift-select"
                        value={selectedLift} 
                        onChange={(e) => setSelectedLift(e.target.value)}
                        className="lift-select"
                    >
                        <option value="all">All Lifts</option>
                        {compoundData.lifts.map(lift => (
                            <option key={lift.exerciseName} value={lift.exerciseName}>
                                {lift.exerciseName}
                            </option>
                        ))}
                    </select>
                </div>
                
                <div className="control-group">
                    <label htmlFor="time-range-select">Time Range:</label>
                    <select 
                        id="time-range-select"
                        value={timeRange} 
                        onChange={(e) => setTimeRange(e.target.value)}
                        className="time-range-select"
                    >
                        <option value="3months">Last 3 Months</option>
                        <option value="6months">Last 6 Months</option>
                        <option value="1year">Last Year</option>
                        <option value="all">All Time</option>
                    </select>
                </div>
            </div>

            {/* Lift Summary Cards */}
            <div className="lift-summary-cards">
                {compoundData.lifts.map(lift => (
                    <div key={lift.exerciseName} className="lift-card">
                        <div className="lift-header">
                            <h4>{lift.exerciseName}</h4>
                            <div className="lift-badge" style={{ backgroundColor: getLiftColor(lift.exerciseName) }}>
                                {lift.isCompoundLift ? 'COMPOUND' : 'ACCESSORY'}
                            </div>
                        </div>
                        <div className="lift-stats">
                            <div className="stat">
                                <div className="stat-value">{Math.round(lift.e1RM)} lbs</div>
                                <div className="stat-label">Current e1RM</div>
                            </div>
                            <div className="stat">
                                <div className="stat-value">{Math.round(lift.totalVolume / 1000)}K</div>
                                <div className="stat-label">Total Volume</div>
                            </div>
                            <div className="stat">
                                <div className="stat-value">{lift.averageIntensityPercent || 0}%</div>
                                <div className="stat-label">Avg Intensity</div>
                            </div>
                            <div className="stat">
                                <div className="stat-value">{calculatePredictedE1RM(lift.e1RM)}</div>
                                <div className="stat-label">Predicted 1RM</div>
                                <div className="stat-sublabel">(30 days)</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts */}
            <div className="charts-section">
                {/* e1RM Progression Chart */}
                <div className="chart-container">
                    <h4>📈 e1RM Progression</h4>
                    <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={filteredProgressionData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip 
                                formatter={(value, name, props) => [
                                    `${value} lbs`,
                                    `${props.payload.exercise} (${props.payload.repRange})`
                                ]}
                            />
                            <Legend />
                            {selectedLift === 'all' ? (
                                compoundData.lifts.map(lift => (
                                    <Line
                                        key={lift.exerciseName}
                                        type="monotone"
                                        dataKey="e1RM"
                                        data={filteredProgressionData.filter(d => d.exercise === lift.exerciseName)}
                                        stroke={getLiftColor(lift.exerciseName)}
                                        name={lift.exerciseName}
                                        strokeWidth={2}
                                        dot={{ r: 4 }}
                                    />
                                ))
                            ) : (
                                <Line
                                    type="monotone"
                                    dataKey="e1RM"
                                    stroke={getLiftColor(selectedLift)}
                                    name="e1RM"
                                    strokeWidth={3}
                                    dot={{ r: 5 }}
                                />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Intensity Distribution Chart */}
                <div className="chart-container">
                    <h4>💪 Intensity Distribution</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={filteredIntensityData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="intensity" />
                            <YAxis />
                            <Tooltip 
                                formatter={(value, name, props) => [
                                    `${value} sets`,
                                    `${props.payload.exercise || 'Sets'}`
                                ]}
                            />
                            <Legend />
                            <Bar 
                                dataKey="sets" 
                                fill="#8884d8" 
                                name="Sets"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* PR History Table */}
            <div className="pr-history-section">
                <h4>🏆 Recent Personal Records</h4>
                <div className="pr-table-container">
                    <table className="pr-table">
                        <thead>
                            <tr>
                                <th>Exercise</th>
                                <th>Rep Range</th>
                                <th>Weight</th>
                                <th>Reps</th>
                                <th>e1RM</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProgressionData
                                .slice(-10) // Show last 10 PRs
                                .reverse()
                                .map((pr, index) => (
                                <tr key={index}>
                                    <td className="exercise-cell">
                                        <span 
                                            className="exercise-dot" 
                                            style={{ backgroundColor: getLiftColor(pr.exercise) }}
                                        ></span>
                                        {pr.exercise}
                                    </td>
                                    <td>{pr.repRange}</td>
                                    <td>{pr.weight} lbs</td>
                                    <td>{pr.reps}</td>
                                    <td><strong>{pr.e1RM} lbs</strong></td>
                                    <td>{pr.date}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default CompoundLiftTracker;