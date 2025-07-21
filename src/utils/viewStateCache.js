/**
 * View State Cache Utility
 * 
 * Manages state preservation for the ProgramsWorkoutHub consolidated page.
 * Provides efficient caching and retrieval of view-specific state data.
 */

class ViewStateCache {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 10; // Maximum number of cached states per view
    this.compressionEnabled = true;
  }

  // Generate cache key
  generateKey(viewId, stateType = 'default') {
    return `${viewId}_${stateType}`;
  }

  // Compress state data for storage efficiency
  compressState(state) {
    if (!this.compressionEnabled || !state) return state;
    
    try {
      // Remove null/undefined values and empty objects/arrays
      const cleaned = this.cleanState(state);
      return cleaned;
    } catch (error) {
      console.warn('[ViewStateCache] State compression failed:', error);
      return state;
    }
  }

  // Clean state by removing empty values
  cleanState(obj) {
    if (obj === null || obj === undefined) return null;
    
    if (Array.isArray(obj)) {
      const cleaned = obj.filter(item => item !== null && item !== undefined);
      return cleaned.length > 0 ? cleaned : null;
    }
    
    if (typeof obj === 'object') {
      const cleaned = {};
      Object.keys(obj).forEach(key => {
        const value = this.cleanState(obj[key]);
        if (value !== null && value !== undefined) {
          cleaned[key] = value;
        }
      });
      return Object.keys(cleaned).length > 0 ? cleaned : null;
    }
    
    return obj;
  }

  // Set state for a specific view
  setState(viewId, state, stateType = 'default') {
    const key = this.generateKey(viewId, stateType);
    const compressedState = this.compressState(state);
    
    if (!this.cache.has(viewId)) {
      this.cache.set(viewId, new Map());
    }
    
    const viewCache = this.cache.get(viewId);
    
    // Implement LRU cache behavior
    if (viewCache.size >= this.maxCacheSize) {
      const firstKey = viewCache.keys().next().value;
      viewCache.delete(firstKey);
    }
    
    viewCache.set(stateType, {
      state: compressedState,
      timestamp: Date.now(),
      size: JSON.stringify(compressedState).length
    });
    
    // Emit cache update event for monitoring
    this.emitCacheEvent('state_updated', {
      viewId,
      stateType,
      size: viewCache.get(stateType).size
    });
  }

  // Get state for a specific view
  getState(viewId, stateType = 'default') {
    const viewCache = this.cache.get(viewId);
    if (!viewCache) return {};
    
    const cachedData = viewCache.get(stateType);
    if (!cachedData) return {};
    
    // Update access timestamp for LRU
    cachedData.lastAccessed = Date.now();
    
    return cachedData.state || {};
  }

  // Check if state exists for a view
  hasState(viewId, stateType = 'default') {
    const viewCache = this.cache.get(viewId);
    return !!(viewCache && viewCache.has(stateType));
  }

  // Clear state for a specific view
  clearState(viewId, stateType = null) {
    if (stateType) {
      const viewCache = this.cache.get(viewId);
      if (viewCache) {
        viewCache.delete(stateType);
        if (viewCache.size === 0) {
          this.cache.delete(viewId);
        }
      }
    } else {
      this.cache.delete(viewId);
    }
    
    this.emitCacheEvent('state_cleared', { viewId, stateType });
  }

  // Clear all cached states
  clearAll() {
    this.cache.clear();
    this.emitCacheEvent('cache_cleared', {});
  }

  // Get cache statistics
  getStats() {
    const stats = {
      totalViews: this.cache.size,
      totalStates: 0,
      totalSize: 0,
      viewBreakdown: {}
    };
    
    this.cache.forEach((viewCache, viewId) => {
      stats.totalStates += viewCache.size;
      stats.viewBreakdown[viewId] = {
        stateCount: viewCache.size,
        states: {}
      };
      
      viewCache.forEach((cachedData, stateType) => {
        stats.totalSize += cachedData.size;
        stats.viewBreakdown[viewId].states[stateType] = {
          size: cachedData.size,
          timestamp: cachedData.timestamp,
          lastAccessed: cachedData.lastAccessed || cachedData.timestamp
        };
      });
    });
    
    return stats;
  }

  // Merge state with existing cached state
  mergeState(viewId, newState, stateType = 'default') {
    const existingState = this.getState(viewId, stateType);
    const mergedState = { ...existingState, ...newState };
    this.setState(viewId, mergedState, stateType);
    return mergedState;
  }

  // Get state with fallback
  getStateWithFallback(viewId, stateType = 'default', fallback = {}) {
    const state = this.getState(viewId, stateType);
    return Object.keys(state).length > 0 ? state : fallback;
  }

  // Cleanup old cache entries
  cleanup(maxAge = 30 * 60 * 1000) { // 30 minutes default
    const now = Date.now();
    const viewsToDelete = [];
    
    this.cache.forEach((viewCache, viewId) => {
      const statesToDelete = [];
      
      viewCache.forEach((cachedData, stateType) => {
        if (now - cachedData.timestamp > maxAge) {
          statesToDelete.push(stateType);
        }
      });
      
      statesToDelete.forEach(stateType => {
        viewCache.delete(stateType);
      });
      
      if (viewCache.size === 0) {
        viewsToDelete.push(viewId);
      }
    });
    
    viewsToDelete.forEach(viewId => {
      this.cache.delete(viewId);
    });
    
    if (viewsToDelete.length > 0 || this.cache.size > 0) {
      this.emitCacheEvent('cache_cleaned', {
        deletedViews: viewsToDelete.length,
        remainingViews: this.cache.size
      });
    }
  }

  // Event emission for monitoring
  emitCacheEvent(eventType, data) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ViewStateCache] ${eventType}:`, data);
    }
  }

  // Export cache for debugging
  exportCache() {
    const exported = {};
    this.cache.forEach((viewCache, viewId) => {
      exported[viewId] = {};
      viewCache.forEach((cachedData, stateType) => {
        exported[viewId][stateType] = cachedData;
      });
    });
    return exported;
  }
}

// Create singleton instance
const viewStateCache = new ViewStateCache();

// React hook for view state caching
export const useViewStateCache = () => {
  return {
    setState: viewStateCache.setState.bind(viewStateCache),
    getState: viewStateCache.getState.bind(viewStateCache),
    hasState: viewStateCache.hasState.bind(viewStateCache),
    clearState: viewStateCache.clearState.bind(viewStateCache),
    mergeState: viewStateCache.mergeState.bind(viewStateCache),
    getStateWithFallback: viewStateCache.getStateWithFallback.bind(viewStateCache),
    getStats: viewStateCache.getStats.bind(viewStateCache)
  };
};

export default viewStateCache;