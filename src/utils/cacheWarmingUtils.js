/**
 * Cache Warming Utilities
 * 
 * Helper functions to manage cache warming configuration and provide
 * easy ways to switch between different warming modes.
 */

import { minimalConfig, pageOnlyConfig, cacheWarmingConfig } from '../config/cacheWarmingConfig.js';

/**
 * Get a simplified configuration that disables day-based warming
 * @param {Object} overrides - Additional configuration overrides
 * @returns {Object} Simplified configuration
 */
export function getSimplifiedConfig(overrides = {}) {
    return {
        ...cacheWarmingConfig,
        enableDayBasedWarming: false,
        enableTimeBasedWarming: false,
        maxQueueSize: 30,
        maxConcurrentWarming: 2,
        maintenanceInterval: 30,
        enablePersistence: false,
        ...overrides
    };
}

/**
 * Get a minimal configuration with only basic warming
 * @param {Object} overrides - Additional configuration overrides
 * @returns {Object} Minimal configuration
 */
export function getMinimalConfig(overrides = {}) {
    return {
        ...minimalConfig,
        ...overrides
    };
}

/**
 * Get a page-only configuration that only considers page context
 * @param {Object} overrides - Additional configuration overrides
 * @returns {Object} Page-only configuration
 */
export function getPageOnlyConfig(overrides = {}) {
    return {
        ...pageOnlyConfig,
        ...overrides
    };
}

/**
 * Check if day-based warming is enabled in a configuration
 * @param {Object} config - Configuration to check
 * @returns {boolean} True if day-based warming is enabled
 */
export function isDayBasedWarmingEnabled(config) {
    return config.enableDayBasedWarming !== false && !config.simplifiedMode;
}

/**
 * Check if time-based warming is enabled in a configuration
 * @param {Object} config - Configuration to check
 * @returns {boolean} True if time-based warming is enabled
 */
export function isTimeBasedWarmingEnabled(config) {
    return config.enableTimeBasedWarming !== false && !config.simplifiedMode;
}

/**
 * Get a human-readable description of the current configuration
 * @param {Object} config - Configuration to describe
 * @returns {string} Configuration description
 */
export function describeConfiguration(config) {
    if (config.simplifiedMode) {
        return 'Simplified mode - basic warming only';
    }

    const features = [];

    if (isDayBasedWarmingEnabled(config)) {
        features.push('day-based warming');
    }

    if (isTimeBasedWarmingEnabled(config)) {
        features.push('time-based warming');
    }

    if (config.enableContextAnalysis !== false) {
        features.push('page context analysis');
    }

    if (features.length === 0) {
        return 'Basic warming only';
    }

    return `Active features: ${features.join(', ')}`;
}

/**
 * Create a configuration that disables specific features
 * @param {Array<string>} featuresToDisable - Features to disable
 * @param {Object} baseConfig - Base configuration to modify
 * @returns {Object} Modified configuration
 */
export function disableFeatures(featuresToDisable = [], baseConfig = cacheWarmingConfig) {
    const config = { ...baseConfig };

    featuresToDisable.forEach(feature => {
        switch (feature) {
            case 'day-based':
            case 'dayBased':
                config.enableDayBasedWarming = false;
                break;
            case 'time-based':
            case 'timeBased':
                config.enableTimeBasedWarming = false;
                break;
            case 'context':
            case 'contextAnalysis':
                config.enableContextAnalysis = false;
                break;
            case 'persistence':
                config.enablePersistence = false;
                break;
            case 'monitoring':
                config.enableMemoryTracking = false;
                config.enableBandwidthTracking = false;
                config.enableCostAnalysis = false;
                config.enableErrorRateMonitoring = false;
                config.enableDetailedLogging = false;
                break;
            default:
                console.warn(`Unknown feature to disable: ${feature}`);
        }
    });

    return config;
}

export default {
    getSimplifiedConfig,
    getMinimalConfig,
    getPageOnlyConfig,
    isDayBasedWarmingEnabled,
    isTimeBasedWarmingEnabled,
    describeConfiguration,
    disableFeatures
};