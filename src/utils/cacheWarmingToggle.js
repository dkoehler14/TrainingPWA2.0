/**
 * Cache Warming Toggle Utility
 * 
 * Simple utility to help toggle cache warming features during testing
 */

import { cacheWarmingConfig, minimalConfig, pageOnlyConfig, testingConfig } from '../config/cacheWarmingConfig.js';

/**
 * Available cache warming modes
 */
export const CACHE_WARMING_MODES = {
  FULL: 'full',           // All features enabled
  TESTING: 'testing',     // Page-context disabled, others enabled
  PAGE_ONLY: 'pageOnly',  // Only page-based warming
  MINIMAL: 'minimal',     // Only basic warming
  DISABLED: 'disabled'    // All warming disabled
};

/**
 * Get configuration for a specific mode
 * @param {string} mode - Cache warming mode
 * @returns {Object} Configuration object
 */
export function getCacheWarmingConfig(mode = CACHE_WARMING_MODES.TESTING) {
  switch (mode) {
    case CACHE_WARMING_MODES.FULL:
      return {
        ...cacheWarmingConfig,
        simplifiedMode: false,
        enableDayBasedWarming: true,
        enableTimeBasedWarming: true,
        enableContextAnalysis: true
      };
      
    case CACHE_WARMING_MODES.TESTING:
      return testingConfig;
      
    case CACHE_WARMING_MODES.PAGE_ONLY:
      return pageOnlyConfig;
      
    case CACHE_WARMING_MODES.MINIMAL:
      return minimalConfig;
      
    case CACHE_WARMING_MODES.DISABLED:
      return {
        ...minimalConfig,
        simplifiedMode: true,
        enableDayBasedWarming: false,
        enableTimeBasedWarming: false,
        enableContextAnalysis: false,
        maxQueueSize: 0,
        maxConcurrentWarming: 0
      };
      
    default:
      console.warn(`Unknown cache warming mode: ${mode}, using testing mode`);
      return testingConfig;
  }
}

/**
 * Check if page-context warming is currently disabled
 * @returns {boolean} True if page-context warming is disabled
 */
export function isPageContextWarmingDisabled() {
  return process.env.REACT_APP_DISABLE_PAGE_CONTEXT_WARMING === 'true' || 
         testingConfig.enableContextAnalysis === false;
}

/**
 * Check if simplified mode is enabled
 * @returns {boolean} True if simplified mode is enabled
 */
export function isSimplifiedModeEnabled() {
  return process.env.REACT_APP_CACHE_WARMING_SIMPLIFIED_MODE === 'true' || 
         testingConfig.simplifiedMode === true;
}

/**
 * Get current cache warming status
 * @returns {Object} Status information
 */
export function getCacheWarmingStatus() {
  const config = testingConfig;
  
  return {
    mode: isSimplifiedModeEnabled() ? 'simplified' : 'advanced',
    pageContextEnabled: config.enableContextAnalysis && !isPageContextWarmingDisabled(),
    timeBasedEnabled: config.enableTimeBasedWarming,
    dayBasedEnabled: config.enableDayBasedWarming,
    simplifiedMode: config.simplifiedMode,
    environmentOverrides: {
      disablePageContext: process.env.REACT_APP_DISABLE_PAGE_CONTEXT_WARMING === 'true',
      simplifiedMode: process.env.REACT_APP_CACHE_WARMING_SIMPLIFIED_MODE === 'true'
    }
  };
}

/**
 * Log current cache warming configuration
 */
export function logCacheWarmingConfig() {
  const status = getCacheWarmingStatus();
  
  console.group('🔥 Cache Warming Configuration');
  console.log('Mode:', status.mode);
  console.log('Page Context Warming:', status.pageContextEnabled ? '✅ Enabled' : '❌ Disabled');
  console.log('Time-Based Warming:', status.timeBasedEnabled ? '✅ Enabled' : '❌ Disabled');
  console.log('Day-Based Warming:', status.dayBasedEnabled ? '✅ Enabled' : '❌ Disabled');
  console.log('Simplified Mode:', status.simplifiedMode ? '✅ Enabled' : '❌ Disabled');
  
  if (Object.values(status.environmentOverrides).some(Boolean)) {
    console.group('Environment Overrides:');
    Object.entries(status.environmentOverrides).forEach(([key, value]) => {
      if (value) {
        console.log(`${key}:`, '✅ Active');
      }
    });
    console.groupEnd();
  }
  
  console.groupEnd();
}

export default {
  CACHE_WARMING_MODES,
  getCacheWarmingConfig,
  isPageContextWarmingDisabled,
  isSimplifiedModeEnabled,
  getCacheWarmingStatus,
  logCacheWarmingConfig
};