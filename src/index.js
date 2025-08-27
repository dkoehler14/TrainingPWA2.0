import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import 'soft-ui-design-system/assets/css/soft-design-system.css'; // Soft UI styles
import './styles/global.css'

const root = ReactDOM.createRoot(document.getElementById('root'));

// Conditionally enable Strict Mode (can be controlled via environment variable)
const enableStrictMode = process.env.REACT_APP_ENABLE_STRICT_MODE === 'true';

if (enableStrictMode) {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  root.render(<App />);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
