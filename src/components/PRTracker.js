import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { getSubcollectionCached, warmUserCache } from '../api/enhancedFirestoreCache';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import '../styles/PRTracker.css';

const PRTracker = () => {
    const [prData, setPrData] = useState({
        allTimePRs: [],
        recentPRs: [],
        progressionData: [],
        prsByRepRange: {},
        achievements: []
    });
    const [loading, setLoading] = useState(true);
    const [selectedExercise, setSelectedExercise] = useState('all');
    const [selectedRepRange, setSelectedRepRange] = useState('all');
    const [timeFilter, setTimeFilter] = useState('6months');
    const [userId, setUserId] = useState(null);

    const REP_RANGES = ['1RM', '3RM', '5RM', '8RM', '12RM', '15RM'];

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
            fetchPRData();
        }).catch(() => {
            // If cache warming fails, still fetch data
            fetchPRData();
        });
    }, [userId, timeFilter]);

    const fetchPRData = async () => {
        setLoading(true);
        
        try {
            // Fetch exercise analytics to get list of exercises
            const exerciseAnalytics = await getSubcollectionCached(
                `userAnalytics/${userId}`, 
                'exerciseAnalytics', 
                {}, 
                15 * 60 * 1000
            );

            // Fetch PR history for each exercise
            const allPRs = [];
            const prsByExercise = {};
            
            for (const exercise of exerciseAnalytics) {
                try {
                    const prHistory = await getSubcollectionCached(
                        `userAnalytics/${userId}/exerciseAnalytics/${exercise.id}`,
                        'prHistory',
                        {},
                        15 * 60 * 1000
                    );
                    
                    prHistory.forEach(pr => {
                        const prRecord = {
                            ...pr,
                            exerciseName: exercise.exerciseName,
                            exerciseId: exercise.id,
                            muscleGroup: exercise.muscleGroup,
                            isCompoundLift: exercise.isCompoundLift,
                            achievedDate: pr.achievedDate?.toDate() || new Date()
                        };
                        
                        allPRs.push(prRecord);
                        
                        if (!prsByExercise[exercise.exerciseName]) {
                            prsByExercise[exercise.exerciseName] = [];
                        }
                        prsByExercise[exercise.exerciseName].push(prRecord);
                    });
                } catch (error) {
                    console.log(`No PR history found for ${exercise.exerciseName}`);
                }
            }

            // Process PR data
            const processedData = processPRData(allPRs, prsByExercise);
            setPrData(processedData);

        } catch (error) {
            console.error('Error fetching PR data:', error);
            setPrData({
                allTimePRs: [],
                recentPRs: [],
                progressionData: [],
                prsByRepRange: {},
                achievements: []
            });
        } finally {
            setLoading(false);
        }
    };

    const processPRData = (allPRs, prsByExercise) => {
        // Sort all PRs by date
        const sortedPRs = allPRs.sort((a, b) => b.achievedDate - a.achievedDate);
        
        // Get time filter cutoff
        const cutoffDate = getTimeFilterCutoff(timeFilter);
        const recentPRs = sortedPRs.filter(pr => pr.achievedDate >= cutoffDate);
        
        // Get all-time PRs (best e1RM for each exercise/rep range combination)
        const allTimePRs = [];
        const prMap = new Map();
        
        sortedPRs.forEach(pr => {
            const key = `${pr.exerciseName}-${pr.repRange}`;
            if (!prMap.has(key) || pr.e1RM > prMap.get(key).e1RM) {
                prMap.set(key, pr);
            }
        });
        
        prMap.forEach(pr => allTimePRs.push(pr));
        allTimePRs.sort((a, b) => b.e1RM - a.e1RM);
        
        // Create progression data for charts
        const progressionData = recentPRs.map(pr => ({
            date: pr.achievedDate.toLocaleDateString(),
            dateObj: pr.achievedDate,
            exercise: pr.exerciseName,
            repRange: pr.repRange,
            e1RM: Math.round(pr.e1RM),
            weight: pr.weight,
            reps: pr.reps,
            muscleGroup: pr.muscleGroup,
            isCompoundLift: pr.isCompoundLift
        })).sort((a, b) => a.dateObj - b.dateObj);
        
        // Group PRs by rep range
        const prsByRepRange = {};
        REP_RANGES.forEach(range => {
            prsByRepRange[range] = allTimePRs
                .filter(pr => pr.repRange === range)
                .sort((a, b) => b.e1RM - a.e1RM)
                .slice(0, 10); // Top 10 for each rep range
        });
        
        // Generate achievements
        const achievements = generateAchievements(recentPRs, allTimePRs);
        
        return {
            allTimePRs: allTimePRs.slice(0, 20), // Top 20 all-time PRs
            recentPRs: recentPRs.slice(0, 10), // Last 10 recent PRs
            progressionData,
            prsByRepRange,
            achievements
        };
    };

    const getTimeFilterCutoff = (filter) => {
        const now = new Date();
        switch (filter) {
            case '1month':
                return new Date(now.setMonth(now.getMonth() - 1));
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

    const generateAchievements = (recentPRs, allTimePRs) => {
        const achievements = [];
        
        // Recent PR achievements
        if (recentPRs.length > 0) {
            achievements.push({
                type: 'recent',
                icon: '🔥',
                title: 'Recent PR Streak',
                description: `${recentPRs.length} personal records in the selected timeframe!`
            });
        }
        
        // Compound lift achievements
        const compoundPRs = allTimePRs.filter(pr => pr.isCompoundLift);
        if (compoundPRs.length > 0) {
            const maxCompoundPR = Math.max(...compoundPRs.map(pr => pr.e1RM));
            achievements.push({
                type: 'strength',
                icon: '💪',
                title: 'Strength Milestone',
                description: `${Math.round(maxCompoundPR)} lbs estimated 1RM on compound lifts!`
            });
        }
        
        // Rep range diversity
        const repRangeCount = new Set(allTimePRs.map(pr => pr.repRange)).size;
        if (repRangeCount >= 4) {
            achievements.push({
                type: 'versatility',
                icon: '🎯',
                title: 'Well-Rounded Lifter',
                description: `Personal records across ${repRangeCount} different rep ranges!`
            });
        }
        
        // Consistency achievement
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        const recentPRCount = recentPRs.filter(pr => pr.achievedDate >= last30Days).length;
        if (recentPRCount >= 3) {
            achievements.push({
                type: 'consistency',
                icon: '📈',
                title: 'Consistent Progress',
                description: `${recentPRCount} PRs in the last 30 days - great momentum!`
            });
        }
        
        return achievements;
    };

    const getFilteredProgressionData = () => {
        let filtered = prData.progressionData;
        
        if (selectedExercise !== 'all') {
            filtered = filtered.filter(pr => pr.exercise === selectedExercise);
        }
        
        if (selectedRepRange !== 'all') {
            filtered = filtered.filter(pr => pr.repRange === selectedRepRange);
        }
        
        return filtered;
    };

    const getExerciseColor = (exercise) => {
        // Generate consistent colors for exercises
        const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0'];
        const exercises = [...new Set(prData.progressionData.map(pr => pr.exercise))];
        const index = exercises.indexOf(exercise);
        return colors[index % colors.length];
    };

    const getRepRangeColor = (repRange) => {
        const colors = {
            '1RM': '#e74c3c',
            '3RM': '#e67e22',
            '5RM': '#f39c12',
            '8RM': '#f1c40f',
            '12RM': '#27ae60',
            '15RM': '#2ecc71'
        };
        return colors[repRange] || '#95a5a6';
    };

    if (loading) {
        return (
            <div className="pr-tracker loading">
                <div className="loading-spinner"></div>
                <p>Loading personal records...</p>
            </div>
        );
    }

    if (!userId) {
        return (
            <div className="pr-tracker auth-required">
                <h3>🏆 PR Tracker</h3>
                <p>Please log in to track your personal records.</p>
            </div>
        );
    }

    if (prData.allTimePRs.length === 0) {
        return (
            <div className="pr-tracker empty">
                <h3>🏆 PR Tracker</h3>
                <p>No personal records found yet. Keep training hard and your PRs will start appearing here!</p>
            </div>
        );
    }

    const filteredProgressionData = getFilteredProgressionData();
    const uniqueExercises = [...new Set(prData.progressionData.map(pr => pr.exercise))];

    return (
        <div className="pr-tracker">
            <div className="tracker-header">
                <h3>🏆 PR Tracker</h3>
                <p className="tracker-subtitle">Track your personal records and celebrate your achievements</p>
            </div>

            {/* Achievements Section */}
            <div className="achievements-section">
                <h4>🎉 Achievements</h4>
                <div className="achievements-grid">
                    {prData.achievements.map((achievement, index) => (
                        <div key={index} className={`achievement-card ${achievement.type}`}>
                            <div className="achievement-icon">{achievement.icon}</div>
                            <div className="achievement-content">
                                <div className="achievement-title">{achievement.title}</div>
                                <div className="achievement-description">{achievement.description}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Controls */}
            <div className="tracker-controls">
                <div className="control-group">
                    <label htmlFor="exercise-filter">Exercise:</label>
                    <select 
                        id="exercise-filter"
                        value={selectedExercise} 
                        onChange={(e) => setSelectedExercise(e.target.value)}
                    >
                        <option value="all">All Exercises</option>
                        {uniqueExercises.map(exercise => (
                            <option key={exercise} value={exercise}>{exercise}</option>
                        ))}
                    </select>
                </div>
                
                <div className="control-group">
                    <label htmlFor="rep-range-filter">Rep Range:</label>
                    <select 
                        id="rep-range-filter"
                        value={selectedRepRange} 
                        onChange={(e) => setSelectedRepRange(e.target.value)}
                    >
                        <option value="all">All Rep Ranges</option>
                        {REP_RANGES.map(range => (
                            <option key={range} value={range}>{range}</option>
                        ))}
                    </select>
                </div>
                
                <div className="control-group">
                    <label htmlFor="time-filter">Time Period:</label>
                    <select 
                        id="time-filter"
                        value={timeFilter} 
                        onChange={(e) => setTimeFilter(e.target.value)}
                    >
                        <option value="1month">Last Month</option>
                        <option value="3months">Last 3 Months</option>
                        <option value="6months">Last 6 Months</option>
                        <option value="1year">Last Year</option>
                        <option value="all">All Time</option>
                    </select>
                </div>
            </div>

            {/* PR Progression Chart */}
            <div className="chart-section">
                <h4>📈 PR Progression Over Time</h4>
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
                        {selectedExercise === 'all' ? (
                            uniqueExercises.map(exercise => (
                                <Line
                                    key={exercise}
                                    type="monotone"
                                    dataKey="e1RM"
                                    data={filteredProgressionData.filter(d => d.exercise === exercise)}
                                    stroke={getExerciseColor(exercise)}
                                    name={exercise}
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                />
                            ))
                        ) : (
                            <Line
                                type="monotone"
                                dataKey="e1RM"
                                stroke={getExerciseColor(selectedExercise)}
                                name="e1RM"
                                strokeWidth={3}
                                dot={{ r: 5 }}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* PR Tables by Rep Range */}
            <div className="pr-tables-section">
                <h4>🏅 Personal Records by Rep Range</h4>
                <div className="rep-range-tabs">
                    {REP_RANGES.map(range => (
                        <button
                            key={range}
                            className={`tab-button ${selectedRepRange === range ? 'active' : ''}`}
                            onClick={() => setSelectedRepRange(range)}
                            style={{ borderColor: getRepRangeColor(range) }}
                        >
                            {range}
                        </button>
                    ))}
                    <button
                        className={`tab-button ${selectedRepRange === 'all' ? 'active' : ''}`}
                        onClick={() => setSelectedRepRange('all')}
                    >
                        All
                    </button>
                </div>

                <div className="pr-table-container">
                    <table className="pr-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Exercise</th>
                                <th>Rep Range</th>
                                <th>Weight</th>
                                <th>Reps</th>
                                <th>e1RM</th>
                                <th>Date Achieved</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(selectedRepRange === 'all' ? prData.allTimePRs : prData.prsByRepRange[selectedRepRange] || [])
                                .slice(0, 15)
                                .map((pr, index) => (
                                <tr key={index} className={pr.isCompoundLift ? 'compound-lift' : ''}>
                                    <td className="rank-cell">
                                        <span className="rank-number">#{index + 1}</span>
                                        {index < 3 && (
                                            <span className="medal">
                                                {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="exercise-cell">
                                        <div className="exercise-info">
                                            <span className="exercise-name">{pr.exerciseName}</span>
                                            {pr.isCompoundLift && (
                                                <span className="compound-badge">COMPOUND</span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <span 
                                            className="rep-range-badge"
                                            style={{ backgroundColor: getRepRangeColor(pr.repRange) }}
                                        >
                                            {pr.repRange}
                                        </span>
                                    </td>
                                    <td>{pr.weight} lbs</td>
                                    <td>{pr.reps}</td>
                                    <td className="e1rm-cell">
                                        <strong>{Math.round(pr.e1RM)} lbs</strong>
                                    </td>
                                    <td>{pr.achievedDate.toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PRTracker;