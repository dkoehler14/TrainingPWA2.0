/**
 * Mock for react-router-dom
 */
const React = require('react');

const mockNavigate = jest.fn();
const mockUseParams = jest.fn(() => ({}));
const mockUseLocation = jest.fn(() => ({ pathname: '/' }));

module.exports = {
  useNavigate: () => mockNavigate,
  useParams: mockUseParams,
  useLocation: mockUseLocation,
  BrowserRouter: ({ children }) => children,
  Routes: ({ children }) => children,
  Route: ({ children }) => children,
  Navigate: () => null,
  Link: ({ children, to, ...props }) => React.createElement('a', { href: to, ...props }, children)
};