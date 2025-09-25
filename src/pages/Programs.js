import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Card, Button, Modal, Spinner, Accordion, Badge, Alert, Collapse, ButtonGroup } from 'react-bootstrap';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../config/supabase';
import { Trash, Star, Copy, FileText, Clock, Check, PlusCircle, Pencil, Broadcast, GraphUp, ChevronDown, ChevronUp } from 'react-bootstrap-icons';
import '../styles/Programs.css';
import { getUserPrograms, getProgramById, setCurrentProgram, deleteProgram, copyProgram, getProgramStatistics } from '../services/programService';
import { getAvailableExercises } from '../services/exerciseService';
import workoutLogService from '../services/workoutLogService';
import { transformSupabaseExercises } from '../utils/dataTransformations';
import { parseWeeklyConfigs } from '../utils/programUtils';
import { useRealtimePrograms, useRealtimeExerciseLibrary } from '../hooks/useRealtimePrograms';
import { useClientCoach } from '../hooks/useClientCoach';
import { getClientAssignedPrograms } from '../services/programService';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import ReactECharts from 'echarts-for-react';
import Select, { components } from 'react-select';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const COLORS = ['#1E88E5', '#D32F2F', '#7B1FA2', '#388E3C', '#FBC02D', '#F57C00', '#00ACC1', '#C2185B', '#00796B', '#F06292', '#616161'];

const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const CustomOption = (props) => {
  return (
    <components.Option {...props}>
      <input
        type="checkbox"
        checked={props.isSelected}
        onChange={() => null} // The click is handled by the Option component
        style={{ marginRight: '8px' }}
      />
      {props.label}
    </components.Option>
  );
};

const CustomValueContainer = (props) => {
  const { children, getValue } = props;
  const selectedCount = getValue().length;

  const handleTouchStart = (e) => {
    e.preventDefault();

    // Find and focus the select input to trigger openMenuOnFocus
    const container = e.currentTarget.closest('.select__control').parentNode;
    const hiddenInput = container.querySelector('input[type="text"]') ||
                        container.querySelector('input') ||
                        container.querySelector('[tabindex]');

    if (hiddenInput) {
      hiddenInput.focus();
    }
  };

  // Find the input component among the children
  const childArray = React.Children.toArray(children);
  const input = childArray.find(child => React.isValidElement(child) && (child.type.name === 'Input' || child.type.name === 'DummyInput'));

  if (selectedCount > 0) {
    const label = `${selectedCount} selected`;

    return (
      <components.ValueContainer
        {...props}
        onTouchStart={handleTouchStart}
        style={{
          ...props.style,
          touchAction: 'manipulation',
          cursor: 'pointer'
        }}
      >
        {label}
        {input}
      </components.ValueContainer>
    );
  }

  // When no options are selected, add touch handler to default container
  return (
    <components.ValueContainer
      {...props}
      onTouchStart={handleTouchStart}
      style={{
        ...props.style,
        touchAction: 'manipulation',
        cursor: 'pointer'
      }}
    >
      {children}
    </components.ValueContainer>
  );
};

const checkboxSelectStyles = {
  option: (provided, state) => ({
    ...provided,
    // Override background color for selected options
    backgroundColor: state.isSelected
      ? (state.isFocused ? '#f8f9fa' : 'white') // Use hover color if focused, otherwise white
      : (state.isFocused ? '#f8f9fa' : 'white'), // Standard hover color
    color: '#212529', // Standard text color
    ':active': {
      ...provided[':active'],
      backgroundColor: '#e9ecef', // Slightly darker for click feedback
    },
  }),
};

function Programs({ userRole }) {
  const [userPrograms, setUserPrograms] = useState([]);
  const [templatePrograms, setTemplatePrograms] = useState([]);
  const [coachAssignedPrograms, setCoachAssignedPrograms] = useState([]);
  const [coachClientPrograms, setCoachClientPrograms] = useState([]); // Programs assigned by the coach to clients
  const [exercises, setExercises] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [showProgramDetails, setShowProgramDetails] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [workoutLogs, setWorkoutLogs] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const [programViewTab, setProgramViewTab] = useState('personal'); // 'personal', 'coach-assigned', 'client-programs', 'templates'
  const { user, isAuthenticated } = useAuth();
  const { hasActiveCoach, coachRelationship } = useClientCoach();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Handle tab switching when coach status changes
  useEffect(() => {
    if (!hasActiveCoach && programViewTab === 'coach-assigned') {
      setProgramViewTab('personal');
    }
  }, [hasActiveCoach, programViewTab]);
  const [isLoading, setIsLoading] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const chartContainerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 767);
  const [expandedDays, setExpandedDays] = useState({});
  const [weeklyProgressView, setWeeklyProgressView] = useState('total'); // 'total' or 'groups'
  const [selectedMuscleGroups, setSelectedMuscleGroups] = useState([]);

  // Error handling states
  const [error, setError] = useState(null);
  const [programsError, setProgramsError] = useState(null);
  const [exercisesError, setExercisesError] = useState(null);

  // Real-time program updates
  const {
    programs: realtimePrograms,
    exercises: realtimeExercises,
    isConnected: isRealtimeConnected,
    lastUpdate,
    setPrograms: setRealtimePrograms,
    setExercises: setRealtimeExercises
  } = useRealtimePrograms({
    enabled: true,
    onProgramUpdate: (updateData) => {
      console.log('📋 Program updated in real-time:', updateData);
      // Handle program updates
      if (updateData.eventType === 'UPDATE' && selectedProgram && selectedProgram.id === updateData.data.id) {
        setSelectedProgram(prev => ({ ...prev, ...updateData.data }));
      }
    },
    onExerciseUpdate: (updateData) => {
      console.log('💪 Exercise updated in real-time:', updateData);
      // Refresh exercise data when exercises are updated
    },
    onProgramShared: (shareData) => {
      console.log('🔗 Program shared:', shareData);
      // Could show a notification here
    }
  });

  // Real-time exercise library updates
  const {
    newExercises,
    updatedExercises,
    clearNewExercises,
    clearUpdatedExercises
  } = useRealtimeExerciseLibrary({
    enabled: true,
    onExerciseUpdate: (updateData) => {
      console.log('💪 Exercise library updated:', updateData);
    }
  });

  // Function to handle chart resize
  const handleChartResize = () => {
    if (chartContainerRef.current) {
      // Force chart to resize by triggering a window resize event
      window.dispatchEvent(new Event('resize'));

      // Also try to find and resize any Chart.js instances
      const canvas = chartContainerRef.current.querySelector('canvas');
      if (canvas && canvas.chart) {
        canvas.chart.resize();
      }
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      console.log('🔍 [PROGRAMS_PAGE] useEffect triggered:', {
        hasUser: !!user,
        userId: user?.id,
        userEmail: user?.email,
        isAuthenticated,
        timestamp: new Date().toISOString()
      });

      if (user) {

        setIsLoading(true);
        setError(null);
        setProgramsError(null);
        setExercisesError(null);

        try {
          // Fetch all programs using optimized single database call
          try {
            console.log('🔍 [PROGRAMS_PAGE] Fetching all user programs with single optimized call:', {
              userId: user.id,
              timestamp: new Date().toISOString()
            });

            const allProgramsData = await getUserPrograms(user.id); // No template filter - fetch all programs

            console.log('📊 [PROGRAMS_PAGE] All programs fetched:', {
              totalCount: allProgramsData?.length || 0,
              data: allProgramsData
            });

            const userProgramsData = allProgramsData.filter(p => !p.is_template && !p.coach_assigned);
            const coachClientProgramsData = allProgramsData.filter(p => !p.is_template && p.coach_assigned);
            const templateProgramsData = allProgramsData.filter(p => p.is_template);

            // DEBUGGING: Log the exact data structure returned by the service
            console.log('🔍 [DEBUG] Raw service result analysis:', {
              isArray: Array.isArray(allProgramsData),
              type: typeof allProgramsData,
              isNull: allProgramsData === null,
              isUndefined: allProgramsData === undefined,
              length: allProgramsData?.length,
              firstProgram: allProgramsData?.[0] ? {
                id: allProgramsData[0].id,
                name: allProgramsData[0].name,
                isTemplate: allProgramsData[0].is_template,
                hasWeeklyConfigs: !!allProgramsData[0].weekly_configs,
                weeklyConfigsType: typeof allProgramsData[0].weekly_configs,
                weeklyConfigsKeys: allProgramsData[0].weekly_configs ? Object.keys(allProgramsData[0].weekly_configs).length : 0
              } : 'no-first-program'
            });

            // Process user programs
            const processedUserPrograms = safelyProcessPrograms(userProgramsData, 'user programs');
            console.log('🔄 [PROGRAMS_PAGE] User programs processed:', {
              originalCount: userProgramsData.length,
              processedCount: processedUserPrograms.length,
              data: processedUserPrograms
            });

            console.log('📊 [PROGRAMS_PAGE] Setting user programs state:', {
              programCount: processedUserPrograms.length,
              programIds: processedUserPrograms.map(p => ({ id: p.id, name: p.name, hasError: p.hasError }))
            });
            setUserPrograms(processedUserPrograms);

            // Process coach's client programs
            const processedCoachClientPrograms = safelyProcessPrograms(coachClientProgramsData, 'coach client programs');
            console.log('🔄 [PROGRAMS_PAGE] Coach client programs processed:', {
              originalCount: coachClientProgramsData.length,
              processedCount: processedCoachClientPrograms.length,
              data: processedCoachClientPrograms
            });
            console.log('📊 [PROGRAMS_PAGE] Setting coach client programs state:', {
              programCount: processedCoachClientPrograms.length
            });
            setCoachClientPrograms(processedCoachClientPrograms);

            // Process template programs
            const processedTemplatePrograms = safelyProcessPrograms(templateProgramsData, 'template programs');
            console.log('🔄 [PROGRAMS_PAGE] Template programs processed:', {
              originalCount: templateProgramsData.length,
              processedCount: processedTemplatePrograms.length,
              data: processedTemplatePrograms
            });

            console.log('📊 [PROGRAMS_PAGE] Setting template programs state:', {
              programCount: processedTemplatePrograms.length,
              programIds: processedTemplatePrograms.map(p => ({ id: p.id, name: p.name, hasError: p.hasError }))
            });
            setTemplatePrograms(processedTemplatePrograms);

            // Fetch coach-assigned programs if user has an active coach
            if (hasActiveCoach && coachRelationship) {
              try {
                console.log('🔍 [PROGRAMS_PAGE] Fetching coach-assigned programs:', {
                  clientId: user.id,
                  coachId: coachRelationship.coach_id,
                  timestamp: new Date().toISOString()
                });

                const coachAssignedData = await getClientAssignedPrograms(user.id, coachRelationship.coach_id);
                const processedCoachPrograms = safelyProcessPrograms(coachAssignedData, 'coach-assigned programs');
                
                console.log('📊 [PROGRAMS_PAGE] Coach-assigned programs processed:', {
                  originalCount: coachAssignedData.length,
                  processedCount: processedCoachPrograms.length,
                  data: processedCoachPrograms
                });

                setCoachAssignedPrograms(processedCoachPrograms);
              } catch (coachProgramsError) {
                console.error('❌ [PROGRAMS_PAGE] Error fetching coach-assigned programs:', coachProgramsError);
                setCoachAssignedPrograms([]);
              }
            } else {
              setCoachAssignedPrograms([]);
            }

            // Check if any programs have errors
            const allProcessedPrograms = [...processedUserPrograms, ...processedCoachClientPrograms, ...processedTemplatePrograms];
            const programsWithErrors = allProcessedPrograms.filter(p => p.hasError);
            const programsWithWarnings = allProcessedPrograms.filter(p => p.hasWarning && !p.hasError);

            if (programsWithErrors.length > 0) {
              console.warn(`⚠️ [PROGRAMS_PAGE] ${programsWithErrors.length} programs have errors:`, {
                errorPrograms: programsWithErrors.map(p => ({
                  id: p.id,
                  name: p.name,
                  isTemplate: p.is_template,
                  error: p.errorMessage
                }))
              });
            }

            if (programsWithWarnings.length > 0) {
              console.warn(`⚠️ [PROGRAMS_PAGE] ${programsWithWarnings.length} programs have warnings:`, {
                warningPrograms: programsWithWarnings.map(p => ({
                  id: p.id,
                  name: p.name,
                  isTemplate: p.is_template,
                  warning: p.warningMessage
                }))
              });
            }

          } catch (error) {
            console.error('❌ [PROGRAMS_PAGE] Error fetching programs:', {
              error: error.message,
              stack: error.stack,
              userId: user.id
            });

            // Try to fallback to cached data
            let fallbackSuccessful = false;
            try {
              console.log('🔄 [PROGRAMS_PAGE] Attempting fallback to cached data...');

              // Import cache service for fallback
              const { supabaseCache } = await import('../api/supabaseCache');

              // Try to get cached all programs data (now includes coach-assigned)
              const cachedAllPrograms = supabaseCache.get(`user_programs_all_including_coach_assigned_${user.id}`);

              if (cachedAllPrograms && Array.isArray(cachedAllPrograms)) {
                console.log('✅ [PROGRAMS_PAGE] Found cached programs data:', {
                  totalPrograms: cachedAllPrograms.length,
                  source: 'cache-fallback'
                });

                // Client-side filtering from cached data
                const cachedUserPrograms = cachedAllPrograms.filter(p => !p.is_template);
                const cachedTemplatePrograms = cachedAllPrograms.filter(p => p.is_template);

                // Process cached programs
                const processedCachedUserPrograms = safelyProcessPrograms(cachedUserPrograms, 'cached user programs');
                const processedCachedTemplatePrograms = safelyProcessPrograms(cachedTemplatePrograms, 'cached template programs');

                setUserPrograms(processedCachedUserPrograms);
                setTemplatePrograms(processedCachedTemplatePrograms);
                
                // Try to get cached coach-assigned programs if user has a coach
                if (hasActiveCoach && coachRelationship) {
                  try {
                    const cachedCoachPrograms = supabaseCache.get(`coach_assigned_programs_${user.id}_${coachRelationship.coach_id}`);
                    if (cachedCoachPrograms && Array.isArray(cachedCoachPrograms)) {
                      const processedCachedCoachPrograms = safelyProcessPrograms(cachedCoachPrograms, 'cached coach-assigned programs');
                      setCoachAssignedPrograms(processedCachedCoachPrograms);
                    } else {
                      setCoachAssignedPrograms([]);
                    }
                  } catch (coachCacheError) {
                    console.error('Failed to load cached coach programs:', coachCacheError);
                    setCoachAssignedPrograms([]);
                  }
                } else {
                  setCoachAssignedPrograms([]);
                }

                // Set warning message instead of error
                setProgramsError('Showing cached data. Some information may be outdated. Please refresh to get latest data.');
                fallbackSuccessful = true;

                console.log('✅ [PROGRAMS_PAGE] Successfully used cached data as fallback:', {
                  userPrograms: processedCachedUserPrograms.length,
                  templatePrograms: processedCachedTemplatePrograms.length,
                  coachAssignedPrograms: coachAssignedPrograms.length
                });
              }
            } catch (fallbackError) {
              console.error('❌ [PROGRAMS_PAGE] Cache fallback failed:', fallbackError);
            }

            // If fallback failed, show error and empty state
            if (!fallbackSuccessful) {
              setProgramsError('Failed to load programs. Please try refreshing the page.');
              setUserPrograms([]);
              setTemplatePrograms([]);
            }
          }

          // Fetch exercises using Supabase with error handling
          try {
            console.log('🔍 [PROGRAMS_PAGE] Fetching exercises:', {
              userId: user.id,
              timestamp: new Date().toISOString()
            });

            const fetchStartTime = performance.now();
            const exercisesData = await getAvailableExercises(user.id);
            const fetchEndTime = performance.now();
            const fetchTime = fetchEndTime - fetchStartTime;

            console.log('📊 [PROGRAMS_PAGE] Exercises fetched:', {
              exerciseCount: exercisesData?.length || 0,
              fetchTimeMs: Math.round(fetchTime * 100) / 100
            });

            const processedExercises = transformSupabaseExercises(exercisesData);

            console.log('🔄 [PROGRAMS_PAGE] Exercises processed:', {
              originalCount: exercisesData?.length || 0,
              processedCount: processedExercises.length,
              globalCount: processedExercises.filter(ex => ex.isGlobal).length,
              userCount: processedExercises.filter(ex => !ex.isGlobal).length
            });

            setExercises(processedExercises);

          } catch (error) {
            console.error('❌ [PROGRAMS_PAGE] Error fetching exercises:', {
              error: error.message,
              stack: error.stack,
              userId: user.id
            });

            // Try to fallback to cached exercises data
            let exercisesFallbackSuccessful = false;
            try {
              console.log('🔄 [PROGRAMS_PAGE] Attempting fallback to cached exercises...');

              // Import cache service for fallback
              const { supabaseCache } = await import('../api/supabaseCache');

              // Try to get cached exercises data
              const cachedExercises = supabaseCache.get(`exercises_user_${user.id}`) ||
                supabaseCache.get(`exercises_global`);

              if (cachedExercises && Array.isArray(cachedExercises)) {
                console.log('✅ [PROGRAMS_PAGE] Found cached exercises data:', {
                  exerciseCount: cachedExercises.length,
                  source: 'cache-fallback'
                });

                const processedCachedExercises = transformSupabaseExercises(cachedExercises);

                setExercises(processedCachedExercises);
                setExercisesError('Showing cached exercise data. Some information may be outdated.');
                exercisesFallbackSuccessful = true;

                console.log('✅ [PROGRAMS_PAGE] Successfully used cached exercises as fallback:', {
                  exerciseCount: processedCachedExercises.length
                });
              }
            } catch (fallbackError) {
              console.error('❌ [PROGRAMS_PAGE] Exercises cache fallback failed:', fallbackError);
            }

            // If fallback failed, show error and empty state
            if (!exercisesFallbackSuccessful) {
              setExercisesError('Failed to load exercise library. Some features may not work correctly.');
              setExercises([]);
            }
          }

        } catch (error) {
          console.error("Error in fetchData: ", error);

          // Try one final fallback attempt for critical data
          try {
            console.log('🔄 [PROGRAMS_PAGE] Final fallback attempt...');
            const { supabaseCache } = await import('../api/supabaseCache');

            const cachedPrograms = supabaseCache.get(`user_programs_all_including_coach_assigned_${user.id}`);
            const cachedExercises = supabaseCache.get(`exercises_user_${user.id}`) ||
              supabaseCache.get(`exercises_global`);

            if (cachedPrograms || cachedExercises) {
              console.log('✅ [PROGRAMS_PAGE] Final fallback found some cached data');

              if (cachedPrograms) {
                const userProgramsData = cachedPrograms.filter(p => !p.is_template);
                const templateProgramsData = cachedPrograms.filter(p => p.is_template);
                setUserPrograms(safelyProcessPrograms(userProgramsData, 'fallback user programs'));
                setTemplatePrograms(safelyProcessPrograms(templateProgramsData, 'fallback template programs'));
                
                // Try to get cached coach-assigned programs
                if (hasActiveCoach && coachRelationship) {
                  try {
                    const cachedCoachPrograms = supabaseCache.get(`coach_assigned_programs_${user.id}_${coachRelationship.coach_id}`);
                    if (cachedCoachPrograms && Array.isArray(cachedCoachPrograms)) {
                      setCoachAssignedPrograms(safelyProcessPrograms(cachedCoachPrograms, 'fallback coach-assigned programs'));
                    } else {
                      setCoachAssignedPrograms([]);
                    }
                  } catch (coachCacheError) {
                    setCoachAssignedPrograms([]);
                  }
                } else {
                  setCoachAssignedPrograms([]);
                }
                
                setProgramsError('Showing cached program data. Please refresh for latest information.');
              }

              if (cachedExercises) {
                const processedExercises = transformSupabaseExercises(cachedExercises);
                setExercises(processedExercises);
                setExercisesError('Showing cached exercise data. Please refresh for latest information.');
              }

              // Don't set the main error if we have some cached data
              if (!cachedPrograms && !cachedExercises) {
                setError('Failed to load program data. Please try refreshing the page.');
              }
            } else {
              setError('Failed to load program data. Please try refreshing the page.');
            }
          } catch (fallbackError) {
            console.error('❌ [PROGRAMS_PAGE] Final fallback failed:', fallbackError);
            setError('Failed to load program data. Please try refreshing the page.');
          }
        } finally {
          setIsLoading(false);
        }
      } else {
        console.log('🔍 [PROGRAMS_PAGE] No user found, skipping data fetch:', {
          hasUser: !!user,
          isAuthenticated,
          timestamp: new Date().toISOString()
        });
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user, setRealtimePrograms, setRealtimeExercises, hasActiveCoach, coachRelationship]);

  const getExerciseName = (exerciseId) => {
    return exercises.find(ex => ex.id === exerciseId)?.name || 'Unknown';
  };

  // Function to calculate planned weekly sets data for the chart
  const calculatePlannedWeeklySets = (program = selectedProgram) => {
    if (!program || !program.weeklyConfigs) return [];

    const weeklySets = [];
    program.weeklyConfigs.forEach((week, weekIndex) => {
      let totalSets = 0;
      const muscleSets = {};
      week.forEach(day => {
        if (day.exercises) {
          day.exercises.forEach(ex => {
            const sets = ex.sets || 0;
            totalSets += sets;
            const exercise = exercises.find(e => e.id === ex.exerciseId);
            if (exercise) {
              const group = exercise.primary_muscle_group || exercise.primaryMuscleGroup || 'Other';
              muscleSets[group] = (muscleSets[group] || 0) + sets;
            }
          });
        }
      });
      weeklySets.push({
        week: weekIndex + 1,
        totalSets,
        ...muscleSets
      });
    });
    return weeklySets;
  };

  // Helper function to safely process programs with error handling
  const safelyProcessPrograms = (programs, context = 'programs') => {
    const startTime = performance.now();

    if (!Array.isArray(programs)) {
      console.error(`❌ [PROGRAM_PROCESSING] Invalid ${context} data - not an array:`, {
        programs,
        type: typeof programs,
        isNull: programs === null,
        isUndefined: programs === undefined
      });
      return [];
    }

    const processedPrograms = programs.map((program, index) => {
      const programStartTime = performance.now();

      console.log(`📋 [PROGRAM_PROCESSING] Processing program ${index + 1}/${programs.length}:`, {
        programId: program?.id,
        programName: program?.name,
        context
      });

      try {
        // Validate program structure
        if (!program || typeof program !== 'object') {
          console.error(`❌ [PROGRAM_PROCESSING] Invalid program object in ${context}:`, {
            program,
            index,
            type: typeof program
          });
          return {
            ...program,
            weeklyConfigs: [],
            hasError: true,
            errorMessage: 'Invalid program data'
          };
        }

        // Check for missing weekly_configs
        if (!program.weekly_configs || typeof program.weekly_configs !== 'object') {
          console.warn(`⚠️ [PROGRAM_PROCESSING] Program "${program.name}" has missing or invalid weekly_configs:`, {
            programId: program.id,
            hasWeeklyConfigs: !!program.weekly_configs,
            weeklyConfigsType: typeof program.weekly_configs,
            weeklyConfigsValue: program.weekly_configs,
            context
          });
          return {
            ...program,
            weeklyConfigs: [],
            hasError: true,
            errorMessage: 'Program has no workout data'
          };
        }

        // Check if weekly_configs is empty
        const weeklyConfigsKeys = Object.keys(program.weekly_configs);
        if (weeklyConfigsKeys.length === 0) {
          console.warn(`⚠️ [PROGRAM_PROCESSING] Program "${program.name}" has empty weekly_configs:`, {
            programId: program.id,
            weeklyConfigsKeys,
            context
          });
          return {
            ...program,
            weeklyConfigs: [],
            hasError: true,
            errorMessage: 'Program has no workout data'
          };
        }

        // Validate duration and days_per_week
        if (!program.duration || !program.days_per_week || program.duration < 1 || program.days_per_week < 1) {
          console.error(`❌ [PROGRAM_PROCESSING] Program "${program.name}" has invalid duration or days_per_week:`, {
            programId: program.id,
            duration: program.duration,
            days_per_week: program.days_per_week,
            durationValid: program.duration >= 1,
            daysPerWeekValid: program.days_per_week >= 1,
            context
          });
          return {
            ...program,
            weeklyConfigs: [],
            hasError: true,
            errorMessage: 'Program has invalid structure'
          };
        }

        // console.log(`🔄 [PROGRAM_PROCESSING] Parsing weekly configs for "${program.name}":`, {
        //   programId: program.id,
        //   weeklyConfigsKeys: weeklyConfigsKeys.length,
        //   duration: program.duration,
        //   daysPerWeek: program.days_per_week,
        //   sampleKeys: weeklyConfigsKeys.slice(0, 3),
        //   weeklyConfigsStructure: program.weekly_configs
        // });

        // Safely parse weekly configs
        const parseStartTime = performance.now();
        const weeklyConfigs = parseWeeklyConfigs(program.weekly_configs, program.duration, program.days_per_week);
        const parseEndTime = performance.now();
        const parseTime = parseEndTime - parseStartTime;

        console.log(`📊 [PROGRAM_PROCESSING] Weekly configs parsed:`, {
          programId: program.id,
          parseTimeMs: Math.round(parseTime * 100) / 100,
          resultLength: weeklyConfigs?.length || 0,
          success: !!weeklyConfigs
        });

        // Check if parsing resulted in empty configs
        if (!weeklyConfigs || weeklyConfigs.length === 0) {
          console.error(`❌ [PROGRAM_PROCESSING] Failed to parse weekly configs for program "${program.name}":`, {
            programId: program.id,
            weeklyConfigs,
            originalWeeklyConfigs: program.weekly_configs,
            context
          });
          return {
            ...program,
            weeklyConfigs: [],
            hasError: true,
            errorMessage: 'Failed to load workout data'
          };
        }

        // Check if any weeks have empty days
        const emptyWeeksCheck = weeklyConfigs.map((week, weekIndex) => {
          const isEmpty = !Array.isArray(week) || week.length === 0 ||
            week.every(day => !day.exercises || day.exercises.length === 0);

          if (isEmpty) {
            console.warn(`⚠️ [PROGRAM_PROCESSING] Week ${weekIndex + 1} is empty for program "${program.name}"`);
          }

          return { weekIndex: weekIndex + 1, isEmpty, dayCount: week?.length || 0 };
        });

        const hasEmptyWeeks = emptyWeeksCheck.some(week => week.isEmpty);

        if (hasEmptyWeeks) {
          console.warn(`⚠️ [PROGRAM_PROCESSING] Program "${program.name}" has weeks with no exercises:`, {
            programId: program.id,
            emptyWeeksCheck,
            context
          });
          return {
            ...program,
            weeklyConfigs,
            hasWarning: true,
            warningMessage: 'Some weeks may have incomplete workout data'
          };
        }

        const programEndTime = performance.now();
        const programProcessTime = programEndTime - programStartTime;

        // Successfully processed program
        console.log(`✅ [PROGRAM_PROCESSING] Program "${program.name}" processed successfully:`, {
          programId: program.id,
          weekCount: weeklyConfigs.length,
          processTimeMs: Math.round(programProcessTime * 100) / 100,
          context
        });

        return {
          ...program,
          weeklyConfigs,
          hasError: false
        };

      } catch (error) {
        const programEndTime = performance.now();
        const programProcessTime = programEndTime - programStartTime;

        console.error(`💥 [PROGRAM_PROCESSING] Error processing program in ${context}:`, {
          error: error.message,
          stack: error.stack,
          program,
          index,
          processTimeMs: Math.round(programProcessTime * 100) / 100,
          context
        });

        return {
          ...program,
          weeklyConfigs: [],
          hasError: true,
          errorMessage: 'Error loading program data'
        };
      }
    });

    const endTime = performance.now();
    const totalProcessTime = endTime - startTime;

    const successCount = processedPrograms.filter(p => !p.hasError).length;
    const errorCount = processedPrograms.filter(p => p.hasError).length;
    const warningCount = processedPrograms.filter(p => p.hasWarning && !p.hasError).length;

    console.log(`🎯 [PROGRAM_PROCESSING] Completed processing ${context}:`, {
      totalPrograms: programs.length,
      successCount,
      errorCount,
      warningCount,
      totalProcessTimeMs: Math.round(totalProcessTime * 100) / 100,
      averageProcessTimeMs: programs.length ? Math.round((totalProcessTime / programs.length) * 100) / 100 : 0,
      context
    });

    return processedPrograms;
  };

  const adoptProgram = async (program) => {
    if (!user) return;
    try {
      const newProgramData = {
        user_id: user.id,
        is_template: false,
        name: `${program.name} (Adopted)`,
        duration: program.duration,
        days_per_week: program.days_per_week,
        weight_unit: program.weight_unit || 'LB',
        weekly_configs: program.weekly_configs,
        is_current: false,
        is_active: true,
        completed_weeks: 0
      };

      await copyProgram(program.id, newProgramData, user.id);

      // Refresh programs list using optimized single call
      const allPrograms = await getUserPrograms(user.id);
      const updatedUserPrograms = allPrograms.filter(p => !p.is_template);
      setUserPrograms(updatedUserPrograms);

      alert('Program adopted successfully!');
    } catch (error) {
      console.error("Error adopting program: ", error);
      alert('Failed to adopt program');
    }
  };

  const handleDeleteProgram = async (programId) => {
    if (!window.confirm('Are you sure you want to delete this program?')) return;

    setIsDeleting(true);
    try {
      await deleteProgram(programId, user.id);

      // Refresh programs list using optimized single call
      const allPrograms = await getUserPrograms(user.id);
      const updatedUserPrograms = allPrograms.filter(p => !p.is_template);
      const updatedTemplatePrograms = allPrograms.filter(p => p.is_template);

      setUserPrograms(updatedUserPrograms);
      setTemplatePrograms(updatedTemplatePrograms);

      alert('Program deleted successfully!');
    } catch (error) {
      console.error("Error deleting program: ", error);
      alert('Failed to delete program');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetCurrentProgram = async (programId) => {
    if (!user) return;

    // Find the program being set as current for better user feedback
    const targetProgram = userPrograms.find(p => p.id === programId);
    const programName = targetProgram?.name || 'Selected program';

    try {
      console.log('🎯 Setting program as current:', {
        programId,
        programName,
        userId: user.id
      });

      await setCurrentProgram(programId, user.id);

      console.log('✅ Program set as current successfully, refreshing program list');

      // Refresh programs list using optimized single call to ensure data consistency
      const allPrograms = await getUserPrograms(user.id);
      const updatedUserPrograms = safelyProcessPrograms(allPrograms.filter(p => !p.is_template && !p.coach_assigned), 'updated user programs');
      const updatedCoachAssignedPrograms = safelyProcessPrograms(allPrograms.filter(p => p.coach_assigned), 'updated coach-assigned programs');
      const updatedTemplatePrograms = safelyProcessPrograms(allPrograms.filter(p => p.is_template), 'updated template programs');

      setUserPrograms(updatedUserPrograms);
      setCoachAssignedPrograms(updatedCoachAssignedPrograms);
      setTemplatePrograms(updatedTemplatePrograms);

      // Show success message with program name
      alert(`"${programName}" has been set as your current program!`);
      
      console.log('🎯 Current program updated successfully:', {
        newCurrentProgram: updatedUserPrograms.find(p => p.is_current)?.name || 'None',
        totalPrograms: updatedUserPrograms.length
      });

    } catch (error) {
      console.error("❌ Error setting current program:", {
        error: error.message,
        programId,
        programName,
        userId: user.id
      });
      
      // Show more specific error message
      const errorMessage = error.message.includes('Failed to') 
        ? `Failed to set "${programName}" as current program. Please try again.`
        : `Unable to set "${programName}" as current program. Please check your connection and try again.`;
      
      alert(errorMessage);
    }
  };

  const fetchWorkoutLogs = async (program) => {
    if (!user) return {};

    try {
      // Fetch workout logs using Supabase
      const { data: logsData, error } = await supabase
        .from('workout_logs')
        .select(`
          *,
          workout_log_exercises (
            *,
            exercises (
              id,
              name
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('program_id', program.id);

      if (error) throw error;

      const logs = {};
      logsData.forEach(log => {
        const key = `week${(log.week_index || 0) + 1}_day${(log.day_index || 0) + 1}`;

        if (!logs[key]) {
          logs[key] = {
            exercises: {},
            isWorkoutFinished: log.is_finished || false,
            completedDate: log.completed_date || null
          };
        }

        (log.workout_log_exercises || []).forEach(ex => {
          logs[key].exercises[ex.exercise_id] = {
            exerciseId: ex.exercise_id,
            sets: ex.sets,
            reps: ex.reps,
            weights: ex.weights,
            completed: ex.completed
          };
        });
      });

      return logs;
    } catch (error) {
      console.error("Error fetching workout logs: ", error);
      return {};
    }
  };

  const viewProgramDetails = async (program) => {
    setSelectedProgram(program);

    // Fetch workout logs when viewing program details
    const logs = await fetchWorkoutLogs(program);
    setWorkoutLogs(logs);

    setShowProgramDetails(true);
  };

  // Handle URL parameter for opening specific program
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const programId = searchParams.get('programId');

    // Only process if we have a programId and programs are loaded (not during initial loading)
    if (programId && !isLoading && (userPrograms.length > 0 || templatePrograms.length > 0)) {
      // Find the program in either user programs or template programs
      const allPrograms = [...userPrograms, ...templatePrograms];
      const targetProgram = allPrograms.find(p => p.id === programId);

      if (targetProgram) {
        console.log('🔗 Opening program from URL parameter:', {
          programId,
          programName: targetProgram.name
        });
        viewProgramDetails(targetProgram);
      } else {
        console.warn('⚠️ Program not found for URL parameter:', { programId });
      }

      // Always clean up URL parameter after processing (whether found or not)
      const newSearchParams = new URLSearchParams(location.search);
      newSearchParams.delete('programId');
      const newSearch = newSearchParams.toString();
      const newPath = location.pathname + (newSearch ? `?${newSearch}` : '');
      navigate(newPath, { replace: true });
    }
  }, [userPrograms, templatePrograms, location.search, navigate, isLoading]);

  const renderWorkoutLogs = (exercise, weekKey) => {
    const log = workoutLogs[weekKey]?.exercises?.[exercise.exerciseId];

    if (!log) {
      return null;
    }

    return (
      <div className="workout-log-details mt-2">
        {log.sets && log.reps && log.weights && (
          <div className="sets-container">
            {Array.from({ length: log.sets }).map((_, index) => (
              <div key={index} className="set-item p-2 bg-light rounded mb-2">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <strong>Set {index + 1}:</strong>
                    <span className="ms-2">
                      {log.reps[index]} reps @ {log.weights[index] || 'N/A'} {selectedProgram.weight_unit || 'LB'}
                    </span>
                  </div>
                  {log.completed?.[index] && <Check className="text-success" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleEditProgram = (programId) => {
    navigate(`/edit-program/${programId}`);
  };

  const renderActionButtons = (program, isTemplate, isCoachAssigned = false) => {
    const hasWorkoutData = !program.hasError && program.weeklyConfigs && program.weeklyConfigs.length > 0;

    if (isMobile) {
      return (
        <div className="d-flex flex-column gap-2 w-100">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => viewProgramDetails(program)}
            className="w-100"
            disabled={program.hasError && program.errorMessage === 'Invalid program data'}
          >
            <FileText className="me-1" /> Details
          </Button>
          {/* Coach-assigned programs have limited actions */}
          {isCoachAssigned ? (
            <>
              {!program.is_current && hasWorkoutData && (
                <Button
                  variant="outline-success"
                  size="sm"
                  onClick={() => handleSetCurrentProgram(program.id)}
                  className="w-100"
                  title="Set this coach-assigned program as your current active program"
                >
                  <Clock className="me-1" /> Set Current
                </Button>
              )}
            </>
          ) : (
            /* Allow edit for admin on template programs */
            (!isTemplate || userRole === 'admin') ? (
              <>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => handleEditProgram(program.id)}
                  className="w-100"
                >
                  <Pencil className="me-1" /> Edit
                </Button>
                {!isTemplate && !program.coach_assigned && !program.is_current && hasWorkoutData && (
                    <Button
                      variant="outline-success"
                      size="sm"
                      onClick={() => handleSetCurrentProgram(program.id)}
                      className="w-100"
                      title="Set this program as your current active program"
                    >
                      <Clock className="me-1" /> Set Current
                    </Button>
                )}
                {!isTemplate && (
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleDeleteProgram(program.id)}
                    disabled={isDeleting}
                    className="w-100"
                  >
                    <Trash className="me-1" /> Delete
                  </Button>
                )}
                {isTemplate && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => adoptProgram(program)}
                    className="w-100"
                    disabled={program.hasError}
                    title={program.hasError ? 'Cannot adopt - program has errors' : ''}
                  >
                    <Copy className="me-1" /> Adopt
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => adoptProgram(program)}
                className="w-100"
              >
                <Copy className="me-1" /> Adopt
              </Button>
            )
          )}
        </div>
      );
    }
    // Desktop layout
    return (
      <div className="d-flex gap-2">
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => viewProgramDetails(program)}
          disabled={program.hasError && program.errorMessage === 'Invalid program data'}
        >
          <FileText className="me-1" /> Details
        </Button>
        {/* Coach-assigned programs have limited actions */}
        {isCoachAssigned ? (
          <>
            {!program.is_current && hasWorkoutData && (
              <Button
                variant="outline-success"
                size="sm"
                onClick={() => handleSetCurrentProgram(program.id)}
                title="Set this coach-assigned program as your current active program"
              >
                <Clock className="me-1" /> Set Current
              </Button>
            )}
          </>
        ) : (
          /* Allow edit for admin on template programs */
          (!isTemplate || userRole === 'admin') ? (
            <>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => handleEditProgram(program.id)}
              >
                <Pencil className="me-1" /> Edit
              </Button>
              {!isTemplate && !program.coach_assigned && !program.is_current && hasWorkoutData && (
                  <Button
                    variant="outline-success"
                    size="sm"
                    onClick={() => handleSetCurrentProgram(program.id)}
                    title="Set this program as your current active program"
                  >
                    <Clock className="me-1" /> Set Current
                  </Button>
              )}
              {!isTemplate && (
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => handleDeleteProgram(program.id)}
                  disabled={isDeleting}
                >
                  <Trash className="me-1" /> Delete
                </Button>
              )}
              {isTemplate && (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => adoptProgram(program)}
                  disabled={program.hasError}
                  title={program.hasError ? 'Cannot adopt - program has errors' : ''}
                >
                  <Copy className="me-1" /> Adopt
                </Button>
              )}
            </>
          ) : (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => adoptProgram(program)}
              disabled={program.hasError}
              title={program.hasError ? 'Cannot adopt - program has errors' : ''}
            >
              <Copy className="me-1" /> Adopt
            </Button>
          )
        )}
      </div>
    );
  };

  const renderProgramCard = (program, isTemplate = false, isCoachAssigned = false) => {
    return (
      <Card key={program.id} className={`mb-3 program-card ${program.hasError ? 'border-warning' : ''} ${program.is_current && !isTemplate ? 'border-primary current-program' : ''} ${isCoachAssigned ? 'border-success' : ''}`}>
        <Card.Body>
          <div className="d-flex justify-content-between align-items-start">
            <div className="flex-grow-1">
              <Card.Title className="d-flex align-items-center flex-wrap">
                {program.name}
                {program.is_current && !isTemplate && (
                  <Badge bg="primary" className="ms-2" title="This is your current active program">
                    Current
                  </Badge>
                )}
                {isCoachAssigned && (
                  <Badge bg="success" className="ms-2" title="Assigned by your coach">
                    Coach Assigned
                  </Badge>
                )}
                {program.coach_assigned && !isCoachAssigned && (
                  <Badge bg="dark" className="ms-2" title={program.client ? `Assigned to ${program.client.name}` : 'Assigned to a client'}>
                    Client Program
                  </Badge>
                )}
                {isTemplate && (
                  <Badge bg="secondary" className="ms-2" title="Community template program">
                    Template
                  </Badge>
                )}
                {!isTemplate && !program.coach_assigned && (
                  <Badge bg="info" className="ms-2" title="Your personal program">
                    Personal
                  </Badge>
                )}
              </Card.Title>
              <Card.Subtitle className="text-muted mb-2">
                {program.duration} weeks | {program.days_per_week} days/week
                {program.is_current && !isTemplate && (
                  <span className="text-primary ms-2">• Active Program</span>
                )}
                {isCoachAssigned && program.coach && (
                  <span className="text-success ms-2">• By {program.coach.name}</span>
                )}
                {program.coach_assigned && !isCoachAssigned && program.client && (
                  <span className="text-info ms-2">• For {program.client.name}</span>
                )}
              </Card.Subtitle>
              
              {/* Coach assignment details */}
              {program.coach_assigned && (
                <div className="mb-2">
                  {!isCoachAssigned && program.client && (
                    <small className="text-muted d-block"><strong>Assigned to:</strong> {program.client.name}</small>
                  )}
                  {program.coach_notes && (
                    <small className="text-muted d-block">
                      <strong>Coach Notes:</strong> {program.coach_notes}
                    </small>
                  )}
                  {program.client_goals && program.client_goals.length > 0 && (
                    <small className="text-muted d-block">
                      <strong>Goals:</strong> {program.client_goals.join(', ')}
                    </small>
                  )}
                  {program.program_difficulty && (
                    <small className="text-muted d-block">
                      <strong>Difficulty:</strong> {program.program_difficulty.charAt(0).toUpperCase() + program.program_difficulty.slice(1)}
                    </small>
                  )}
                  {program.assigned_at && (
                    <small className="text-muted d-block">
                      <strong>Assigned:</strong> {new Date(program.assigned_at).toLocaleDateString()}
                    </small>
                  )}
                </div>
              )}

              {/* Show error/warning messages */}
              {/* {program.hasError && (
                <Alert variant="warning" className="mb-2 py-2">
                  <small>
                    <strong>Issue:</strong> {program.errorMessage}
                    {program.errorMessage === 'Program has no workout data' && (
                      <span> - This program may need to be recreated or edited to add workout details.</span>
                    )}
                  </small>
                </Alert>
              )} */}

              {/* {program.hasWarning && !program.hasError && (
                <Alert variant="info" className="mb-2 py-2">
                  <small>
                    <strong>Note:</strong> {program.warningMessage}
                  </small>
                </Alert>
              )} */}
            </div>
            {/* {program.is_current && !isTemplate && (
              <div className="d-flex align-items-center">
                <Star className="text-warning me-1" size={20} fill="currentColor" />
                <small className="text-primary fw-bold">CURRENT</small>
              </div>
            )} */}
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3">
            {renderActionButtons(program, isTemplate, isCoachAssigned)}
          </div>
        </Card.Body>
      </Card>
    );
  };

  // Enhanced Program Details Modal (from Claude)
  const renderProgramDetailsModal = () => {
    if (!selectedProgram) return null;

    // Handle programs with errors in the details modal
    if (selectedProgram.hasError) {
      return (
        <Modal
          show={showProgramDetails}
          onHide={() => {
            setShowProgramDetails(false);
            setActiveTab('overview');
          }}
          size={isMobile ? "fullscreen" : "lg"}
          centered={!isMobile}
        >
          <Modal.Header closeButton>
            <Modal.Title>{selectedProgram.name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="warning">
              <Alert.Heading>Program Issue</Alert.Heading>
              <p>{selectedProgram.errorMessage}</p>
              {selectedProgram.errorMessage === 'Program has no workout data' && (
                <div>
                  <p>This program doesn't have any workout data associated with it. This could happen if:</p>
                  <ul>
                    <li>The program was created but never had workouts added</li>
                    <li>There was an issue during program creation</li>
                    <li>The workout data was corrupted or lost</li>
                  </ul>
                  <p>You can try editing this program to add workout data, or create a new program instead.</p>
                </div>
              )}
              <div className="mt-3">
                <Button
                  variant="primary"
                  onClick={() => handleEditProgram(selectedProgram.id)}
                  className="me-2"
                >
                  Edit Program
                </Button>
                <Button
                  variant="outline-secondary"
                  onClick={() => setShowProgramDetails(false)}
                >
                  Close
                </Button>
              </div>
            </Alert>
          </Modal.Body>
        </Modal>
      );
    }

    // Calculate overall program progress
    const calculateProgramProgress = () => {
      let totalWorkouts = 0;
      let completedWorkouts = 0;

      selectedProgram.weeklyConfigs.forEach((week, weekIndex) => {
        week.forEach((day, dayIndex) => {
          const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
          totalWorkouts++;
          if (workoutLogs[weekKey]?.isWorkoutFinished) {
            completedWorkouts++;
          }
        });
      });

      return {
        totalWorkouts,
        completedWorkouts,
        percentage: Math.round((completedWorkouts / totalWorkouts) * 100)
      };
    };

    // Calculate weekly progress breakdown
    const calculateWeeklyProgress = () => {
      const weeklyProgress = [];

      selectedProgram.weeklyConfigs.forEach((week, weekIndex) => {
        let totalDays = week.length;
        let completedDays = 0;

        week.forEach((day, dayIndex) => {
          const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
          if (workoutLogs[weekKey]?.isWorkoutFinished) {
            completedDays++;
          }
        });

        weeklyProgress.push({
          week: weekIndex + 1,
          totalDays,
          completedDays,
          percentage: Math.round((completedDays / totalDays) * 100)
        });
      });

      return weeklyProgress;
    };

    // Fixed calculateExerciseMetrics function with proper date handling and bodyweight support
    const calculateExerciseMetrics = () => {
      const exerciseMetrics = {};

      // Collect all exercise data from logs
      Object.keys(workoutLogs).forEach(weekKey => {
        if (workoutLogs[weekKey]?.exercises) {
          const logEntry = workoutLogs[weekKey];

          // Get completion date - this should be stored when workout is completed
          const completionDate = logEntry.completedDate ?
            new Date(logEntry.completedDate) :
            null;

          Object.keys(logEntry.exercises).forEach(exerciseId => {
            const exerciseLog = logEntry.exercises[exerciseId];
            const exercise = exercises.find(e => e.id === exerciseId);
            const exerciseType = exercise?.exercise_type || '';

            if (!exerciseMetrics[exerciseId]) {
              exerciseMetrics[exerciseId] = {
                name: getExerciseName(exerciseId),
                exercise_type: exerciseType,
                sessions: [],
                maxWeight: 0,
                totalVolume: 0,
                progressTrend: []
              };
            }

            if (exerciseLog.weights && exerciseLog.reps) {
              // Calculate weights and volume based on exercise type (only for completed sets)
              let sessionMaxWeight = 0;
              let sessionVolume = 0;
              const calculatedWeights = [];

              exerciseLog.weights.forEach((weight, idx) => {
                // Only process completed sets
                if (!exerciseLog.completed?.[idx]) return;

                const weightValue = parseFloat(weight) || 0;
                const repsValue = exerciseLog.reps[idx] || 0;
                const bodyweightValue = exerciseLog.bodyweight ? parseFloat(exerciseLog.bodyweight) : 0;

                let totalWeight = weightValue;
                let displayWeight = weightValue;

                // Calculate total weight based on exercise type
                if (exerciseType === 'Bodyweight') {
                  totalWeight = bodyweightValue;
                  displayWeight = bodyweightValue;
                } else if (exerciseType === 'Bodyweight Loadable' && bodyweightValue > 0) {
                  totalWeight = bodyweightValue + weightValue;
                  displayWeight = totalWeight;
                }

                calculatedWeights.push({
                  weight: weightValue,
                  totalWeight: totalWeight,
                  displayWeight: displayWeight,
                  reps: repsValue,
                  bodyweight: bodyweightValue
                });

                // Update session max weight and volume
                if (totalWeight > sessionMaxWeight) {
                  sessionMaxWeight = totalWeight;
                }
                sessionVolume += totalWeight * repsValue;
              });

              // Extract week and day from the key (week1_day1)
              const [weekPart, dayPart] = weekKey.split('_');
              const weekNum = parseInt(weekPart.replace('week', ''));
              const dayNum = parseInt(dayPart.replace('day', ''));

              // Only add session if there are completed sets
              if (calculatedWeights.length > 0) {
                exerciseMetrics[exerciseId].sessions.push({
                  weekNum,
                  dayNum,
                  weights: calculatedWeights,
                  reps: exerciseLog.reps,
                  maxWeight: sessionMaxWeight,
                  volume: sessionVolume,
                  completionDate: completionDate,
                  weekKey: weekKey,
                  bodyweight: exerciseLog.bodyweight
                });

                exerciseMetrics[exerciseId].maxWeight = Math.max(exerciseMetrics[exerciseId].maxWeight, sessionMaxWeight);
                exerciseMetrics[exerciseId].totalVolume += sessionVolume;
              }
            }
          });
        }
      });

      // Process each exercise's sessions
      Object.values(exerciseMetrics).forEach(exercise => {
        // Sort sessions by actual completion date if available, otherwise by week/day
        exercise.sessions.sort((a, b) => {
          if (a.completionDate && b.completionDate) {
            return a.completionDate - b.completionDate; // Sort by actual date
          }
          // Fallback to week/day sorting
          if (a.weekNum !== b.weekNum) return a.weekNum - b.weekNum;
          return a.dayNum - b.dayNum;
        });

        // Create progress trend based on chronological order
        exercise.progressTrend = exercise.sessions.map((session, index) => ({
          session: index + 1,
          maxWeight: session.maxWeight,
          volume: session.volume,
          date: session.completionDate,
          label: session.completionDate ?
            session.completionDate.toLocaleDateString() :
            `Week ${session.weekNum}, Day ${session.dayNum}`
        }));
      });

      // Sort by total volume
      return Object.values(exerciseMetrics).sort((a, b) => b.totalVolume - a.totalVolume);
    };

    const progress = calculateProgramProgress();
    const weeklyProgress = calculateWeeklyProgress();
    const exerciseMetrics = calculateExerciseMetrics();

    const weeklySetsData = calculatePlannedWeeklySets();

    // Get all muscle groups for select options
    const allMuscleGroups = new Set();
    weeklySetsData.forEach(week => {
      Object.keys(week).forEach(key => {
        if (key !== 'week' && key !== 'totalSets') {
          allMuscleGroups.add(key);
        }
      });
    });
    const muscleGroupOptions = Array.from(allMuscleGroups).map(group => ({ value: group, label: group }));

    // Generate ECharts options for weekly progress chart
    const getWeeklyProgressChartOption = () => {
      const series = [];
      if (weeklyProgressView === 'total') {
        series.push({
          name: 'Total Sets',
          type: 'line',
          smooth: true,
          data: weeklySetsData.map(d => d.totalSets),
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0, color: 'rgba(30, 64, 175, 0.3)'
              }, {
                offset: 1, color: 'rgba(30, 64, 175, 0.1)'
              }]
            }
          },
          itemStyle: {
            color: '#1e40af'
          },
          emphasis: {
            focus: 'series'
          }
        });
      } else {
        const selectedGroups = selectedMuscleGroups.length > 0 ? selectedMuscleGroups.map(g => g.value) : Array.from(allMuscleGroups);
        selectedGroups.forEach((group, index) => {
          series.push({
            name: group,
            type: 'line',
            smooth: true,
            data: weeklySetsData.map(d => d[group] || 0),
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [{
                  offset: 0, color: hexToRgba(COLORS[index % COLORS.length], 0.3)
                }, {
                  offset: 1, color: hexToRgba(COLORS[index % COLORS.length], 0.1)
                }]
              }
            },
            itemStyle: {
              color: COLORS[index % COLORS.length]
            },
            emphasis: {
              focus: 'series'
            }
          });
        });
      }

      return {
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            let result = `Week ${params[0].name}<br/>`;
            params.forEach(param => {
              result += `${param.seriesName}: ${param.value} sets<br/>`;
            });
            return result;
          }
        },
        legend: {
          data: series.map(s => s.name),
          bottom: /*weeklyProgressView === 'groups' ? 30 :*/ 0,
          show: weeklyProgressView === 'groups'
        },
        grid: {
          top: 10,
          right: 30,
          left: 20,
          bottom: weeklyProgressView === 'groups' ? 70 : 20
        },
        xAxis: {
          type: 'category',
          data: weeklySetsData.map(d => `Week ${d.week}`),
          axisLabel: {
            rotate: 0 //weeklyProgressView === 'groups' ? 45 : 0
          }
        },
        yAxis: {
          type: 'value',
          name: 'Sets'
        },
        series
      };
    };

    // Find current week based on completion status
    const getCurrentWeekIndex = () => {
      for (let weekIndex = 0; weekIndex < selectedProgram.weeklyConfigs.length; weekIndex++) {
        const week = selectedProgram.weeklyConfigs[weekIndex];
        let isWeekCompleted = true;

        for (let dayIndex = 0; dayIndex < week.length; dayIndex++) {
          const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
          if (!workoutLogs[weekKey]?.isWorkoutFinished) {
            isWeekCompleted = false;
            break;
          }
        }

        if (!isWeekCompleted) {
          return weekIndex;
        }
      }

      // If all weeks are completed, return the last week
      return selectedProgram.weeklyConfigs.length - 1;
    };

    const currentWeekIndex = getCurrentWeekIndex();

    const isProgramComplete = (program, workoutLogs) => {
      // Check if all weeks and days have been completed
      for (let weekIndex = 0; weekIndex < program.weeklyConfigs.length; weekIndex++) {
        const week = program.weeklyConfigs[weekIndex];
        for (let dayIndex = 0; dayIndex < week.length; dayIndex++) {
          const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
          // If any workout is not marked as finished, program is not complete
          if (!workoutLogs[weekKey]?.isWorkoutFinished) {
            return false;
          }
        }
      }
      return true;
    };

    const programComplete = isProgramComplete(selectedProgram, workoutLogs);

    return (
      <Modal
        show={showProgramDetails}
        onHide={() => {
          setShowProgramDetails(false);
          setActiveTab('overview');
        }}
        size={isMobile ? "fullscreen" : "lg"}
        centered={!isMobile}
        dialogClassName="program-details-modal"
      >
        <Modal.Header closeButton className="border-bottom-0 pb-0">
          <Modal.Title className="d-flex align-items-center">
            <div>
              <h4 className="mb-0">{selectedProgram.name}</h4>
              <div className="text-muted small">
                {selectedProgram.duration} weeks | {selectedProgram.days_per_week} days per week | {selectedProgram.weight_unit || 'LB'}
              </div>
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-0">
          {/* Program Progress Summary */}
          <div className="program-progress-summary card shadow-sm mb-4">
            <div className="card-body">
              <div className="row align-items-center">
                <div className="col-md-3 text-center">
                  <div className="progress-circle-container">
                    <div className="progress-circle" style={{ width: '120px', height: '120px' }}>
                      <svg viewBox="0 0 36 36" className="circular-chart">
                        <path
                          className="circle-bg"
                          d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="circle"
                          strokeDasharray={`${progress.percentage}, 100`}
                          d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="progress-percentage">{progress.percentage}%</div>
                    </div>
                    <div className="mt-2 text-center">
                      <strong>
                        {(() => {
                          // if (programComplete) {
                          //   return (
                          //     <span className="text-success">
                          //       Program completed! 🎉
                          //     </span>
                          //   );
                          // }

                          // If not complete, show basic progress
                          return (
                            <span className="text-muted">
                              {progress.completedWorkouts} of {progress.totalWorkouts} workouts completed
                            </span>
                          );
                        })()}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="col-md-9">
                  <h5 className="mb-3">Planned Volume</h5>
                  <div className="weekly-progress-chart">
                    <div className="mb-3">
                      <ButtonGroup size="sm">
                        <Button variant={weeklyProgressView === 'total' ? 'primary' : 'outline-primary'} onClick={() => setWeeklyProgressView('total')}>Total Sets</Button>
                        <Button variant={weeklyProgressView === 'groups' ? 'primary' : 'outline-primary'} onClick={() => setWeeklyProgressView('groups')}>By Muscle Group</Button>
                      </ButtonGroup>
                    </div>
                    {weeklyProgressView === 'groups' && (
                      <div className="mb-3">
                        <Select
                          isMulti
                          options={muscleGroupOptions}
                          value={selectedMuscleGroups}
                          onChange={setSelectedMuscleGroups}
                          closeMenuOnSelect={false}
                          hideSelectedOptions={false}
                          components={{ Option: CustomOption, ValueContainer: CustomValueContainer }}
                          styles={checkboxSelectStyles}
                          classNamePrefix="select"
                          isSearchable={false}
                          openMenuOnFocus={true}
                          placeholder="Select muscle groups..."
                        />
                      </div>
                    )}
                    <ReactECharts
                      key={`weekly-progress-${weeklyProgressView}-${selectedMuscleGroups.length}`}
                      option={getWeeklyProgressChartOption()}
                      style={{ height: '300px' }}
                    />
                  </div>
                  <div className="mt-3">
                    <div className="d-flex justify-content-between">
                      {programComplete ? (
                        <span className="text-success">
                          <strong>Program complete! 🎉</strong>
                        </span>
                      ) : (
                        <>
                          <span><strong>Currently on:</strong> Week {currentWeekIndex + 1}</span>
                          {progress.completedWorkouts > 0 && (
                            <span className="text-muted">
                              On track to complete in {Math.ceil((progress.totalWorkouts * (selectedProgram.duration / progress.completedWorkouts)) / 7)} weeks
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <ul className="nav nav-tabs nav-fill mb-4">
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Program Overview
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'performance' ? 'active' : ''}`}
                onClick={() => setActiveTab('performance')}
              >
                Performance Metrics
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'workout-logs' ? 'active' : ''}`}
                onClick={() => setActiveTab('workout-logs')}
              >
                Workout Logs
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'schedule' ? 'active' : ''}`}
                onClick={() => setActiveTab('schedule')}
              >
                Full Schedule
              </button>
            </li>
          </ul>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="program-overview">
              <div className="card shadow-sm mb-4">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0">Current Week: Week {currentWeekIndex + 1}</h5>
                </div>
                <div className="card-body">
                  <div className="row">
                    {selectedProgram.weeklyConfigs[currentWeekIndex].map((day, dayIndex) => {
                      const weekKey = `week${currentWeekIndex + 1}_day${dayIndex + 1}`;
                      const isWorkoutFinished = workoutLogs[weekKey]?.isWorkoutFinished;
                      const dayKey = `overview_${currentWeekIndex}_${dayIndex}`;
                      const isExpanded = expandedDays[dayKey] ?? false;

                      const toggleDayExpanded = () => {
                        setExpandedDays(prev => ({ ...prev, [dayKey]: !(prev[dayKey] ?? false) }));
                        // ensure chart resizes when toggling
                        setTimeout(() => handleChartResize(), 150);
                      };

                      return (
                        <div key={dayIndex} className="col-md-6 mb-3">
                          <div className={`card h-100 ${isWorkoutFinished ? 'border-success' : ''}`}>
                            <button
                              type="button"
                              className={`card-header d-flex justify-content-between align-items-center w-100 text-start ${isWorkoutFinished ? 'bg-success text-white' : ''}`}
                              onClick={toggleDayExpanded}
                              aria-expanded={isExpanded}
                              aria-controls={`overview-day-body-${dayKey}`}
                              style={{ border: 'none', background: 'inherit' }}
                            >
                              <h6 className="mb-0">Day {dayIndex + 1}</h6>
                              <div className="d-flex align-items-center gap-2">
                                {isWorkoutFinished ? (
                                  <span className="badge bg-white text-success">Completed</span>
                                ) : (
                                  <span className="badge bg-secondary">Pending</span>
                                )}
                                {isExpanded ? <ChevronUp /> : <ChevronDown />}
                              </div>
                            </button>
                            <Collapse in={isExpanded}>
                              <div id={`overview-day-body-${dayKey}`} className="card-body">
                                {day.exercises.map((ex, exIndex) => {
                                  const exerciseName = getExerciseName(ex.exerciseId);
                                  const exerciseLog = workoutLogs[weekKey]?.exercises?.[ex.exerciseId];
                                  const exercise = exercises.find(e => e.id === ex.exerciseId);
                                  const exerciseType = exercise?.exercise_type || '';

                                  return (
                                    <div key={exIndex} className="exercise-item p-2 mb-2 bg-light rounded">
                                      <div className="d-flex justify-content-between align-items-center">
                                        <div>
                                          <strong>{exerciseName}</strong>
                                          {exerciseType && (
                                            <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                              {exerciseType}
                                            </span>
                                          )}
                                          <div className="text-muted small">
                                            Target: {ex.sets} sets × {ex.reps} reps
                                          </div>
                                        </div>
                                      </div>

                                      {exerciseLog && (
                                        <div className="mt-2 exercise-log-details">
                                          <div className="sets-completed">
                                            {Array.from({ length: exerciseLog.sets || 0 }).map((_, setIndex) => {
                                              const weightValue = exerciseLog.weights?.[setIndex] || 0;
                                              const repsValue = exerciseLog.reps?.[setIndex] || 0;
                                              const bodyweightValue = exerciseLog.bodyweight ? parseFloat(exerciseLog.bodyweight) : 0;

                                              let displayWeight = weightValue;
                                              let weightLabel = 'Weight';

                                              if (exerciseType === 'Bodyweight') {
                                                displayWeight = bodyweightValue;
                                                weightLabel = 'Bodyweight';
                                              } else if (exerciseType === 'Bodyweight Loadable' && bodyweightValue > 0) {
                                                displayWeight = bodyweightValue + weightValue;
                                                weightLabel = 'Total Weight';
                                              }

                                              return (
                                                <div key={setIndex} className="set-data d-flex justify-content-between p-1 border-bottom">
                                                  <span>Set {setIndex + 1}:</span>
                                                  <span>
                                                    <strong>{repsValue || '-'}</strong> reps @
                                                    <strong> {displayWeight || '-'}</strong> {selectedProgram.weight_unit}
                                                    {exerciseLog.completed?.[setIndex] && (
                                                      <Check className="text-success ms-1" size={14} />
                                                    )}
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </Collapse>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="row">
                {/* Program Structure Overview */}
                <div className="col-md-6">
                  <div className="card shadow-sm h-100">
                    <div className="card-header">
                      <h5 className="mb-0">Program Structure</h5>
                    </div>
                    <div className="card-body">
                      <div className="table-responsive">
                        <table className="table table-sm">
                          <thead>
                            <tr>
                              <th>Week</th>
                              <th>Workouts</th>
                              <th>Total Exercises</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedProgram.weeklyConfigs.map((week, weekIndex) => {
                              const totalExercises = week.reduce((sum, day) => sum + day.exercises.length, 0);
                              const completedDays = week.filter((_, dayIndex) => {
                                const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
                                return workoutLogs[weekKey]?.isWorkoutFinished;
                              }).length;

                              let status = "Not Started";
                              if (completedDays === week.length) status = "Completed";
                              else if (completedDays > 0) status = "In Progress";

                              let statusClass = "secondary";
                              if (status === "Completed") statusClass = "success";
                              else if (status === "In Progress") statusClass = "primary";

                              return (
                                <tr key={weekIndex}>
                                  <td>Week {weekIndex + 1}</td>
                                  <td>{week.length}</td>
                                  <td>{totalExercises}</td>
                                  <td><span className={`badge bg-${statusClass}`}>{status}</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Exercises */}
                <div className="col-md-6">
                  <div className="card shadow-sm h-100">
                    <div className="card-header">
                      <h5 className="mb-0">Top Exercises</h5>
                    </div>
                    <div className="card-body">
                      {exerciseMetrics.length > 0 ? (
                        <div className="table-responsive">
                          <table className="table table-sm">
                            <thead>
                              <tr>
                                <th>Exercise</th>
                                <th>Sessions</th>
                                <th>Max Weight</th>
                                <th>Total Volume</th>
                              </tr>
                            </thead>
                            <tbody>
                              {exerciseMetrics.slice(0, 5).map((exercise, index) => {
                                const getWeightLabel = () => {
                                  if (exercise.exercise_type === 'Bodyweight') return 'Bodyweight';
                                  if (exercise.exercise_type === 'Bodyweight Loadable') return 'Total Weight';
                                  return 'Weight';
                                };

                                return (
                                  <tr key={index}>
                                    <td>
                                      {exercise.name}
                                      {exercise.exercise_type && (
                                        <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                          {exercise.exercise_type}
                                        </span>
                                      )}
                                    </td>
                                    <td>{exercise.sessions.length}</td>
                                    <td>{exercise.maxWeight} {selectedProgram.weight_unit}</td>
                                    <td>{Math.round(exercise.totalVolume)} {selectedProgram.weight_unit}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-muted">No exercise data available yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Performance Metrics Tab */}
          {activeTab === 'performance' && (
            <div className="performance-metrics">
              {exerciseMetrics.length > 0 ? (
                <>
                  <div className="row mb-4">
                    <div className="col-12">
                      <div className="card shadow-sm">
                        <div className="card-header">
                          <h5 className="mb-0">Exercise Performance</h5>
                        </div>
                        <div className="card-body pb-0">
                          <Accordion defaultActiveKey="0" alwaysOpen>
                            {exerciseMetrics.map((exercise, index) => {
                              const getWeightLabel = () => {
                                if (exercise.exercise_type === 'Bodyweight') return 'Bodyweight';
                                if (exercise.exercise_type === 'Bodyweight Loadable') return 'Total Weight';
                                return 'Weight';
                              };

                              return (
                                <Accordion.Item eventKey={index.toString()} key={index} className="mb-3">
                                  <Accordion.Header>
                                    <div className="d-flex flex-column w-100">
                                      {/* Exercise name and type */}
                                      <div className="d-flex justify-content-between align-items-start mb-2">
                                        <span className="fw-bold text-truncate me-2">
                                          {exercise.name}
                                          {exercise.exercise_type && (
                                            <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                              {exercise.exercise_type}
                                            </span>
                                          )}
                                        </span>
                                      </div>

                                      {/* Metrics row - responsive layout */}
                                      <div className="d-flex flex-wrap gap-2 justify-content-between">
                                        <span className="metric-box">
                                          <span className="metric-value">{exercise.maxWeight}</span>
                                          <span className="metric-label">
                                            {isMobile ?
                                              (exercise.exercise_type === 'Bodyweight' ? 'Max BW' :
                                                exercise.exercise_type === 'Bodyweight Loadable' ? 'Max Total' : 'Max Wt') :
                                              getWeightLabel()
                                            } ({selectedProgram.weight_unit})
                                          </span>
                                        </span>
                                        <span className="metric-box">
                                          <span className="metric-value">{exercise.sessions.length}</span>
                                          <span className="metric-label">Sessions</span>
                                        </span>
                                        <span className="metric-box">
                                          <span className="metric-value">{Math.round(exercise.totalVolume)}</span>
                                          <span className="metric-label">Total Volume</span>
                                        </span>
                                      </div>
                                    </div>
                                  </Accordion.Header>
                                  <Accordion.Body>
                                    {exercise.sessions.length > 1 && (
                                      <div className="progression-chart mb-4" style={{ overflowX: 'auto' }}>
                                        <h6 className="mb-2">Progression Chart</h6>
                                        <div
                                          ref={chartContainerRef}
                                          className="chart-container"
                                          style={{
                                            minWidth: 320,
                                            width: '100%',
                                            maxWidth: '100%',
                                            height: isMobile ? '250px' : '350px',
                                            position: 'relative'
                                          }}
                                        >
                                          {/* Responsive Line chart for progression */}
                                          <Line
                                            key={`${exercise.name}-${exercise.sessions.length}-${forceUpdate}`}
                                            data={{
                                              labels: exercise.progressTrend.map(session => session.label), // Use actual dates or week/day
                                              datasets: [
                                                {
                                                  label: `${getWeightLabel()} (${selectedProgram.weight_unit})`,
                                                  data: exercise.progressTrend.map(session => session.maxWeight),
                                                  fill: false,
                                                  borderColor: '#007bff',
                                                  backgroundColor: '#007bff',
                                                  tension: 0.2,
                                                  pointRadius: 4,
                                                  pointHoverRadius: 6,
                                                  yAxisID: 'y1',
                                                },
                                                {
                                                  label: `Total Volume (${selectedProgram.weight_unit})`,
                                                  data: exercise.progressTrend.map(session => session.volume),
                                                  fill: false,
                                                  borderColor: '#28a745',
                                                  backgroundColor: '#28a745',
                                                  tension: 0.2,
                                                  pointRadius: 4,
                                                  pointHoverRadius: 6,
                                                  yAxisID: 'y2',
                                                }
                                              ]
                                            }}
                                            options={{
                                              responsive: true,
                                              maintainAspectRatio: false,
                                              plugins: {
                                                legend: {
                                                  display: true,
                                                  position: 'top',
                                                  labels: { font: { size: isMobile ? 10 : 14 } }
                                                },
                                                title: { display: false },
                                                tooltip: {
                                                  callbacks: {
                                                    title: function (context) {
                                                      const session = exercise.progressTrend[context[0].dataIndex];
                                                      return session.date ?
                                                        `Completed: ${session.date.toLocaleDateString()}` :
                                                        session.label;
                                                    }
                                                  }
                                                }
                                              },
                                              scales: {
                                                x: {
                                                  title: {
                                                    display: true,
                                                    text: 'Workout Sessions',
                                                    font: { size: isMobile ? 10 : 14 }
                                                  },
                                                  ticks: {
                                                    font: { size: isMobile ? 9 : 12 },
                                                    maxRotation: 45,
                                                    minRotation: 0
                                                  }
                                                },
                                                y1: {
                                                  type: 'linear',
                                                  display: true,
                                                  position: 'left',
                                                  title: {
                                                    display: true,
                                                    text: `${getWeightLabel()} (${selectedProgram.weight_unit})`,
                                                    font: { size: isMobile ? 10 : 14 }
                                                  },
                                                  beginAtZero: true,
                                                  grid: { drawOnChartArea: true },
                                                  ticks: { font: { size: isMobile ? 9 : 12 } }
                                                },
                                                y2: {
                                                  type: 'linear',
                                                  display: true,
                                                  position: 'right',
                                                  title: {
                                                    display: true,
                                                    text: `Total Volume (${selectedProgram.weight_unit})`,
                                                    font: { size: isMobile ? 10 : 14 }
                                                  },
                                                  beginAtZero: true,
                                                  grid: { drawOnChartArea: false },
                                                  ticks: { font: { size: isMobile ? 9 : 12 } }
                                                }
                                              }
                                            }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                    <div className="table-responsive">
                                      <table className="table table-sm">
                                        <thead>
                                          <tr>
                                            <th>Week</th>
                                            <th>Day</th>
                                            <th>Sets × Reps</th>
                                            <th>{getWeightLabel()} ({selectedProgram.weight_unit})</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {exercise.sessions.sort((a, b) => {
                                            if (a.weekNum !== b.weekNum) return a.weekNum - b.weekNum;
                                            return a.dayNum - b.dayNum;
                                          }).map((session, sessionIdx) => {
                                            const setsReps = session.weights.map((weightData, i) =>
                                              `${session.reps[i] || '-'}`
                                            ).join(' / ');

                                            const weights = session.weights.map(weightData => {
                                              if (exercise.exercise_type === 'Bodyweight Loadable' && weightData.bodyweight > 0 && weightData.weight >= 0) {
                                                return `${weightData.totalWeight}`;
                                              }
                                              return weightData.displayWeight || weightData.weight;
                                            }).join(' / ');

                                            return (
                                              <tr key={sessionIdx}>
                                                <td>Week {session.weekNum}</td>
                                                <td>Day {session.dayNum}</td>
                                                <td>{setsReps}</td>
                                                <td>{weights}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </Accordion.Body>
                                </Accordion.Item>
                              );
                            })}
                          </Accordion>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-5">
                  <p className="text-muted">No workout data available yet to display performance metrics</p>
                </div>
              )}
            </div>
          )}

          {/* Workout Logs Tab */}
          {activeTab === 'workout-logs' && (
            <div className="workout-logs">
              <div className="accordion" id="workoutLogsAccordion">
                {selectedProgram.weeklyConfigs.map((week, weekIndex) => (
                  <div className="accordion-item" key={weekIndex}>
                    <h2 className="accordion-header" id={`heading-week-${weekIndex + 1}`}>
                      <button
                        className={`accordion-button ${weekIndex !== currentWeekIndex ? 'collapsed' : ''}`}
                        type="button"
                        data-bs-toggle="collapse"
                        data-bs-target={`#collapse-week-${weekIndex + 1}`}
                        aria-expanded={weekIndex === currentWeekIndex}
                        aria-controls={`collapse-week-${weekIndex + 1}`}
                      >
                        Week {weekIndex + 1}
                      </button>
                    </h2>
                    <div
                      id={`collapse-week-${weekIndex + 1}`}
                      className={`accordion-collapse collapse ${weekIndex === currentWeekIndex ? 'show' : ''}`}
                      aria-labelledby={`heading-week-${weekIndex + 1}`}
                      data-bs-parent="#workoutLogsAccordion"
                    >
                      <div className="accordion-body">
                        {week.map((day, dayIndex) => {
                          const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
                          const isWorkoutFinished = workoutLogs[weekKey]?.isWorkoutFinished;
                          const dayKey = `logs_${weekIndex}_${dayIndex}`;
                          const isExpanded = expandedDays[dayKey] ?? false;
                          const toggleDayExpanded = () => {
                            setExpandedDays(prev => ({ ...prev, [dayKey]: !(prev[dayKey] ?? false) }));
                          };

                          return (
                            <div key={dayIndex} className="card mb-3">
                              <button
                                type="button"
                                className={`card-header d-flex justify-content-between align-items-center w-100 text-start ${isWorkoutFinished ? 'bg-success text-white' : ''}`}
                                onClick={toggleDayExpanded}
                                aria-expanded={isExpanded}
                                aria-controls={`logs-day-body-${dayKey}`}
                                style={{ border: 'none', background: 'inherit' }}
                              >
                                <h6 className="mb-0">Day {dayIndex + 1}</h6>
                                <div className="d-flex align-items-center gap-2">
                                  {isWorkoutFinished ? (
                                    <span className="badge bg-white text-success">Completed</span>
                                  ) : (
                                    <span className="badge bg-secondary">Pending</span>
                                  )}
                                  {isExpanded ? <ChevronUp /> : <ChevronDown />}
                                </div>
                              </button>
                              <Collapse in={isExpanded}>
                                <div id={`logs-day-body-${dayKey}`} className="card-body">
                                  {day.exercises.map((ex, exIndex) => {
                                    const exerciseName = getExerciseName(ex.exerciseId);
                                    const exerciseLog = workoutLogs[weekKey]?.exercises?.[ex.exerciseId];
                                    const exercise = exercises.find(e => e.id === ex.exerciseId);
                                    const exerciseType = exercise?.exercise_type || '';

                                    const getWeightLabel = () => {
                                      if (exerciseType === 'Bodyweight') return 'Bodyweight';
                                      if (exerciseType === 'Bodyweight Loadable') return 'Total Weight';
                                      return 'Weight';
                                    };

                                    return (
                                      <div key={exIndex} className="exercise-log p-3 mb-3 bg-light rounded">
                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                          <h6 className="mb-0">
                                            {exerciseName}
                                            {exerciseType && (
                                              <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                                {exerciseType}
                                              </span>
                                            )}
                                          </h6>
                                          <div>
                                            <span className="badge bg-primary me-2">
                                              Target: {ex.sets} × {ex.reps}
                                            </span>
                                          </div>
                                        </div>

                                        {exerciseLog ? (
                                          <div className="table-responsive">
                                            <table className="table table-sm">
                                              <thead>
                                                <tr>
                                                  <th style={{ width: '80px' }}>Set</th>
                                                  <th>Reps</th>
                                                  <th>{getWeightLabel()} ({selectedProgram.weight_unit})</th>
                                                  <th style={{ width: '80px' }}>Status</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {Array.from({ length: exerciseLog.sets || 0 }).map((_, setIndex) => {
                                                  const weightValue = exerciseLog.weights?.[setIndex] || 0;
                                                  const repsValue = exerciseLog.reps?.[setIndex] || 0;
                                                  const bodyweightValue = exerciseLog.bodyweight ? parseFloat(exerciseLog.bodyweight) : 0;

                                                  let displayWeight = weightValue;

                                                  // Calculate display weight based on exercise type
                                                  if (exerciseType === 'Bodyweight') {
                                                    displayWeight = bodyweightValue;
                                                  } else if (exerciseType === 'Bodyweight Loadable' && bodyweightValue > 0) {
                                                    displayWeight = bodyweightValue + weightValue;
                                                  }

                                                  return (
                                                    <tr key={setIndex}>
                                                      <td>{setIndex + 1}</td>
                                                      <td>{repsValue || '-'}</td>
                                                      <td>{displayWeight || '-'}</td>
                                                      <td>
                                                        {exerciseLog.completed?.[setIndex] ? (
                                                          <Check className="text-success" />
                                                        ) : (
                                                          <span className="text-muted">-</span>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        ) : (
                                          <div className="text-center py-2">
                                            <p className="text-muted mb-0">No data recorded</p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </Collapse>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schedule Tab (Similar to original but enhanced) */}
          {activeTab === 'schedule' && (
            <div className="program-schedule">
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead className="table-light">
                    <tr>
                      <th>Week</th>
                      <th>Day</th>
                      <th>Exercises</th>
                      <th>Status</th>
                      <th>Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProgram.weeklyConfigs.map((week, weekIndex) => (
                      week.map((day, dayIndex) => {
                        const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
                        const isWorkoutFinished = workoutLogs[weekKey]?.isWorkoutFinished;

                        // Calculate completion date if available
                        let completionDate = null;
                        if (isWorkoutFinished && workoutLogs[weekKey]?.completedDate) {
                          completionDate = new Date(workoutLogs[weekKey].completedDate);
                        }

                        return (
                          <tr key={`${weekIndex}-${dayIndex}`} className={isWorkoutFinished ? 'table-success' : ''}>
                            <td>Week {weekIndex + 1}</td>
                            <td>Day {dayIndex + 1}</td>
                            <td>
                              <ul className="list-unstyled mb-0">
                                {day.exercises.map((ex, exIndex) => {
                                  const exerciseName = getExerciseName(ex.exerciseId);
                                  const log = workoutLogs[weekKey]?.exercises?.[ex.exerciseId];
                                  const exercise = exercises.find(e => e.id === ex.exerciseId);
                                  const exerciseType = exercise?.exercise_type || '';

                                  return (
                                    <li key={exIndex} className="mb-1">
                                      <div className="d-flex justify-content-between">
                                        <div>
                                          <strong>{exerciseName}</strong> ({ex.sets}×{ex.reps})
                                          {exerciseType && (
                                            <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                              {exerciseType}
                                            </span>
                                          )}
                                        </div>
                                        {log && log.weights && (
                                          <div className="small">
                                            {log.weights.map((w, i) => {
                                              const weightValue = w || 0;
                                              const repsValue = log.reps?.[i] || '?';
                                              const bodyweightValue = log.bodyweight ? parseFloat(log.bodyweight) : 0;

                                              let displayWeight = weightValue;

                                              // Calculate display weight based on exercise type
                                              if (exerciseType === 'Bodyweight') {
                                                displayWeight = bodyweightValue;
                                              } else if (exerciseType === 'Bodyweight Loadable' && bodyweightValue > 0) {
                                                displayWeight = bodyweightValue + weightValue;
                                              }

                                              return `${repsValue} @ ${displayWeight || '-'}`;
                                            }).join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </td>
                            <td>
                              {isWorkoutFinished ? (
                                <span className="badge bg-success">Completed</span>
                              ) : (
                                <span className="badge bg-secondary">Pending</span>
                              )}
                            </td>
                            <td>
                              {completionDate ? (
                                <span>{completionDate.toLocaleDateString()}</span>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal.Body>
        {/* <Modal.Footer>
          <Button variant="secondary" onClick={() => {
            setShowProgramDetails(false);
            setActiveTab('overview');
          }}>
            Close
          </Button>
        </Modal.Footer> */}
      </Modal>
    );
  };

  useEffect(() => {
    const handleResize = () => {
      // Force re-render on resize for responsive updates
      setForceUpdate(prev => !prev);
      // Update mobile state
      setIsMobile(window.innerWidth <= 767);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Effect to handle chart resizing when accordion expands
  useEffect(() => {
    const handleAccordionExpand = () => {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        handleChartResize();
      }, 150);
    };

    // Use MutationObserver to detect when accordion content becomes visible
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.classList.contains('accordion-collapse') && target.classList.contains('show')) {
            handleAccordionExpand();
          }
        }
      });
    });

    // Observe all accordion collapse elements
    const accordionCollapses = document.querySelectorAll('.accordion-collapse');
    accordionCollapses.forEach(collapse => {
      observer.observe(collapse, { attributes: true });
    });

    return () => {
      observer.disconnect();
    };
  }, [activeTab, selectedProgram]);

  // Effect to handle chart rendering when Performance Metrics tab is opened
  useEffect(() => {
    if (activeTab === 'performance' && selectedProgram) {
      // Small delay to ensure DOM is fully rendered
      setTimeout(() => {
        handleChartResize();
      }, 200);
    }
  }, [activeTab, selectedProgram]);

  // Initialize selected muscle groups when switching to groups view
  useEffect(() => {
    if (weeklyProgressView === 'groups' && selectedProgram) {
      // Calculate muscle groups for the current program
      const weeklySetsData = calculatePlannedWeeklySets();
      const allMuscleGroups = new Set();
      weeklySetsData.forEach(week => {
        Object.keys(week).forEach(key => {
          if (key !== 'week' && key !== 'totalSets') {
            allMuscleGroups.add(key);
          }
        });
      });
      const muscleGroupOptions = Array.from(allMuscleGroups).map(group => ({ value: group, label: group }));

      if (muscleGroupOptions.length > 0 && selectedMuscleGroups.length === 0) {
        setSelectedMuscleGroups(muscleGroupOptions);
      }
    } else if (weeklyProgressView === 'total') {
      setSelectedMuscleGroups([]);
    }
  }, [weeklyProgressView, selectedProgram, selectedMuscleGroups.length]);

  return (
    <>
      <Container fluid className="soft-container programs-container">
        <Row className="justify-content-center">
          <Col md={10}>
            <div className="soft-card programs-card shadow border-0">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <div className="d-flex align-items-center">
                  <h1 className="soft-title programs-title mb-0 me-3">My Programs</h1>
                  {/* <Badge
                  bg={isRealtimeConnected ? 'success' : 'secondary'}
                  className="d-flex align-items-center"
                >
                  <Broadcast className="me-1" size={12} />
                  {isRealtimeConnected ? 'Live' : 'Offline'}
                </Badge> */}
                  {lastUpdate && (
                    <small className="text-muted ms-2">
                      Updated {Math.floor((Date.now() - new Date(lastUpdate.timestamp)) / 1000)}s ago
                    </small>
                  )}
                </div>
                <Button
                  variant="primary"
                  onClick={() => navigate('/create-program')}
                  className="d-flex align-items-center"
                >
                  <PlusCircle className="me-2" />
                  {isMobile ? 'New' : 'Create New Program'}
                </Button>
              </div>

              {/* Real-time updates notifications */}
              {newExercises.length > 0 && (
                <Alert variant="info" className="mb-3" dismissible onClose={clearNewExercises}>
                  <div className="d-flex align-items-center">
                    <GraphUp className="me-2" />
                    <span>
                      {newExercises.length} new exercise{newExercises.length !== 1 ? 's' : ''} added: {' '}
                      {newExercises.slice(0, 2).map(ex => ex.name).join(', ')}
                      {newExercises.length > 2 && ` and ${newExercises.length - 2} more`}
                    </span>
                  </div>
                </Alert>
              )}

              {updatedExercises.length > 0 && (
                <Alert variant="warning" className="mb-3" dismissible onClose={clearUpdatedExercises}>
                  <div className="d-flex align-items-center">
                    <Pencil className="me-2" />
                    <span>
                      {updatedExercises.length} exercise{updatedExercises.length !== 1 ? 's' : ''} updated: {' '}
                      {updatedExercises.slice(0, 2).map(ex => ex.name).join(', ')}
                      {updatedExercises.length > 2 && ` and ${updatedExercises.length - 2} more`}
                    </span>
                  </div>
                </Alert>
              )}

              {/* Consolidated Error handling */}
              {error && (
                <Alert variant="danger" className="mb-4">
                  <Alert.Heading>Error Loading Programs</Alert.Heading>
                  <p>{error}</p>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => window.location.reload()}
                  >
                    Refresh Page
                  </Button>
                </Alert>
              )}

              {/* Programs and Template Programs Error - Consolidated */}
              {programsError && (
                <Alert variant={programsError.includes('cached data') ? 'warning' : 'danger'} className="mb-4">
                  <Alert.Heading>
                    {programsError.includes('cached data') ? 'Programs Data Warning' : 'Programs Loading Error'}
                  </Alert.Heading>
                  <p>{programsError}</p>
                  {programsError.includes('cached data') && (
                    <div className="mt-2">
                      <small className="text-muted">
                        This affects both your personal programs and template programs sections.
                      </small>
                    </div>
                  )}
                  {!programsError.includes('cached data') && (
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => window.location.reload()}
                      className="mt-2"
                    >
                      Refresh Page
                    </Button>
                  )}
                </Alert>
              )}

              {/* Exercise Library Error */}
              {exercisesError && (
                <Alert variant={exercisesError.includes('cached') ? 'info' : 'warning'} className="mb-4">
                  <Alert.Heading>Exercise Library Issue</Alert.Heading>
                  <p>{exercisesError}</p>
                  {!exercisesError.includes('cached') && (
                    <div className="mt-2">
                      <small className="text-muted">
                        This may affect program details and exercise information display.
                      </small>
                    </div>
                  )}
                </Alert>
              )}

              {isLoading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" className="spinner-blue" />
                  <p className="soft-text mt-2">Loading programs and exercises...</p>
                  <small className="text-muted">Fetching your data with optimized single query</small>
                </div>
              ) : !error ? (
                <>
                  {/* Program View Tabs */}
                  <div className="mb-4">
                    <ul className="nav nav-tabs">
                      <li className="nav-item">
                        <button
                          className={`nav-link ${programViewTab === 'personal' ? 'active' : ''}`}
                          onClick={() => setProgramViewTab('personal')}
                        >
                          Personal Programs ({userPrograms.length})
                        </button>
                      </li>
                      {userRole === 'coach' && (
                        <li className="nav-item">
                          <button
                            className={`nav-link ${programViewTab === 'client-programs' ? 'active' : ''}`}
                            onClick={() => setProgramViewTab('client-programs')}
                          >
                            Client Programs ({coachClientPrograms.length})
                          </button>
                        </li>
                      )}
                      {hasActiveCoach && (
                        <li className="nav-item">
                          <button
                            className={`nav-link ${programViewTab === 'coach-assigned' ? 'active' : ''}`}
                            onClick={() => setProgramViewTab('coach-assigned')}
                          >
                            Coach Assigned ({coachAssignedPrograms.length})
                          </button>
                        </li>
                      )}
                      <li className="nav-item">
                        <button
                          className={`nav-link ${programViewTab === 'templates' ? 'active' : ''}`}
                          onClick={() => setProgramViewTab('templates')}
                        >
                          Templates ({templatePrograms.length})
                        </button>
                      </li>
                    </ul>
                  </div>

                  {/* Personal Programs Tab */}
                  {programViewTab === 'personal' && (
                    <>
                      {userPrograms.length === 0 && !programsError ? (
                        <div className="text-center p-4">
                          <p className="text-muted mb-3">
                            You haven't created any programs yet.
                            Get started by creating a new workout program!
                          </p>
                          <Button
                            variant="primary"
                            size="lg"
                            onClick={() => navigate('/create-program')}
                          >
                            <PlusCircle className="me-2" /> Create First Program
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="mb-3">
                            <h3 className="soft-subtitle section-title mb-3">Your Personal Programs</h3>
                            <p className="text-muted">Programs you've created yourself</p>
                          </div>
                          {userPrograms.map(program => renderProgramCard(program, false, false))}
                        </>
                      )}
                    </>
                  )}

                  {/* Coach's Client Programs Tab */}
                  {programViewTab === 'client-programs' && userRole === 'coach' && (
                    <>
                      {coachClientPrograms.length === 0 ? (
                        <div className="text-center p-4">
                          <p className="text-muted mb-3">
                            You haven't assigned any programs to clients yet.
                          </p>
                          <Button
                            variant="primary"
                            size="lg"
                            onClick={() => navigate('/create-program')}
                          >
                            <PlusCircle className="me-2" /> Create a Client Program
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="mb-3">
                            <h3 className="soft-subtitle section-title mb-3">Client Programs</h3>
                            <p className="text-muted">
                              Programs you have created and assigned to your clients.
                            </p>
                          </div>
                          {coachClientPrograms.map(program => renderProgramCard(program, false, false))}
                        </>
                      )}
                    </>
                  )}

                  {/* Coach Assigned Programs Tab */}
                  {programViewTab === 'coach-assigned' && hasActiveCoach && (
                    <>
                      {coachAssignedPrograms.length === 0 ? (
                        <div className="text-center p-4">
                          <p className="text-muted mb-3">
                            No programs assigned by your coach yet.
                          </p>
                          {coachRelationship && (
                            <small className="text-muted">
                              Your coach: {coachRelationship.coach?.name || 'Unknown'}
                            </small>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="mb-3">
                            <h3 className="soft-subtitle section-title mb-3">Coach Assigned Programs</h3>
                            <p className="text-muted">
                              Programs assigned by your coach{coachRelationship?.coach?.name ? ` (${coachRelationship.coach.name})` : ''}
                            </p>
                          </div>
                          {coachAssignedPrograms.map(program => renderProgramCard(program, false, true))}
                        </>
                      )}
                    </>
                  )}

                  {/* Templates Tab */}
                  {programViewTab === 'templates' && (
                    <>
                      {templatePrograms.length === 0 ? (
                        <div className="text-center p-4">
                          <p className="text-muted">No template programs available.</p>
                        </div>
                      ) : (
                        <>
                          <div className="mb-3">
                            <h3 className="soft-subtitle section-title mb-3">Template Programs</h3>
                            <p className="text-muted">Community-shared programs you can adopt</p>
                          </div>
                          {/* Show template program issues summary if any */}
                          {(() => {
                            const templatesWithErrors = templatePrograms.filter(p => p.hasError);
                            if (templatesWithErrors.length > 0) {
                              return (
                                <Alert variant="info" className="mb-3">
                                  <small>
                                    <strong>{templatesWithErrors.length}</strong> template program{templatesWithErrors.length !== 1 ? 's' : ''}
                                    {templatesWithErrors.length === 1 ? ' has' : ' have'} issues and cannot be adopted.
                                  </small>
                                </Alert>
                              );
                            }
                            return null;
                          })()}
                          {templatePrograms.map(program => renderProgramCard(program, true, false))}
                        </>
                      )}
                    </>
                  )}
                </>
              ) : null}
            </div>
          </Col>
        </Row>

        {renderProgramDetailsModal()}
      </Container>
    </>
  );
}

export default Programs;