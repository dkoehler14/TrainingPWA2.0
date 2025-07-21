/**
 * WorkoutDetailModal Component
 * 
 * Modal wrapper for WorkoutDetailView component.
 * Provides a scrollable modal interface for viewing detailed workout information
 * while maintaining all existing functionality (delete, template, navigation).
 */

import React from 'react';
import { Modal } from 'react-bootstrap';
import WorkoutDetailView from './WorkoutDetailView';
import '../styles/WorkoutDetailModal.css';

const WorkoutDetailModal = ({
  show,
  onClose,
  workout,
  exercises = [],
  onDelete,
  onUseAsTemplate
}) => {
  // Handle modal close
  const handleClose = () => {
    onClose();
  };

  // Handle delete action - close modal after delete
  const handleDelete = (workoutId) => {
    onDelete(workoutId);
    // Modal will be closed by parent component after successful deletion
  };

  // Handle template action - close modal after using as template
  const handleUseAsTemplate = (workout) => {
    onUseAsTemplate(workout);
    handleClose(); // Close modal after using as template
  };

  return (
    <Modal 
      show={show} 
      onHide={handleClose} 
      size="lg" 
      scrollable
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title>
          {workout?.name || `Quick Workout - ${workout?.date ? 
            (workout.date.toDate ? workout.date.toDate() : new Date(workout.date)).toLocaleDateString() : 
            'Unknown Date'}`}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
        <WorkoutDetailView
          workout={workout}
          exercises={exercises}
          onBack={handleClose}
          onDelete={handleDelete}
          onUseAsTemplate={handleUseAsTemplate}
          isModal={true}
        />
      </Modal.Body>
    </Modal>
  );
};

export default WorkoutDetailModal;