import React from 'react';
import { Alert } from 'react-bootstrap';

const ErrorMessage = ({ error, onDismiss }) => {
  if (!error) return null;

  return (
    <Alert variant="danger" onClose={onDismiss} dismissible>
      <Alert.Heading>Error</Alert.Heading>
      <p>{error}</p>
    </Alert>
  );
};

export default ErrorMessage; 