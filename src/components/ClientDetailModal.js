import React from 'react';
import { Modal, Button, Badge, Row, Col, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';

function ClientDetailModal({
  show,
  onHide,
  client, // This object should contain client details and the relationship object
  onTerminate,
  actionLoading
}) {

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'pending': return 'warning';
      case 'inactive': return 'secondary';
      case 'terminated': return 'danger';
      default: return 'secondary';
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          Client Details: {client?.name || 'N/A'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {client ? (
          <Row>
            <Col md={6}>
              <h6>Personal Information</h6>
              <div className="mb-3">
                <strong>Name:</strong> {client.name || 'N/A'}<br />
                <strong>Email:</strong> {client.email}<br />
                <strong>Experience Level:</strong> {client.experience_level || 'Not specified'}<br />
                <strong>Preferred Units:</strong> {client.preferred_units || 'Not specified'}<br />
                {client.age && <><strong>Age:</strong> {client.age}<br /></>}
                {client.weight_lbs && <><strong>Weight:</strong> {client.weight_lbs} lbs<br /></>}
                {client.height_feet && <><strong>Height:</strong> {client.height_feet}' {client.height_inches}"<br /></>}
              </div>

              {client.goals && client.goals.length > 0 && (
                <div className="mb-3">
                  <h6>Goals</h6>
                  {client.goals.map((goal, index) => (
                    <Badge key={index} bg="primary" className="me-1 mb-1">
                      {goal}
                    </Badge>
                  ))}
                </div>
              )}

              {client.available_equipment && client.available_equipment.length > 0 && (
                <div className="mb-3">
                  <h6>Available Equipment</h6>
                  {client.available_equipment.map((equipment, index) => (
                    <Badge key={index} bg="secondary" className="me-1 mb-1">
                      {equipment}
                    </Badge>
                  ))}
                </div>
              )}
            </Col>
            <Col md={6}>
              <h6>Coaching Relationship</h6>
              <div className="mb-3">
                <strong>Status:</strong>{' '}
                <Badge bg={getStatusBadgeVariant(client.relationship?.status)}>
                  {client.relationship?.status}
                </Badge><br />
                <strong>Joined:</strong> {formatDate(client.relationship?.accepted_at || client.relationship?.created_at)}<br />
                <strong>Invitation Method:</strong> {client.relationship?.invitation_method || 'N/A'}<br />
              </div>

              {client.relationship?.coach_notes && (
                <div className="mb-3">
                  <h6>Coach Notes</h6>
                  <p className="text-muted">{client.relationship.coach_notes}</p>
                </div>
              )}

              {client.relationship?.client_goals && client.relationship.client_goals.length > 0 && (
                <div className="mb-3">
                  <h6>Coaching Goals</h6>
                  {client.relationship.client_goals.map((goal, index) => (
                    <Badge key={index} bg="success" className="me-1 mb-1">
                      {goal}
                    </Badge>
                  ))}
                </div>
              )}

              {client.injuries && client.injuries.length > 0 && (
                <div className="mb-3">
                  <h6>Injuries/Limitations</h6>
                  {client.injuries.map((injury, index) => (
                    <Badge key={index} bg="warning" className="me-1 mb-1">
                      {injury}
                    </Badge>
                  ))}
                </div>
              )}
            </Col>
          </Row>
        ) : (
          <div className="text-center">
            <Spinner animation="border" />
            <p>Loading client details...</p>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="outline-success"
          as={Link}
          to={`/create-program?clientId=${client?.id}`}
          disabled={!client?.id}
        >
          📋 Create Program
        </Button>
        <Button
          variant="outline-primary"
          as={Link}
          to={`/coach/insights?clientId=${client?.id}`}
          disabled={!client?.id}
        >
          💡 Create Insight
        </Button>
        {/* Conditionally render action buttons if onTerminate is provided (i.e., from ClientManagement) */}
        {onTerminate && (
          <>
            <Button
              variant="outline-danger"
              onClick={() => onTerminate(client?.relationship?.id)}
              disabled={actionLoading === `terminate-${client?.relationship?.id}`}
            >
              {actionLoading === `terminate-${client?.relationship?.id}` ? <Spinner animation="border" size="sm" /> : '🚫 Terminate Relationship'}
            </Button>
          </>
        )}
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ClientDetailModal;