import React, { useState } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { Check, X, Person, Calendar, Bullseye, FileText } from 'react-bootstrap-icons';

/**
 * Program Assignment Confirmation Modal
 * Handles the workflow for coaches to assign programs to clients with confirmation
 */
const ProgramAssignmentModal = ({ 
  show, 
  onHide, 
  program, 
  client, 
  onConfirmAssignment,
  isLoading = false 
}) => {
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [clientGoals, setClientGoals] = useState([]);
  const [newGoal, setNewGoal] = useState('');
  const [expectedDuration, setExpectedDuration] = useState('');
  const [programDifficulty, setProgramDifficulty] = useState('intermediate');
  const [error, setError] = useState('');

  const handleAddGoal = () => {
    if (newGoal.trim() && !clientGoals.includes(newGoal.trim())) {
      setClientGoals([...clientGoals, newGoal.trim()]);
      setNewGoal('');
    }
  };

  const handleRemoveGoal = (index) => {
    setClientGoals(clientGoals.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    try {
      setError('');
      
      // Validate required fields
      if (!expectedDuration) {
        setError('Expected duration is required when assigning programs to clients.');
        return;
      }

      const assignmentData = {
        coachNotes: assignmentNotes,
        clientGoals,
        expectedDurationWeeks: parseInt(expectedDuration),
        programDifficulty,
        assignedAt: new Date().toISOString()
      };

      await onConfirmAssignment(assignmentData);
      
      // Reset form
      setAssignmentNotes('');
      setClientGoals([]);
      setNewGoal('');
      setExpectedDuration('');
      setProgramDifficulty('intermediate');
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to assign program. Please try again.');
    }
  };

  const handleClose = () => {
    setError('');
    onHide();
  };

  if (!program || !client) {
    return null;
  }

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title className="d-flex align-items-center">
          <Bullseye className="me-2 text-primary" />
          Assign Program to Client
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body>
        {error && (
          <Alert variant="danger" className="mb-3">
            {error}
          </Alert>
        )}

        {/* Assignment Summary */}
        <div className="mb-4 p-3 bg-light rounded">
          <h6 className="mb-3">Assignment Summary</h6>
          <div className="row">
            <div className="col-md-6">
              <div className="d-flex align-items-center mb-2">
                <FileText className="me-2 text-muted" size={16} />
                <strong>Program:</strong>
                <span className="ms-2">{program.name}</span>
              </div>
              <div className="text-muted small">
                {program.duration} weeks • {program.days_per_week} days/week
              </div>
            </div>
            <div className="col-md-6">
              <div className="d-flex align-items-center mb-2">
                <Person className="me-2 text-muted" size={16} />
                <strong>Client:</strong>
                <span className="ms-2">{client.client?.name || client.name}</span>
              </div>
              <div className="text-muted small">
                {client.client?.email || client.email}
              </div>
            </div>
          </div>
        </div>

        {/* Assignment Configuration */}
        <Form>
          <div className="row">
            <div className="col-md-6 mb-3">
              <Form.Group>
                <Form.Label className="d-flex align-items-center">
                  <Calendar className="me-2" size={16} />
                  Expected Duration (weeks) *
                </Form.Label>
                <Form.Control
                  type="number"
                  value={expectedDuration}
                  onChange={(e) => setExpectedDuration(e.target.value)}
                  placeholder="e.g., 12"
                  min="1"
                  max="52"
                  required
                />
                <Form.Text className="text-muted">
                  How long should the client follow this program?
                </Form.Text>
              </Form.Group>
            </div>
            
            <div className="col-md-6 mb-3">
              <Form.Group>
                <Form.Label>Program Difficulty</Form.Label>
                <Form.Select
                  value={programDifficulty}
                  onChange={(e) => setProgramDifficulty(e.target.value)}
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </Form.Select>
              </Form.Group>
            </div>
          </div>

          <Form.Group className="mb-3">
            <Form.Label>Client Goals</Form.Label>
            <div className="d-flex mb-2">
              <Form.Control
                type="text"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="Add a goal for this program"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddGoal();
                  }
                }}
              />
              <Button
                variant="outline-primary"
                size="sm"
                className="ms-2"
                onClick={handleAddGoal}
                disabled={!newGoal.trim()}
              >
                Add
              </Button>
            </div>
            {clientGoals.length > 0 && (
              <div className="d-flex flex-wrap gap-1">
                {clientGoals.map((goal, index) => (
                  <span key={index} className="badge bg-primary d-flex align-items-center">
                    {goal}
                    <button
                      type="button"
                      className="btn-close btn-close-white ms-1"
                      style={{ fontSize: '0.7em' }}
                      onClick={() => handleRemoveGoal(index)}
                    ></button>
                  </span>
                ))}
              </div>
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Assignment Notes</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={assignmentNotes}
              onChange={(e) => setAssignmentNotes(e.target.value)}
              placeholder="Add notes about this program assignment, training focus, or instructions for the client..."
            />
          </Form.Group>
        </Form>

        {/* Assignment Impact Notice */}
        <Alert variant="info" className="mb-0">
          <div className="d-flex align-items-start">
            <Check className="me-2 mt-1 flex-shrink-0" size={16} />
            <div>
              <strong>What happens next:</strong>
              <ul className="mb-0 mt-1">
                <li>The client will receive a notification about the new program assignment</li>
                <li>The program will appear in their "Coach Programs" section</li>
                <li>You can track their progress and modify the program as needed</li>
                <li>The client can view your notes and goals for this program</li>
              </ul>
            </div>
          </div>
        </Alert>
      </Modal.Body>
      
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button 
          variant="primary" 
          onClick={handleConfirm}
          disabled={isLoading || !expectedDuration}
        >
          {isLoading ? (
            <>
              <Spinner size="sm" className="me-2" />
              Assigning...
            </>
          ) : (
            <>
              <Check className="me-2" />
              Assign Program
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ProgramAssignmentModal;