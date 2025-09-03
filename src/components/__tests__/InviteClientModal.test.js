import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InviteClientModal from '../InviteClientModal';
import { useAuth } from '../../hooks/useAuth';
import { sendInvitation } from '../../services/coachService';

// Mock dependencies
jest.mock('../../hooks/useAuth');
jest.mock('../../services/coachService');

const mockUseAuth = useAuth;
const mockSendInvitation = sendInvitation;

describe('InviteClientModal', () => {
  const mockUser = {
    id: 'coach-123',
    email: 'coach@example.com'
  };

  const mockUserProfile = {
    name: 'John Coach'
  };

  const defaultProps = {
    show: true,
    onHide: jest.fn(),
    onInvitationSent: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: mockUser,
      userProfile: mockUserProfile
    });
  });

  describe('Email Invitation', () => {
    it('should render email invitation form', () => {
      render(<InviteClientModal {...defaultProps} />);

      expect(screen.getByText('Invite New Client')).toBeInTheDocument();
      expect(screen.getByText('Email Address')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('client@example.com')).toBeInTheDocument();
    });

    it('should validate email format', async () => {
      const user = userEvent.setup();
      render(<InviteClientModal {...defaultProps} />);

      const emailInput = screen.getByPlaceholderText('client@example.com');
      const submitButton = screen.getByText('📧 Send Invitation');

      // Enter invalid email
      await user.type(emailInput, 'invalid-email');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      });
    });

    it('should send email invitation successfully', async () => {
      const user = userEvent.setup();
      const mockInvitationResult = {
        id: 'invitation-123',
        invitation_code: 'abc123'
      };

      mockSendInvitation.mockResolvedValue(mockInvitationResult);

      render(<InviteClientModal {...defaultProps} />);

      const emailInput = screen.getByPlaceholderText('client@example.com');
      const messageInput = screen.getByPlaceholderText('Add a personal message to your invitation...');
      const submitButton = screen.getByText('📧 Send Invitation');

      // Fill form
      await user.type(emailInput, 'client@example.com');
      await user.type(messageInput, 'Welcome to my coaching program!');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSendInvitation).toHaveBeenCalledWith({
          coachId: 'coach-123',
          coachEmail: 'coach@example.com',
          coachName: 'John Coach',
          targetEmail: 'client@example.com',
          message: 'Welcome to my coaching program!'
        });
      });

      expect(defaultProps.onInvitationSent).toHaveBeenCalledWith(mockInvitationResult);
      expect(defaultProps.onHide).toHaveBeenCalled();
    });

    it('should handle email invitation errors', async () => {
      const user = userEvent.setup();
      mockSendInvitation.mockRejectedValue(new Error('Email already exists'));

      render(<InviteClientModal {...defaultProps} />);

      const emailInput = screen.getByPlaceholderText('client@example.com');
      const submitButton = screen.getByText('📧 Send Invitation');

      await user.type(emailInput, 'existing@example.com');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/already exists/)).toBeInTheDocument();
      });
    });
  });

  describe('Username Invitation', () => {
    it('should switch to username tab', async () => {
      const user = userEvent.setup();
      render(<InviteClientModal {...defaultProps} />);

      const usernameTab = screen.getByText('👤 Username');
      await user.click(usernameTab);

      expect(screen.getByText("Client's Username")).toBeInTheDocument();
      expect(screen.getByPlaceholderText('username')).toBeInTheDocument();
    });

    it('should validate username format', async () => {
      const user = userEvent.setup();
      render(<InviteClientModal {...defaultProps} />);

      // Switch to username tab
      const usernameTab = screen.getByText('👤 Username');
      await user.click(usernameTab);

      const usernameInput = screen.getByPlaceholderText('username');
      const submitButton = screen.getByText('📧 Send Invitation');

      // Enter invalid username (too short)
      await user.type(usernameInput, 'ab');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Username must be 3-30 characters/)).toBeInTheDocument();
      });
    });

    it('should send username invitation successfully', async () => {
      const user = userEvent.setup();
      const mockInvitationResult = {
        id: 'invitation-123',
        invitation_code: 'abc123'
      };

      mockSendInvitation.mockResolvedValue(mockInvitationResult);

      render(<InviteClientModal {...defaultProps} />);

      // Switch to username tab
      const usernameTab = screen.getByText('👤 Username');
      await user.click(usernameTab);

      const usernameInput = screen.getByPlaceholderText('username');
      const submitButton = screen.getByText('📧 Send Invitation');

      // Fill form
      await user.type(usernameInput, 'client_user');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSendInvitation).toHaveBeenCalledWith({
          coachId: 'coach-123',
          coachEmail: 'coach@example.com',
          coachName: 'John Coach',
          targetUsername: 'client_user',
          message: null
        });
      });

      expect(defaultProps.onInvitationSent).toHaveBeenCalledWith(mockInvitationResult);
      expect(defaultProps.onHide).toHaveBeenCalled();
    });

    it('should handle username not found error', async () => {
      const user = userEvent.setup();
      mockSendInvitation.mockRejectedValue(new Error('Username not found'));

      render(<InviteClientModal {...defaultProps} />);

      // Switch to username tab
      const usernameTab = screen.getByText('👤 Username');
      await user.click(usernameTab);

      const usernameInput = screen.getByPlaceholderText('username');
      const submitButton = screen.getByText('📧 Send Invitation');

      await user.type(usernameInput, 'nonexistent_user');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Username not found/)).toBeInTheDocument();
      });
    });
  });

  describe('Message Functionality', () => {
    it('should use default message when button clicked', async () => {
      const user = userEvent.setup();
      render(<InviteClientModal {...defaultProps} />);

      const useDefaultButton = screen.getByText('Use Default Message');
      const messageInput = screen.getByPlaceholderText('Add a personal message to your invitation...');

      await user.click(useDefaultButton);

      await waitFor(() => {
        expect(messageInput.value).toContain('John Coach');
        expect(messageInput.value).toContain('FitTrack Pro');
      });
    });

    it('should validate message length', async () => {
      const user = userEvent.setup();
      render(<InviteClientModal {...defaultProps} />);

      const messageInput = screen.getByPlaceholderText('Add a personal message to your invitation...');
      const longMessage = 'a'.repeat(501); // Exceeds 500 character limit

      await user.type(messageInput, longMessage);

      await waitFor(() => {
        expect(screen.getByText('Message must be 500 characters or less')).toBeInTheDocument();
      });
    });

    it('should show character count', async () => {
      const user = userEvent.setup();
      render(<InviteClientModal {...defaultProps} />);

      const messageInput = screen.getByPlaceholderText('Add a personal message to your invitation...');

      await user.type(messageInput, 'Hello world!');

      await waitFor(() => {
        expect(screen.getByText('12/500')).toBeInTheDocument();
      });
    });
  });

  describe('Preview Functionality', () => {
    it('should show invitation preview for email', async () => {
      const user = userEvent.setup();
      render(<InviteClientModal {...defaultProps} />);

      const emailInput = screen.getByPlaceholderText('client@example.com');
      await user.type(emailInput, 'client@example.com');

      await waitFor(() => {
        expect(screen.getByText('Invitation Preview')).toBeInTheDocument();
        expect(screen.getByText('client@example.com')).toBeInTheDocument();
        expect(screen.getByText('John Coach')).toBeInTheDocument();
        expect(screen.getByText('Email')).toBeInTheDocument();
      });
    });

    it('should show invitation preview for username', async () => {
      const user = userEvent.setup();
      render(<InviteClientModal {...defaultProps} />);

      // Switch to username tab
      const usernameTab = screen.getByText('👤 Username');
      await user.click(usernameTab);

      const usernameInput = screen.getByPlaceholderText('username');
      await user.type(usernameInput, 'client_user');

      await waitFor(() => {
        expect(screen.getByText('Invitation Preview')).toBeInTheDocument();
        expect(screen.getByText('@client_user')).toBeInTheDocument();
        expect(screen.getByText('In-app notification')).toBeInTheDocument();
      });
    });
  });

  describe('Form Reset', () => {
    it('should reset form when modal is closed and reopened', async () => {
      const { rerender } = render(<InviteClientModal {...defaultProps} />);

      const emailInput = screen.getByPlaceholderText('client@example.com');
      await userEvent.type(emailInput, 'test@example.com');

      // Close modal
      rerender(<InviteClientModal {...defaultProps} show={false} />);

      // Reopen modal
      rerender(<InviteClientModal {...defaultProps} show={true} />);

      const newEmailInput = screen.getByPlaceholderText('client@example.com');
      expect(newEmailInput.value).toBe('');
    });
  });

  describe('Loading States', () => {
    it('should show loading state during submission', async () => {
      const user = userEvent.setup();
      // Mock a slow response
      mockSendInvitation.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

      render(<InviteClientModal {...defaultProps} />);

      const emailInput = screen.getByPlaceholderText('client@example.com');
      const submitButton = screen.getByText('📧 Send Invitation');

      await user.type(emailInput, 'client@example.com');
      await user.click(submitButton);

      expect(screen.getByText('Sending Invitation...')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();
    });
  });
});