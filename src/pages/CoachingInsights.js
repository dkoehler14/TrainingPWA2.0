import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, Badge, Modal } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { getCoachClients, createInsight, getClientInsights } from '../services/coachService';
import { handleSupabaseError } from '../utils/supabaseErrorHandler';
import '../styles/CoachingInsights.css';

const INSIGHT_TYPES = [
  { value: 'recommendation', label: 'Recommendation', icon: '💡', description: 'Suggest improvements or changes' },
  { value: 'observation', label: 'Observation', icon: '👁️', description: 'Share what you\'ve noticed' },
  { value: 'goal_update', label: 'Goal Update', icon: '🎯', description: 'Update or adjust goals' },
  { value: 'program_adjustment', label: 'Program Adjustment', icon: '📋', description: 'Modify workout programs' }
];

const PRIORITY_LEVELS = [
  { value: 'low', label: 'Low', variant: 'secondary', description: 'General guidance' },
  { value: 'medium', label: 'Medium', variant: 'primary', description: 'Important feedback' },
  { value: 'high', label: 'High', variant: 'danger', description: 'Urgent attention needed' }
];

function CoachingInsights() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [insightType, setInsightType] = useState('recommendation');
  const [priority, setPriority] = useState('medium');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [clientInsights, setClientInsights] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  // Load coach's clients on component mount
  useEffect(() => {
    const loadClients = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);
        const clientsData = await getCoachClients(user.id);
        setClients(clientsData || []);
        
        // Auto-select first client if available
        if (clientsData && clientsData.length > 0) {
          setSelectedClient(clientsData[0].client_id);
        }
      } catch (error) {
        console.error('Error loading clients:', error);
        setError('Failed to load clients. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadClients();
  }, [user?.id]);

  // Load insights for selected client
  useEffect(() => {
    const loadClientInsights = async () => {
      if (!selectedClient || !user?.id) return;

      try {
        const insights = await getClientInsights(user.id, selectedClient, { limit: 5 });
        setClientInsights(insights || []);
      } catch (error) {
        console.error('Error loading client insights:', error);
      }
    };

    loadClientInsights();
  }, [selectedClient, user?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedClient || !title.trim() || !content.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      // Find the relationship ID for the selected client
      const clientRelationship = clients.find(c => c.client_id === selectedClient);
      if (!clientRelationship) {
        throw new Error('Client relationship not found');
      }

      const insightData = {
        coachId: user.id,
        clientId: selectedClient,
        relationshipId: clientRelationship.id,
        type: insightType,
        title: title.trim(),
        content: content.trim(),
        priority,
        tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0),
        aiGenerated: false
      };

      const createdInsight = await createInsight(insightData);
      
      setSuccess('Insight created successfully! Your client will be notified.');
      
      // The real-time system will automatically notify the client
      console.log('Insight created:', createdInsight);
      
      // Reset form
      setTitle('');
      setContent('');
      setTags('');
      setPriority('medium');
      setInsightType('recommendation');
      
      // Reload client insights
      const insights = await getClientInsights(user.id, selectedClient, { limit: 5 });
      setClientInsights(insights || []);
      
    } catch (error) {
      console.error('Error creating insight:', error);
      setError(handleSupabaseError(error, 'createInsight'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSelectedClientName = () => {
    const client = clients.find(c => c.client_id === selectedClient);
    return client?.client?.name || 'Unknown Client';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getInsightTypeInfo = (type) => {
    return INSIGHT_TYPES.find(t => t.value === type) || INSIGHT_TYPES[0];
  };

  const getPriorityInfo = (priorityValue) => {
    return PRIORITY_LEVELS.find(p => p.value === priorityValue) || PRIORITY_LEVELS[1];
  };

  if (loading) {
    return (
      <Container className="mt-4">
        <div className="text-center">
          <Spinner animation="border" />
          <p className="mt-2">Loading clients...</p>
        </div>
      </Container>
    );
  }

  if (clients.length === 0) {
    return (
      <Container className="mt-4">
        <Alert variant="info">
          <Alert.Heading>No Clients Found</Alert.Heading>
          <p>You don't have any active clients yet. Invite clients to start providing coaching insights.</p>
          <Button variant="primary" href="/coach/clients">
            Manage Clients
          </Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="mt-4 coaching-insights-container">
      <Row>
        <Col lg={8}>
          <Card className="coaching-insights-form-card">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h4 className="mb-0">
                <span className="me-2">💭</span>
                Create Coaching Insight
              </h4>
              <Button 
                variant="outline-secondary" 
                size="sm"
                onClick={() => setShowPreview(true)}
                disabled={!title.trim() || !content.trim()}
              >
                Preview
              </Button>
            </Card.Header>
            <Card.Body>
              {error && <Alert variant="danger">{error}</Alert>}
              {success && <Alert variant="success">{success}</Alert>}

              <Form onSubmit={handleSubmit}>
                {/* Client Selection */}
                <Form.Group className="mb-3">
                  <Form.Label>
                    <strong>Select Client</strong>
                  </Form.Label>
                  <Form.Select
                    value={selectedClient}
                    onChange={(e) => setSelectedClient(e.target.value)}
                    required
                  >
                    <option value="">Choose a client...</option>
                    {clients.map((clientRel) => (
                      <option key={clientRel.client_id} value={clientRel.client_id}>
                        {clientRel.client?.name} ({clientRel.client?.email})
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>

                {/* Insight Type */}
                <Form.Group className="mb-3">
                  <Form.Label>
                    <strong>Insight Type</strong>
                  </Form.Label>
                  <div className="insight-type-grid">
                    {INSIGHT_TYPES.map((type) => (
                      <div
                        key={type.value}
                        className={`insight-type-option ${insightType === type.value ? 'selected' : ''}`}
                        onClick={() => setInsightType(type.value)}
                      >
                        <div className="insight-type-icon">{type.icon}</div>
                        <div className="insight-type-label">{type.label}</div>
                        <div className="insight-type-description">{type.description}</div>
                      </div>
                    ))}
                  </div>
                </Form.Group>

                {/* Priority */}
                <Form.Group className="mb-3">
                  <Form.Label>
                    <strong>Priority Level</strong>
                  </Form.Label>
                  <div className="priority-options">
                    {PRIORITY_LEVELS.map((priorityOption) => (
                      <Button
                        key={priorityOption.value}
                        variant={priority === priorityOption.value ? priorityOption.variant : 'outline-secondary'}
                        size="sm"
                        className="me-2 mb-2"
                        onClick={() => setPriority(priorityOption.value)}
                        type="button"
                      >
                        {priorityOption.label}
                      </Button>
                    ))}
                  </div>
                  <Form.Text className="text-muted">
                    {getPriorityInfo(priority).description}
                  </Form.Text>
                </Form.Group>

                {/* Title */}
                <Form.Group className="mb-3">
                  <Form.Label>
                    <strong>Title</strong> <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter a clear, descriptive title..."
                    maxLength={255}
                    required
                  />
                  <Form.Text className="text-muted">
                    {title.length}/255 characters
                  </Form.Text>
                </Form.Group>

                {/* Content - Rich Text Area */}
                <Form.Group className="mb-3">
                  <Form.Label>
                    <strong>Content</strong> <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={8}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your detailed insight here. Be specific and actionable..."
                    className="insight-content-textarea"
                    required
                  />
                  <Form.Text className="text-muted">
                    Use clear, actionable language. Your client will receive this as guidance.
                  </Form.Text>
                </Form.Group>

                {/* Tags */}
                <Form.Group className="mb-4">
                  <Form.Label>
                    <strong>Tags</strong> <span className="text-muted">(optional)</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="Enter tags separated by commas (e.g., strength, form, nutrition)"
                  />
                  <Form.Text className="text-muted">
                    Tags help organize and categorize insights for easier reference.
                  </Form.Text>
                </Form.Group>

                {/* Submit Button */}
                <div className="d-grid">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    disabled={isSubmitting || !selectedClient || !title.trim() || !content.trim()}
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Creating Insight...
                      </>
                    ) : (
                      <>
                        <span className="me-2">📤</span>
                        Send Insight to {selectedClient ? getSelectedClientName() : 'Client'}
                      </>
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={4}>
          {/* Recent Insights for Selected Client */}
          {selectedClient && (
            <Card className="recent-insights-card">
              <Card.Header>
                <h6 className="mb-0">
                  Recent Insights for {getSelectedClientName()}
                </h6>
              </Card.Header>
              <Card.Body>
                {clientInsights.length === 0 ? (
                  <p className="text-muted text-center">
                    No insights yet for this client.
                  </p>
                ) : (
                  <div className="recent-insights-list">
                    {clientInsights.map((insight) => (
                      <div key={insight.id} className="recent-insight-item">
                        <div className="d-flex justify-content-between align-items-start mb-1">
                          <span className="insight-type-badge">
                            {getInsightTypeInfo(insight.type).icon}
                          </span>
                          <Badge bg={getPriorityInfo(insight.priority).variant} size="sm">
                            {insight.priority}
                          </Badge>
                        </div>
                        <h6 className="insight-title">{insight.title}</h6>
                        <p className="insight-preview">
                          {insight.content.substring(0, 100)}
                          {insight.content.length > 100 ? '...' : ''}
                        </p>
                        <div className="insight-meta">
                          <small className="text-muted">
                            {formatDate(insight.created_at)}
                            {insight.client_viewed && (
                              <span className="ms-2 text-success">
                                ✓ Viewed
                              </span>
                            )}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Body>
            </Card>
          )}

          {/* Quick Tips */}
          <Card className="mt-3 quick-tips-card">
            <Card.Header>
              <h6 className="mb-0">💡 Quick Tips</h6>
            </Card.Header>
            <Card.Body>
              <ul className="quick-tips-list">
                <li>Be specific and actionable in your insights</li>
                <li>Use high priority sparingly for urgent matters</li>
                <li>Reference specific workouts or data when possible</li>
                <li>Encourage and motivate while providing guidance</li>
                <li>Follow up on previous insights to track progress</li>
              </ul>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Preview Modal */}
      <Modal show={showPreview} onHide={() => setShowPreview(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Insight Preview</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="insight-preview-container">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div className="d-flex align-items-center">
                <span className="me-2 fs-4">{getInsightTypeInfo(insightType).icon}</span>
                <div>
                  <h5 className="mb-0">{title || 'Untitled Insight'}</h5>
                  <small className="text-muted">
                    {getInsightTypeInfo(insightType).label} • 
                    From your coach • 
                    {formatDate(new Date().toISOString())}
                  </small>
                </div>
              </div>
              <Badge bg={getPriorityInfo(priority).variant}>
                {priority.toUpperCase()}
              </Badge>
            </div>
            
            <div className="insight-content-preview">
              {content.split('\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
            
            {tags && (
              <div className="insight-tags-preview mt-3">
                {tags.split(',').map((tag, index) => (
                  <Badge key={index} bg="secondary" className="me-1">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPreview(false)}>
            Close Preview
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default CoachingInsights;