/**
 * Client Management Page
 * 
 * Comprehensive client management interface for coaches to:
 * - View active clients with status indicators
 * - Manage pending invitations
 * - Search and filter clients
 * - View detailed client information and manage relationships
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Container, 
  Row, 
  Col, 
  Card, 
  Table, 
  Button, 
  Badge, 
  Form, 
  InputGroup, 
  Spinner, 
  Modal,
  Tabs,
  Tab,
  Alert,
  Dropdown,
  OverlayTrigger,
  Tooltip
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth, useRoles } from '../hooks/useAuth';
import { useIsCoach } from '../hooks/useRoleChecking';
import { useRealtimeInvitations } from '../hooks/useRealtimeCoaching';
import { 
  getCoachClients, 
  getCoachInvitations, 
  getClientDetails,
  terminateRelationship,
  declineInvitation,
  resendInvitation,
  cancelInvitation,
  expireOldInvitations
} from '../services/coachService';
import ErrorMessage from '../components/ErrorMessage';
import InviteClientModal from '../components/InviteClientModal';
import '../styles/Home.css';
import '../styles/ClientManagement.css';

function ClientManagement() {
  const { user, userProfile } = useAuth();
  const { isCoach: isCoachRole } = useRoles();
  const { hasRole: isCoachVerified, isChecking: isVerifyingRole } = useIsCoach();
  
  // Main state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('clients');
  
  // Data state
  const [clients, setClients] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  
  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showClientModal, setShowClientModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // Real-time invitation updates
  const {
    isConnected: realtimeConnected,
    error: realtimeError,
    invitations: realtimeInvitations
  } = useRealtimeInvitations(user?.id, {
    onInvitationAccepted: (invitation) => {
      console.log('✅ Real-time: Invitation accepted', invitation);
      // Refresh data to show new client
      loadData();
    },
    onInvitationDeclined: (invitation) => {
      console.log('❌ Real-time: Invitation declined', invitation);
      // Update invitations list
      setInvitations(prev => 
        prev.map(inv => inv.id === invitation.id ? invitation : inv)
      );
    },
    onInvitationExpired: (invitation) => {
      console.log('⏰ Real-time: Invitation expired', invitation);
      // Update invitations list
      setInvitations(prev => 
        prev.map(inv => inv.id === invitation.id ? invitation : inv)
      );
    }
  });

  // Load data
  useEffect(() => {
    if (!user || isVerifyingRole) return;
    
    // Only load data if user is verified as coach
    if (!isCoachRole && !isCoachVerified) {
      setLoading(false);
      return;
    }

    loadData();
  }, [user, isCoachRole, isCoachVerified, isVerifyingRole]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // First expire any old invitations
      try {
        await expireOldInvitations();
      } catch (expireError) {
        console.warn('Failed to expire old invitations:', expireError);
        // Don't fail the entire load if expiration fails
      }

      const [clientsData, invitationsData] = await Promise.all([
        getCoachClients(user.id),
        getCoachInvitations(user.id)
      ]);

      setClients(clientsData || []);
      setInvitations(invitationsData || []);

    } catch (err) {
      console.error('Failed to load client management data:', err);
      setError('Failed to load client data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort clients
  const filteredAndSortedClients = useMemo(() => {
    let filtered = clients.filter(relationship => {
      const client = relationship.client;
      if (!client) return false;

      // Search filter
      const matchesSearch = searchTerm === '' || 
        client.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchTerm.toLowerCase());

      // Status filter
      const matchesStatus = statusFilter === 'all' || relationship.status === statusFilter;

      return matchesSearch && matchesStatus;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'name':
          aValue = a.client?.name || '';
          bValue = b.client?.name || '';
          break;
        case 'email':
          aValue = a.client?.email || '';
          bValue = b.client?.email || '';
          break;
        case 'joined':
          aValue = new Date(a.accepted_at || a.created_at);
          bValue = new Date(b.accepted_at || b.created_at);
          break;
        case 'experience':
          aValue = a.client?.experience_level || '';
          bValue = b.client?.experience_level || '';
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  }, [clients, searchTerm, statusFilter, sortBy, sortOrder]);

  // Filter invitations
  const filteredInvitations = useMemo(() => {
    let filtered = invitations.filter(invitation => {
      // Search filter
      const matchesSearch = searchTerm === '' || 
        invitation.target_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invitation.coach_name?.toLowerCase().includes(searchTerm.toLowerCase());

      // Status filter for invitations
      let matchesStatus = true;
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending') {
          matchesStatus = invitation.status === 'pending';
        } else if (statusFilter === 'expired') {
          matchesStatus = invitation.status === 'expired' || 
                        (invitation.status === 'pending' && isInvitationExpired(invitation));
        } else {
          matchesStatus = invitation.status === statusFilter;
        }
      }

      return matchesSearch && matchesStatus;
    });

    // Sort invitations by creation date (newest first) by default
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return filtered;
  }, [invitations, searchTerm, statusFilter]);

  // Handle client detail view
  const handleViewClient = async (relationship) => {
    try {
      setActionLoading(`view-${relationship.id}`);
      const clientDetails = await getClientDetails(user.id, relationship.client_id);
      setSelectedClient({
        ...clientDetails,
        relationship
      });
      setShowClientModal(true);
    } catch (err) {
      console.error('Failed to load client details:', err);
      setError('Failed to load client details. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle relationship termination
  const handleTerminateRelationship = async (relationshipId) => {
    if (!window.confirm('Are you sure you want to terminate this coaching relationship? This action cannot be undone.')) {
      return;
    }

    try {
      setActionLoading(`terminate-${relationshipId}`);
      await terminateRelationship(relationshipId);
      await loadData(); // Reload data
      setShowClientModal(false);
    } catch (err) {
      console.error('Failed to terminate relationship:', err);
      setError('Failed to terminate relationship. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle invitation decline
  const handleDeclineInvitation = async (invitationId) => {
    if (!window.confirm('Are you sure you want to decline this invitation?')) {
      return;
    }

    try {
      setActionLoading(`decline-${invitationId}`);
      await declineInvitation(invitationId);
      await loadData(); // Reload data
    } catch (err) {
      console.error('Failed to decline invitation:', err);
      setError('Failed to decline invitation. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle invitation resend
  const handleResendInvitation = async (invitationId) => {
    try {
      setActionLoading(`resend-${invitationId}`);
      await resendInvitation(invitationId);
      await loadData(); // Reload data
      setError(null); // Clear any existing errors
    } catch (err) {
      console.error('Failed to resend invitation:', err);
      setError('Failed to resend invitation. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle invitation cancellation
  const handleCancelInvitation = async (invitationId) => {
    if (!window.confirm('Are you sure you want to cancel this invitation? This action cannot be undone.')) {
      return;
    }

    try {
      setActionLoading(`cancel-${invitationId}`);
      await cancelInvitation(invitationId);
      await loadData(); // Reload data
    } catch (err) {
      console.error('Failed to cancel invitation:', err);
      setError('Failed to cancel invitation. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  // Handle invitation sent
  const handleInvitationSent = async (invitation) => {
    console.log('Invitation sent:', invitation);
    // Reload data to show the new invitation
    await loadData();
    // Show success message (could be enhanced with toast notifications)
    setError(null); // Clear any existing errors
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Get status badge variant
  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'pending': return 'warning';
      case 'inactive': return 'secondary';
      case 'terminated': return 'danger';
      case 'expired': return 'dark';
      case 'declined': return 'danger';
      case 'cancelled': return 'secondary';
      case 'accepted': return 'success';
      default: return 'secondary';
    }
  };

  // Check if invitation is expired
  const isInvitationExpired = (invitation) => {
    return new Date(invitation.expires_at) < new Date();
  };

  // Check if invitation can be resent
  const canResendInvitation = (invitation) => {
    return ['pending', 'expired'].includes(invitation.status);
  };

  // Get time until expiration or time since expiration
  const getExpirationStatus = (invitation) => {
    const now = new Date();
    const expiresAt = new Date(invitation.expires_at);
    const diffMs = expiresAt - now;
    
    if (diffMs < 0) {
      // Already expired
      const expiredMs = Math.abs(diffMs);
      const expiredDays = Math.floor(expiredMs / (1000 * 60 * 60 * 24));
      const expiredHours = Math.floor((expiredMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      if (expiredDays > 0) {
        return `Expired ${expiredDays}d ago`;
      } else if (expiredHours > 0) {
        return `Expired ${expiredHours}h ago`;
      } else {
        return 'Expired recently';
      }
    } else {
      // Still valid
      const remainingDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const remainingHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      if (remainingDays > 0) {
        return `${remainingDays}d remaining`;
      } else if (remainingHours > 0) {
        return `${remainingHours}h remaining`;
      } else {
        return 'Expires soon';
      }
    }
  };

  // Show loading state
  if (loading || isVerifyingRole) {
    return (
      <Container fluid className="soft-container home-container py-4">
        <div className="text-center py-5">
          <Spinner animation="border" className="spinner-blue" />
          <p className="soft-text mt-2">Loading client management...</p>
        </div>
      </Container>
    );
  }

  // Show error if not a coach
  if (!isCoachRole && !isCoachVerified) {
    return (
      <Container fluid className="soft-container home-container py-4">
        <Row className="justify-content-center">
          <Col md={8}>
            <Card className="soft-card text-center">
              <Card.Body>
                <h3 className="soft-title">Access Denied</h3>
                <p className="soft-text">
                  You need coach privileges to access client management. 
                  Please contact an administrator if you believe this is an error.
                </p>
                <Button as={Link} to="/" variant="primary">
                  Return to Home
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container fluid className="soft-container home-container py-4">
      {/* Header */}
      <Row className="align-items-center mb-4 home-header-row">
        <Col>
          <h1 className="soft-title">👥 Client Management</h1>
          <p className="soft-text">
            Manage your coaching relationships and invitations
          </p>
        </Col>
        <Col xs="auto">
          <Button 
            onClick={() => setShowInviteModal(true)}
            className="soft-button gradient cta-button"
          >
            📧 Invite New Client
          </Button>
        </Col>
      </Row>

      {/* Error Alert */}
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Search and Filters */}
      <Card className="soft-card mb-4">
        <Card.Body>
          <Row className="g-3">
            <Col md={6}>
              <InputGroup>
                <InputGroup.Text>🔍</InputGroup.Text>
                <Form.Control
                  type="text"
                  placeholder="Search clients or invitations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </Col>
            <Col md={3}>
              <Form.Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                {activeTab === 'clients' ? (
                  <>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="terminated">Terminated</option>
                  </>
                ) : (
                  <>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                    <option value="accepted">Accepted</option>
                    <option value="declined">Declined</option>
                    <option value="cancelled">Cancelled</option>
                  </>
                )}
              </Form.Select>
            </Col>
            <Col md={3}>
              <Dropdown>
                <Dropdown.Toggle variant="outline-secondary" size="sm">
                  Sort: {sortBy} ({sortOrder})
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item onClick={() => { setSortBy('name'); setSortOrder('asc'); }}>
                    Name (A-Z)
                  </Dropdown.Item>
                  <Dropdown.Item onClick={() => { setSortBy('name'); setSortOrder('desc'); }}>
                    Name (Z-A)
                  </Dropdown.Item>
                  <Dropdown.Item onClick={() => { setSortBy('joined'); setSortOrder('desc'); }}>
                    Recently Joined
                  </Dropdown.Item>
                  <Dropdown.Item onClick={() => { setSortBy('joined'); setSortOrder('asc'); }}>
                    Oldest First
                  </Dropdown.Item>
                  <Dropdown.Item onClick={() => { setSortBy('experience'); setSortOrder('asc'); }}>
                    Experience Level
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Main Content Tabs */}
      <Tabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k)}
        className="mb-4"
      >
        {/* Active Clients Tab */}
        <Tab eventKey="clients" title={`Active Clients (${filteredAndSortedClients.length})`}>
          <Card className="soft-card">
            <Card.Body>
              {filteredAndSortedClients.length > 0 ? (
                <Table responsive hover className="mb-0">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Experience Level</th>
                      <th>Joined</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedClients.map(relationship => (
                      <tr key={relationship.id}>
                        <td>
                          <div className="client-info">
                            <div className="client-name">
                              {relationship.client?.name || 'N/A'}
                            </div>
                            <div className="client-email">
                              {relationship.client?.email}
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge bg="info">
                            {relationship.client?.experience_level || 'Not specified'}
                          </Badge>
                        </td>
                        <td>
                          {formatDate(relationship.accepted_at || relationship.created_at)}
                        </td>
                        <td>
                          <Badge bg={getStatusBadgeVariant(relationship.status)}>
                            {relationship.status}
                          </Badge>
                        </td>
                        <td>
                          <div className="d-flex gap-2">
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => handleViewClient(relationship)}
                              disabled={actionLoading === `view-${relationship.id}`}
                            >
                              {actionLoading === `view-${relationship.id}` ? (
                                <Spinner animation="border" size="sm" />
                              ) : (
                                '👁️ View'
                              )}
                            </Button>
                            <OverlayTrigger
                              placement="top"
                              overlay={<Tooltip>Create program for this client</Tooltip>}
                            >
                              <Button
                                variant="outline-success"
                                size="sm"
                                as={Link}
                                to={`/create-program?clientId=${relationship.client_id}`}
                                disabled // Will be enabled when program assignment is implemented
                              >
                                📋 Program
                              </Button>
                            </OverlayTrigger>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">👥</div>
                  <h5 className="empty-state-title">No Active Clients</h5>
                  <p className="empty-state-description">
                    {searchTerm || statusFilter !== 'all' 
                      ? 'No clients match your current filters.'
                      : 'You haven\'t accepted any clients yet. Send invitations to start building your client roster.'
                    }
                  </p>
                  {!searchTerm && statusFilter === 'all' && (
                    <Button 
                      variant="primary"
                      onClick={() => setShowInviteModal(true)}
                    >
                      Send Your First Invitation
                    </Button>
                  )}
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>

        {/* Pending Invitations Tab */}
        <Tab eventKey="invitations" title={`Invitations (${invitations.length})`}>
          {/* Invitation Statistics */}
          {invitations.length > 0 && (
            <Row className="mb-4">
              <Col md={3}>
                <Card className="soft-card text-center">
                  <Card.Body className="py-3">
                    <h4 className="text-warning mb-1">
                      {invitations.filter(inv => inv.status === 'pending' && !isInvitationExpired(inv)).length}
                    </h4>
                    <small className="text-muted">Active Pending</small>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={3}>
                <Card className="soft-card text-center">
                  <Card.Body className="py-3">
                    <h4 className="text-danger mb-1">
                      {invitations.filter(inv => inv.status === 'expired' || (inv.status === 'pending' && isInvitationExpired(inv))).length}
                    </h4>
                    <small className="text-muted">Expired</small>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={3}>
                <Card className="soft-card text-center">
                  <Card.Body className="py-3">
                    <h4 className="text-success mb-1">
                      {invitations.filter(inv => inv.status === 'accepted').length}
                    </h4>
                    <small className="text-muted">Accepted</small>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={3}>
                <Card className="soft-card text-center">
                  <Card.Body className="py-3">
                    <h4 className="text-secondary mb-1">
                      {invitations.filter(inv => ['declined', 'cancelled'].includes(inv.status)).length}
                    </h4>
                    <small className="text-muted">Declined/Cancelled</small>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          )}
          
          <Card className="soft-card">
            <Card.Body>
              {filteredInvitations.length > 0 ? (
                <Table responsive hover className="mb-0">
                  <thead>
                    <tr>
                      <th>Recipient</th>
                      <th>Method</th>
                      <th>Sent</th>
                      <th>Expires</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvitations.map(invitation => (
                      <tr key={invitation.id}>
                        <td>
                          <div>
                            <strong>
                              {invitation.target_email || 'Username invitation'}
                            </strong>
                            {invitation.message && (
                              <div className="small text-muted">
                                "{invitation.message.substring(0, 50)}..."
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <Badge bg="secondary">
                            {invitation.target_email ? 'Email' : 'Username'}
                          </Badge>
                        </td>
                        <td>{formatDate(invitation.created_at)}</td>
                        <td>
                          <div>
                            <span className={isInvitationExpired(invitation) ? 'text-danger' : 'text-muted'}>
                              {formatDate(invitation.expires_at)}
                            </span>
                            <div className="small">
                              <span className={isInvitationExpired(invitation) ? 'text-danger' : 'text-success'}>
                                {getExpirationStatus(invitation)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge bg={getStatusBadgeVariant(invitation.status)}>
                            {invitation.status}
                          </Badge>
                        </td>
                        <td>
                          <div className="d-flex gap-2 flex-wrap">
                            {invitation.status === 'pending' && !isInvitationExpired(invitation) && (
                              <>
                                <OverlayTrigger
                                  placement="top"
                                  overlay={<Tooltip>Resend invitation with new expiration date</Tooltip>}
                                >
                                  <Button
                                    variant="outline-primary"
                                    size="sm"
                                    onClick={() => handleResendInvitation(invitation.id)}
                                    disabled={actionLoading === `resend-${invitation.id}`}
                                  >
                                    {actionLoading === `resend-${invitation.id}` ? (
                                      <Spinner animation="border" size="sm" />
                                    ) : (
                                      '🔄 Resend'
                                    )}
                                  </Button>
                                </OverlayTrigger>
                                <OverlayTrigger
                                  placement="top"
                                  overlay={<Tooltip>Cancel this invitation</Tooltip>}
                                >
                                  <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={() => handleCancelInvitation(invitation.id)}
                                    disabled={actionLoading === `cancel-${invitation.id}`}
                                  >
                                    {actionLoading === `cancel-${invitation.id}` ? (
                                      <Spinner animation="border" size="sm" />
                                    ) : (
                                      '❌ Cancel'
                                    )}
                                  </Button>
                                </OverlayTrigger>
                              </>
                            )}
                            {(invitation.status === 'expired' || (invitation.status === 'pending' && isInvitationExpired(invitation))) && (
                              <OverlayTrigger
                                placement="top"
                                overlay={<Tooltip>Resend expired invitation with new expiration date</Tooltip>}
                              >
                                <Button
                                  variant="outline-warning"
                                  size="sm"
                                  onClick={() => handleResendInvitation(invitation.id)}
                                  disabled={actionLoading === `resend-${invitation.id}`}
                                >
                                  {actionLoading === `resend-${invitation.id}` ? (
                                    <Spinner animation="border" size="sm" />
                                  ) : (
                                    '🔄 Resend'
                                  )}
                                </Button>
                              </OverlayTrigger>
                            )}
                            {['accepted', 'declined', 'cancelled'].includes(invitation.status) && (
                              <Button
                                variant="outline-secondary"
                                size="sm"
                                disabled
                              >
                                {invitation.status === 'accepted' ? '✅ Accepted' : 
                                 invitation.status === 'declined' ? '❌ Declined' : 
                                 invitation.status === 'cancelled' ? '🚫 Cancelled' : 'N/A'}
                              </Button>
                            )}
                            {invitation.status === 'pending' && (
                              <div className="small text-muted align-self-center">
                                {invitation.viewed_at ? (
                                  <span className="text-info">👁️ Viewed</span>
                                ) : (
                                  <span className="text-muted">📧 Sent</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">📧</div>
                  <h5 className="empty-state-title">No Invitations</h5>
                  <p className="empty-state-description">
                    {searchTerm 
                      ? 'No invitations match your search.'
                      : 'You haven\'t sent any invitations yet.'
                    }
                  </p>
                  {!searchTerm && (
                    <Button 
                      variant="primary"
                      onClick={() => setShowInviteModal(true)}
                    >
                      Send Your First Invitation
                    </Button>
                  )}
                </div>
              )}
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>

      {/* Client Detail Modal */}
      <Modal 
        show={showClientModal} 
        onHide={() => setShowClientModal(false)}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Client Details: {selectedClient?.name || 'N/A'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedClient && (
            <Row>
              <Col md={6}>
                <h6>Personal Information</h6>
                <div className="mb-3">
                  <strong>Name:</strong> {selectedClient.name || 'N/A'}<br />
                  <strong>Email:</strong> {selectedClient.email}<br />
                  <strong>Experience Level:</strong> {selectedClient.experience_level || 'Not specified'}<br />
                  <strong>Preferred Units:</strong> {selectedClient.preferred_units || 'Not specified'}<br />
                  {selectedClient.age && <><strong>Age:</strong> {selectedClient.age}<br /></>}
                  {selectedClient.weight && <><strong>Weight:</strong> {selectedClient.weight}<br /></>}
                  {selectedClient.height && <><strong>Height:</strong> {selectedClient.height}<br /></>}
                </div>

                {selectedClient.goals && selectedClient.goals.length > 0 && (
                  <div className="mb-3">
                    <h6>Goals</h6>
                    {selectedClient.goals.map((goal, index) => (
                      <Badge key={index} bg="primary" className="me-1 mb-1">
                        {goal}
                      </Badge>
                    ))}
                  </div>
                )}

                {selectedClient.available_equipment && selectedClient.available_equipment.length > 0 && (
                  <div className="mb-3">
                    <h6>Available Equipment</h6>
                    {selectedClient.available_equipment.map((equipment, index) => (
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
                  <Badge bg={getStatusBadgeVariant(selectedClient.relationship?.status)}>
                    {selectedClient.relationship?.status}
                  </Badge><br />
                  <strong>Joined:</strong> {formatDate(selectedClient.relationship?.accepted_at || selectedClient.relationship?.created_at)}<br />
                  <strong>Invitation Method:</strong> {selectedClient.relationship?.invitation_method || 'N/A'}<br />
                </div>

                {selectedClient.relationship?.coach_notes && (
                  <div className="mb-3">
                    <h6>Coach Notes</h6>
                    <p className="text-muted">{selectedClient.relationship.coach_notes}</p>
                  </div>
                )}

                {selectedClient.relationship?.client_goals && selectedClient.relationship.client_goals.length > 0 && (
                  <div className="mb-3">
                    <h6>Coaching Goals</h6>
                    {selectedClient.relationship.client_goals.map((goal, index) => (
                      <Badge key={index} bg="success" className="me-1 mb-1">
                        {goal}
                      </Badge>
                    ))}
                  </div>
                )}

                {selectedClient.injuries && selectedClient.injuries.length > 0 && (
                  <div className="mb-3">
                    <h6>Injuries/Limitations</h6>
                    {selectedClient.injuries.map((injury, index) => (
                      <Badge key={index} bg="warning" className="me-1 mb-1">
                        {injury}
                      </Badge>
                    ))}
                  </div>
                )}
              </Col>
            </Row>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-success"
            as={Link}
            to={`/create-program?clientId=${selectedClient?.id}`}
            disabled // Will be enabled when program assignment is implemented
          >
            📋 Create Program
          </Button>
          <Button
            variant="outline-primary"
            disabled // Will be enabled when insights are implemented
          >
            💡 Create Insight
          </Button>
          <Button
            variant="outline-danger"
            onClick={() => handleTerminateRelationship(selectedClient?.relationship?.id)}
            disabled={actionLoading === `terminate-${selectedClient?.relationship?.id}`}
          >
            {actionLoading === `terminate-${selectedClient?.relationship?.id}` ? (
              <Spinner animation="border" size="sm" />
            ) : (
              '🚫 Terminate Relationship'
            )}
          </Button>
          <Button variant="secondary" onClick={() => setShowClientModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Invite Client Modal */}
      <InviteClientModal
        show={showInviteModal}
        onHide={() => setShowInviteModal(false)}
        onInvitationSent={handleInvitationSent}
      />
    </Container>
  );
}

export default ClientManagement;