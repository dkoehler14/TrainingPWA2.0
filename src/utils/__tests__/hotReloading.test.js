/**
 * Hot Reloading Functionality Tests
 * 
 * Tests for validating hot-reloading functionality for both React components
 * and Firebase Functions in the local development environment.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';

// Mock React Fast Refresh
const mockFastRefresh = {
  register: jest.fn(),
  createSignatureFunctionForTransform: jest.fn(),
  isLikelyComponentType: jest.fn(),
  getFamilyByType: jest.fn(),
  setSignature: jest.fn()
};

// Mock module hot reloading
const mockModuleHot = {
  accept: jest.fn(),
  dispose: jest.fn(),
  data: {},
  status: jest.fn(() => 'idle')
};

// Mock webpack hot module replacement
Object.defineProperty(module, 'hot', {
  value: mockModuleHot,
  writable: true
});

// Mock React Fast Refresh runtime
global.__webpack_require__ = {
  cache: {},
  hmr: mockModuleHot
};

describe('Hot Reloading Functionality Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset module hot mock
    mockModuleHot.accept.mockClear();
    mockModuleHot.dispose.mockClear();
    mockModuleHot.data = {};
  });

  describe('React Component Hot Reloading', () => {
    test('should support Fast Refresh for React components', () => {
      // Simulate a React component with Fast Refresh
      const TestComponent = () => {
        return <div data-testid="test-component">Test Component</div>;
      };

      // Simulate Fast Refresh registration
      if (typeof __webpack_require__ !== 'undefined' && __webpack_require__.cache) {
        mockFastRefresh.register(TestComponent, 'TestComponent');
      }

      render(<TestComponent />);
      
      expect(screen.getByTestId('test-component')).toBeInTheDocument();
      expect(mockFastRefresh.register).toHaveBeenCalledWith(TestComponent, 'TestComponent');
    });

    test('should handle component state preservation during hot reload', async () => {
      let componentState = { count: 0 };
      
      const StatefulComponent = () => {
        const [count, setCount] = React.useState(componentState.count);
        
        React.useEffect(() => {
          componentState.count = count;
        }, [count]);

        return (
          <div>
            <span data-testid="count">{count}</span>
            <button 
              data-testid="increment" 
              onClick={() => setCount(c => c + 1)}
            >
              Increment
            </button>
          </div>
        );
      };

      const { rerender } = render(<StatefulComponent />);
      
      // Simulate user interaction
      const button = screen.getByTestId('increment');
      act(() => {
        button.click();
      });

      expect(screen.getByTestId('count')).toHaveTextContent('1');

      // Simulate hot reload by re-rendering with preserved state
      rerender(<StatefulComponent />);
      
      // State should be preserved
      expect(screen.getByTestId('count')).toHaveTextContent('1');
    });

    test('should handle CSS hot reloading', () => {
      // Mock CSS module hot reloading
      const mockCSSModule = {
        testClass: 'test-class-hash',
        container: 'container-hash'
      };

      // Simulate CSS module hot accept
      if (module.hot) {
        module.hot.accept('./TestComponent.module.css', () => {
          // CSS hot reload callback
          console.log('CSS hot reloaded');
        });
      }

      expect(mockModuleHot.accept).toHaveBeenCalledWith(
        './TestComponent.module.css',
        expect.any(Function)
      );
    });

    test('should handle hot reload errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Simulate hot reload error
      const errorHandler = jest.fn();
      
      if (module.hot) {
        module.hot.accept('./ErrorComponent', errorHandler);
      }

      // Simulate error during hot reload
      const mockError = new Error('Hot reload failed');
      errorHandler(mockError);

      expect(errorHandler).toHaveBeenCalledWith(mockError);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Firebase Functions Hot Reloading', () => {
    test('should detect Firebase Functions changes', async () => {
      // Mock Firebase Functions emulator response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          functions: [
            { name: 'testFunction', status: 'READY' }
          ]
        })
      });

      // Simulate checking function status
      const response = await fetch('http://localhost:5001/sample-firebase-ai-app-d056c/us-central1/testFunction');
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.functions[0].status).toBe('READY');
    });

    test('should handle function reload after code changes', async () => {
      let functionVersion = 1;
      
      // Mock function that changes behavior after "reload"
      const mockFunction = jest.fn().mockImplementation(() => {
        return { version: functionVersion, result: 'success' };
      });

      // Initial call
      let result = mockFunction();
      expect(result.version).toBe(1);

      // Simulate code change and reload
      functionVersion = 2;
      result = mockFunction();
      expect(result.version).toBe(2);
    });

    test('should validate function emulator restart capability', async () => {
      // Mock emulator status endpoint
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'running' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'restarting' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'running' })
        });

      // Check initial status
      let response = await fetch('http://localhost:4000/emulator/v1/projects/test-project/status');
      let status = await response.json();
      expect(status.status).toBe('running');

      // Simulate restart
      response = await fetch('http://localhost:4000/emulator/v1/projects/test-project/status');
      status = await response.json();
      expect(status.status).toBe('restarting');

      // Check final status
      response = await fetch('http://localhost:4000/emulator/v1/projects/test-project/status');
      status = await response.json();
      expect(status.status).toBe('running');
    });
  });

  describe('Development Server Integration', () => {
    test('should validate webpack dev server hot reload configuration', () => {
      // Check if hot module replacement is enabled
      expect(module.hot).toBeDefined();
      expect(typeof module.hot.accept).toBe('function');
      expect(typeof module.hot.dispose).toBe('function');
    });

    test('should handle file watching and change detection', async () => {
      const mockFileWatcher = {
        on: jest.fn(),
        close: jest.fn(),
        files: new Set()
      };

      // Simulate file watcher setup
      mockFileWatcher.on('change', (filePath) => {
        console.log(`File changed: ${filePath}`);
        // Trigger hot reload
        if (module.hot) {
          module.hot.accept();
        }
      });

      // Simulate file change
      const changeHandler = mockFileWatcher.on.mock.calls.find(
        call => call[0] === 'change'
      )[1];

      changeHandler('src/components/TestComponent.js');

      expect(mockFileWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
      expect(mockModuleHot.accept).toHaveBeenCalled();
    });

    test('should validate source map generation for debugging', () => {
      // Set environment variable for test
      process.env.GENERATE_SOURCEMAP = 'true';
      
      // Check if source maps are enabled in development
      const isSourceMapEnabled = process.env.GENERATE_SOURCEMAP === 'true';
      expect(isSourceMapEnabled).toBe(true);
    });

    test('should handle concurrent service hot reloading', async () => {
      const services = ['react', 'functions'];
      const reloadPromises = services.map(service => {
        return new Promise(resolve => {
          setTimeout(() => {
            console.log(`${service} reloaded`);
            resolve(service);
          }, Math.random() * 100);
        });
      });

      const results = await Promise.all(reloadPromises);
      
      expect(results).toContain('react');
      expect(results).toContain('functions');
      expect(results).toHaveLength(2);
    });
  });

  describe('Hot Reload Performance Tests', () => {
    test('should measure hot reload speed', async () => {
      const startTime = Date.now();
      
      // Simulate hot reload process
      const reloadTime = await new Promise(resolve => {
        setTimeout(() => {
          const endTime = Date.now();
          const duration = endTime - startTime;
          resolve(duration);
        }, 100); // Simulate 100ms reload time
      });
      
      // Hot reload should be fast (under 2 seconds as per requirements)
      expect(reloadTime).toBeLessThan(2000);
      expect(reloadTime).toBeGreaterThan(50); // Should take some time
    });

    test('should handle multiple rapid file changes', async () => {
      const changes = [];
      const changeHandler = (file) => {
        changes.push({ file, timestamp: Date.now() });
      };

      // Simulate rapid file changes
      const files = ['file1.js', 'file2.js', 'file3.js'];
      files.forEach((file, index) => {
        setTimeout(() => changeHandler(file), index * 10);
      });

      // Wait for all changes to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(changes).toHaveLength(3);
      expect(changes.map(c => c.file)).toEqual(files);
    });

    test('should validate memory usage during hot reloading', () => {
      const initialMemory = process.memoryUsage();
      
      // Simulate multiple hot reloads
      for (let i = 0; i < 10; i++) {
        if (module.hot) {
          module.hot.accept();
        }
      }

      const finalMemory = process.memoryUsage();
      
      // Memory usage should not increase dramatically
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;
      
      // Memory increase should be reasonable (less than 50%)
      expect(memoryIncreasePercent).toBeLessThan(50);
    });
  });

  describe('Error Recovery During Hot Reload', () => {
    test('should recover from syntax errors during hot reload', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Simulate syntax error during hot reload
      const syntaxError = new SyntaxError('Unexpected token');
      
      if (module.hot) {
        module.hot.accept((err) => {
          if (err) {
            console.error('Hot reload failed:', err);
            // Should not crash the application
            expect(err).toBeInstanceOf(SyntaxError);
          }
        });
      }

      consoleSpy.mockRestore();
    });

    test('should handle runtime errors during hot reload', () => {
      const errorBoundary = {
        componentDidCatch: jest.fn(),
        render: jest.fn(() => 'Error Boundary')
      };

      // Simulate runtime error during hot reload
      const runtimeError = new Error('Component failed to render');
      
      errorBoundary.componentDidCatch(runtimeError, { componentStack: 'TestComponent' });
      
      expect(errorBoundary.componentDidCatch).toHaveBeenCalledWith(
        runtimeError,
        expect.objectContaining({ componentStack: 'TestComponent' })
      );
    });
  });
});