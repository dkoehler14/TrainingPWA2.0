import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Alert, Spinner } from 'react-bootstrap';
import { PlusLg } from 'react-bootstrap-icons';
import ExerciseCreationModal from '../components/ExerciseCreationModal';
import ExerciseOrganizer from '../components/ExerciseOrganizer';
import '../styles/Exercises.css';
import '../styles/ExerciseGrid.css';
import '../styles/ExerciseOrganizer.css';
import { getCollectionCached, warmUserCache, getAllExercisesMetadata, getDocCached } from '../api/enhancedFirestoreCache';
import { MUSCLE_GROUPS, EXERCISE_TYPES } from '../constants/exercise';

function Exercises({ user, userRole }) {
  const [exercises, setExercises] = useState([]);

  // State for validation and feedback
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentExercise, setCurrentExercise] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      // Warm cache and fetch exercises
      warmUserCache(user.id, 'high').then(() => {
        fetchExercises();
      });
    } else {
      // If no user, still fetch global exercises
      fetchExercises();
    }
  }, [user]);

  // Removed client-side filtering - now handled in fetchExercises

  const fetchExercises = async () => {
    setIsLoading(true);
    try {
      // Fetch global exercises from metadata
      const globalExercises = await getAllExercisesMetadata(60 * 60 * 1000); // 1 hour TTL
      
      // Add source metadata to global exercises
      const enhancedGlobalExercises = globalExercises.map(ex => ({
        ...ex,
        isGlobal: true,
        source: 'global',
        createdBy: null
      }));
      
      // Fetch user-specific exercises if user exists
      let userExercises = [];
      if (user?.id) {
        try {
          const userMetadata = await getDocCached('exercises_metadata', user.id, 60 * 60 * 1000);
          if (userMetadata && userMetadata.exercises) {
            userExercises = Object.entries(userMetadata.exercises).map(([id, ex]) => ({
              id,
              ...ex,
              isGlobal: false,
              source: 'custom',
              createdBy: user.id
            }));
          }
        } catch (userError) {
          // User metadata document doesn't exist yet - this is normal for new users
          console.log('No user-specific exercises found');
        }
      }
      
      // Combine global and user exercises
      const allExercises = [...enhancedGlobalExercises, ...userExercises];
      
      // Filter based on user role
      let filteredExercises;
      if (userRole === 'admin') {
        // Admin sees all exercises
        filteredExercises = allExercises;
      } else {
        // Regular users see global exercises + their own personal exercises
        filteredExercises = allExercises.filter(ex => !ex.userId || ex.userId === user?.uid);
      }
      
      setExercises(filteredExercises);
    } catch (error) {
      console.error("Error fetching exercises: ", error);
      setValidationError("Failed to load exercises. Please refresh the page.");
    } finally {
      setIsLoading(false);
    }
  };

  const openAddModal = () => {
    setValidationError('');
    setIsEditMode(false);
    setCurrentExercise(null);
    setShowModal(true);
  };

  const openEditModal = (exercise) => {
    setValidationError('');
    setIsEditMode(true);
    setCurrentExercise(exercise);
    setShowModal(true);
  };

  // Callback for when a new exercise is added
  const handleExerciseAdded = (newExercise) => {
    // Cache invalidation is now handled in ExerciseCreationModal
    setExercises(prev => [...prev, newExercise]);
    setSuccessMessage(`Exercise "${newExercise.name}" added successfully!`);
    setShowModal(false);
  };

  // Callback for when an exercise is updated
  const handleExerciseUpdated = (updatedExercise) => {
    // Cache invalidation is now handled in ExerciseCreationModal
    setExercises(prev => prev.map(ex => ex.id === updatedExercise.id ? updatedExercise : ex));
    setSuccessMessage(`Exercise "${updatedExercise.name}" updated successfully!`);
    setShowModal(false);
  };

  return (
    <Container fluid className="soft-container exercises-container">
      <Row className="justify-content-center">
        <Col lg={10} xl={8}>
          <div className="soft-card exercises-card shadow border-0">
            <h1 className="soft-title exercises-title text-center mb-4">Exercises</h1>

            {/* Success message display */}
            {successMessage && (
              <Alert variant="success" onClose={() => setSuccessMessage('')} dismissible>
                {successMessage}
              </Alert>
            )}

            {/* Error message display */}
            {validationError && (
              <Alert variant="danger" onClose={() => setValidationError('')} dismissible>
                {validationError}
              </Alert>
            )}

            {isLoading ? (
              <div className="text-center py-4">
                <Spinner animation="border" className="spinner-blue" />
                <p className="soft-text mt-2">Loading...</p>
              </div>
            ) : (
              <>
                {/* Add exercise button */}
                <div className="d-flex justify-content-start mb-4">
                  <Button
                    onClick={openAddModal}
                    className="soft-button exercises-button gradient"
                  >
                    <PlusLg className="me-2" /> Add New Exercise
                  </Button>
                </div>

                {/* Exercise Organizer */}
                <ExerciseOrganizer
                  exercises={exercises}
                  showEditButton={true}
                  onEditClick={openEditModal}
                  className="exercises-organizer"
                  userRole={userRole}
                />
              </>
            )}
          </div>
        </Col>
      </Row>

      {/* Exercise Creation/Edit Modal */}
      <ExerciseCreationModal
        show={showModal}
        onHide={() => setShowModal(false)}
        isEditMode={isEditMode}
        exerciseId={isEditMode ? currentExercise?.id : null}
        initialData={isEditMode ? currentExercise : null}
        onExerciseAdded={handleExerciseAdded}
        onExerciseUpdated={handleExerciseUpdated}
        user={user}
        userRole={userRole}
      />
    </Container>
  );
}

export default Exercises;