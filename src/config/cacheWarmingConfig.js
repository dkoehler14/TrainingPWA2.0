/**
 * Cache Warming Configuration
 * 
 * This file allows you to easily control cache warming features.
 * Set any option to false to disable that feature gracefully.
 */

export const cacheWarmingConfig = {
  // === SIMPLIFIED MODE ===
  // Enable this to bypass all complex analysis and use basic warming only
  simplifiedMode: true,
  
  // === INDIVIDUAL FEATURE CONTROLS ===
  // Day-based warming (Monday-Friday priority boost)
  enableDayBasedWarming: true,
  
  // Time-based warming (morning/evening workout hours)
  enableTimeBasedWarming: true,
  
  // Context analysis (page-based priority)
  enableContextAnalysis: true,
  
  // === PERFORMANCE CONTROLS ===
  // Queue management
  maxQueueSize: 50, // Reduced from default 100
  maxConcurrentWarming: 2, // Reduced from default 3
  
  // Retry behavior
  maxRetries: 2, // Reduced from default 3
  retryDelays: [1000, 3000], // Simplified retry delays
  
  // Maintenance
  maintenanceInterval: 30, // Increased from default 15 minutes
  
  // === STORAGE ===
  // Disable persistence to reduce complexity
  enablePersistence: false,
  
  // === MONITORING ===
  // Disable advanced monitoring features
  enableMemoryTracking: false,
  enableBandwidthTracking: false,
  enableCostAnalysis: false,
  enableErrorRateMonitoring: false,
  enableDetailedLogging: false
};

// === PRESET CONFIGURATIONS ===

// Minimal configuration - only basic warming
export const minimalConfig = {
  simplifiedMode: true,
  enableDayBasedWarming: false,
  enableTimeBasedWarming: false,
  enableContextAnalysis: false,
  maxQueueSize: 20,
  maxConcurrentWarming: 1,
  maxRetries: 1,
  retryDelays: [2000],
  maintenanceInterval: 60,
  enablePersistence: false,
  enableMemoryTracking: false,
  enableBandwidthTracking: false,
  enableCostAnalysis: false,
  enableErrorRateMonitoring: false,
  enableDetailedLogging: false
};

// Page-only configuration - only page-based warming
export const pageOnlyConfig = {
  simplifiedMode: false,
  enableDayBasedWarming: false,
  enableTimeBasedWarming: false,
  enableContextAnalysis: true,
  maxQueueSize: 30,
  maxConcurrentWarming: 2,
  maxRetries: 2,
  retryDelays: [1000, 2000],
  maintenanceInterval: 45,
  enablePersistence: false,
  enableMemoryTracking: false,
  enableBandwidthTracking: false,
  enableCostAnalysis: false,
  enableErrorRateMonitoring: false,
  enableDetailedLogging: false
};

// Default export uses the main configuration
export default cacheWarmingConfig;