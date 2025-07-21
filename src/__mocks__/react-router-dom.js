/**
 * Mock for react-router-dom
 */
const React = require('react');

const mockNavigate = jest.fn();
const mockUseParams = jest.fn(() => ({}));
const mockUseLocation = jest.fn(() => ({ pathname: '/', search: '' }));

module.exports = {
  useNavigate: () => mockNavigate,
  useParams: mockUseParams,
  useLocation: mockUseLocation,
  BrowserRouter: ({ children }) => children,
  MemoryRouter: ({ children }) => children,
  Routes: ({ children }) => children,
  Route: ({ children }) => children,
  Navigate: () => null,
  Link: ({ children, to, ...props }) => React.createElement('a', { href: to, ...props }, children)
};