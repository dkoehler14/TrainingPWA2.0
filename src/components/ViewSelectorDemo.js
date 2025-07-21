import React, { useState } from 'react';
import ViewSelector from './ViewSelector';

const ViewSelectorDemo = () => {
  const [activeView, setActiveView] = useState('programs');

  const options = [
    { value: 'programs', label: 'Programs' },
    { value: 'quick-workouts', label: 'Quick Workouts' }
  ];

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2>ViewSelector Component Demo</h2>
      
      <div style={{ marginBottom: '2rem' }}>
        <h3>Default ViewSelector</h3>
        <ViewSelector
          activeView={activeView}
          onViewChange={setActiveView}
          options={options}
        />
        <p>Current view: <strong>{activeView}</strong></p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>Disabled ViewSelector</h3>
        <ViewSelector
          activeView={activeView}
          onViewChange={setActiveView}
          options={options}
          disabled={true}
        />
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>Custom Styled ViewSelector</h3>
        <ViewSelector
          activeView={activeView}
          onViewChange={setActiveView}
          options={options}
          className="custom-view-selector"
        />
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>Instructions</h3>
        <ul>
          <li>Click the dropdown to open it</li>
          <li>Use keyboard navigation (Tab, Enter, Arrow keys, Escape)</li>
          <li>Click outside to close the dropdown</li>
          <li>Test with screen readers for accessibility</li>
        </ul>
      </div>
    </div>
  );
};

export default ViewSelectorDemo;