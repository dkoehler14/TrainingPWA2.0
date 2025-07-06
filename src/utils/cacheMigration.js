// Cache migration utility for transitioning to enhanced cache
import * as oldCache from '../api/firestoreCache';
import * as newCache from '../api/enhancedFirestoreCache';

class CacheMigrationUtility {
  constructor() {
    this.migrationLog = [];
    this.isMigrating = false;
  }

  // Create wrapper functions that use enhanced cache but maintain compatibility
  createCompatibilityWrappers() {
    const wrappers = {
      // Enhanced versions with same interface
      getCollectionCached: newCache.getCollectionCached,
      getCollectionGroupCached: newCache.getCollectionGroupCached,
      getSubcollectionCached: newCache.getSubcollectionCached,
      getDocCached: newCache.getDocCached,
      
      // Enhanced invalidation with backward compatibility
      invalidateCache: (path) => {
        // Support both old and new invalidation patterns
        if (typeof path === 'string') {
          return newCache.invalidateCache([path], { reason: 'legacy-call' });
        }
        return newCache.invalidateCache(path);
      },
      
      // New enhanced functions
      invalidateUserCache: newCache.invalidateUserCache,
      invalidateWorkoutCache: newCache.invalidateWorkoutCache,
      invalidateProgramCache: newCache.invalidateProgramCache,
      invalidateExerciseCache: newCache.invalidateExerciseCache,
      warmUserCache: newCache.warmUserCache,
      warmAppCache: newCache.warmAppCache,
      getCacheStats: newCache.getCacheStats,
      debugCache: newCache.debugCache
    };

    return wrappers;
  }

  // Analyze current cache usage patterns
  analyzeCacheUsage() {
    console.log('🔍 Analyzing current cache usage patterns...');
    
    const analysis = {
      timestamp: Date.now(),
      oldCacheStats: this.getOldCacheStats(),
      newCacheStats: newCache.getCacheStats(),
      recommendations: []
    };

    // Generate recommendations based on usage
    if (analysis.newCacheStats.hitRate < '70%') {
      analysis.recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'Consider implementing cache warming for better hit rates',
        action: 'warmUserCache'
      });
    }

    if (analysis.newCacheStats.cacheSize > 100) {
      analysis.recommendations.push({
        type: 'memory',
        priority: 'medium',
        message: 'Large cache size detected, consider cleanup strategies',
        action: 'cleanupCache'
      });
    }

    this.migrationLog.push({
      type: 'analysis',
      timestamp: Date.now(),
      data: analysis
    });

    return analysis;
  }

  // Get old cache statistics (limited info available)
  getOldCacheStats() {
    // Since old cache doesn't have stats, we'll provide basic info
    return {
      type: 'legacy',
      features: ['basic-caching', 'simple-invalidation'],
      limitations: ['no-stats', 'no-performance-monitoring', 'broad-invalidation']
    };
  }

  // Create migration plan
  createMigrationPlan(components = []) {
    const plan = {
      phases: [
        {
          name: 'Phase 1: Drop-in Replacement',
          description: 'Replace import statements with enhanced cache',
          effort: 'low',
          impact: 'medium',
          tasks: [
            'Update import statements in components',
            'Test existing functionality',
            'Verify cache behavior'
          ]
        },
        {
          name: 'Phase 2: Enhanced Features',
          description: 'Implement granular invalidation and cache warming',
          effort: 'medium',
          impact: 'high',
          tasks: [
            'Replace broad invalidateCache calls with specific functions',
            'Add cache warming to app initialization',
            'Implement user-specific cache warming'
          ]
        },
        {
          name: 'Phase 3: Performance Optimization',
          description: 'Add monitoring and advanced features',
          effort: 'medium',
          impact: 'high',
          tasks: [
            'Add performance monitoring',
            'Implement smart cache warming',
            'Add cache analytics dashboard'
          ]
        }
      ],
      affectedComponents: components,
      estimatedTime: '2-4 hours',
      riskLevel: 'low'
    };

    this.migrationLog.push({
      type: 'plan',
      timestamp: Date.now(),
      data: plan
    });

    return plan;
  }

  // Generate migration code for a component
  generateMigrationCode(componentPath, currentImports = []) {
    const migrations = [];

    // Import statement migration
    const oldImport = `import { ${currentImports.join(', ')} } from '../api/firestoreCache';`;
    const newImport = `import { ${currentImports.join(', ')} } from '../api/enhancedFirestoreCache';`;
    
    migrations.push({
      type: 'import',
      from: oldImport,
      to: newImport,
      file: componentPath
    });

    // Enhanced invalidation patterns
    const invalidationMigrations = [
      {
        type: 'function-call',
        from: `invalidateCache('workoutLogs')`,
        to: `invalidateWorkoutCache(userId)`,
        description: 'Use user-specific workout cache invalidation'
      },
      {
        type: 'function-call',
        from: `invalidateCache('programs')`,
        to: `invalidateProgramCache(userId)`,
        description: 'Use user-specific program cache invalidation'
      },
      {
        type: 'function-call',
        from: `invalidateCache('exercises')`,
        to: `invalidateExerciseCache()`,
        description: 'Use exercise-specific cache invalidation'
      }
    ];

    migrations.push(...invalidationMigrations);

    return migrations;
  }

  // Perform automatic migration for a component file
  async performComponentMigration(filePath, fileContent) {
    console.log(`🔄 Migrating component: ${filePath}`);
    
    let migratedContent = fileContent;
    const changes = [];

    try {
      // Replace import statements
      const importRegex = /import\s*{([^}]+)}\s*from\s*['"]\.\.\/api\/firestoreCache['"];?/g;
      const importMatch = importRegex.exec(fileContent);
      
      if (importMatch) {
        const imports = importMatch[1].split(',').map(i => i.trim());
        const oldImport = importMatch[0];
        const newImport = `import { ${imports.join(', ')} } from '../api/enhancedFirestoreCache';`;
        
        migratedContent = migratedContent.replace(oldImport, newImport);
        changes.push({
          type: 'import',
          from: oldImport,
          to: newImport
        });
      }

      // Replace specific invalidation patterns
      const invalidationReplacements = [
        {
          pattern: /invalidateCache\(['"]workoutLogs['"]\)/g,
          replacement: 'invalidateWorkoutCache(auth.currentUser?.uid)',
          description: 'User-specific workout cache invalidation'
        },
        {
          pattern: /invalidateCache\(['"]programs['"]\)/g,
          replacement: 'invalidateProgramCache(auth.currentUser?.uid)',
          description: 'User-specific program cache invalidation'
        },
        {
          pattern: /invalidateCache\(['"]exercises['"]\)/g,
          replacement: 'invalidateExerciseCache()',
          description: 'Exercise-specific cache invalidation'
        }
      ];

      invalidationReplacements.forEach(({ pattern, replacement, description }) => {
        const matches = migratedContent.match(pattern);
        if (matches) {
          migratedContent = migratedContent.replace(pattern, replacement);
          changes.push({
            type: 'invalidation',
            pattern: pattern.toString(),
            replacement,
            description,
            count: matches.length
          });
        }
      });

      this.migrationLog.push({
        type: 'component-migration',
        timestamp: Date.now(),
        file: filePath,
        changes,
        success: true
      });

      return {
        success: true,
        migratedContent,
        changes
      };

    } catch (error) {
      console.error(`❌ Migration failed for ${filePath}:`, error);
      
      this.migrationLog.push({
        type: 'component-migration',
        timestamp: Date.now(),
        file: filePath,
        changes: [],
        success: false,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        originalContent: fileContent
      };
    }
  }

  // Generate migration report
  generateMigrationReport() {
    const report = {
      timestamp: Date.now(),
      summary: {
        totalMigrations: this.migrationLog.filter(l => l.type === 'component-migration').length,
        successfulMigrations: this.migrationLog.filter(l => l.type === 'component-migration' && l.success).length,
        failedMigrations: this.migrationLog.filter(l => l.type === 'component-migration' && !l.success).length
      },
      details: this.migrationLog,
      recommendations: this.generatePostMigrationRecommendations()
    };

    return report;
  }

  // Generate post-migration recommendations
  generatePostMigrationRecommendations() {
    const recommendations = [
      {
        priority: 'high',
        category: 'performance',
        title: 'Implement Cache Warming',
        description: 'Add cache warming to app initialization for better performance',
        code: `
// In App.js useEffect
import cacheWarmingService from './services/cacheWarmingService';

useEffect(() => {
  if (user) {
    cacheWarmingService.smartWarmCache(user.uid, {
      lastVisitedPage: location.pathname,
      timeOfDay: new Date().getHours()
    });
  }
}, [user]);`
      },
      {
        priority: 'medium',
        category: 'monitoring',
        title: 'Add Cache Monitoring',
        description: 'Monitor cache performance and optimize based on usage patterns',
        code: `
// Add to development tools
import { getCacheStats, debugCache } from './api/enhancedFirestoreCache';

// In development mode
if (process.env.NODE_ENV === 'development') {
  window.cacheStats = getCacheStats;
  window.debugCache = debugCache;
}`
      },
      {
        priority: 'low',
        category: 'optimization',
        title: 'Implement Progressive Loading',
        description: 'Use progressive cache warming for better user experience',
        code: `
// For heavy components like ProgressTracker
import { progressiveWarmCache } from './services/cacheWarmingService';

useEffect(() => {
  if (user) {
    progressiveWarmCache(user.uid);
  }
}, [user]);`
      }
    ];

    return recommendations;
  }

  // Clear migration log
  clearLog() {
    this.migrationLog = [];
  }

  // Get migration status
  getStatus() {
    return {
      isMigrating: this.isMigrating,
      logEntries: this.migrationLog.length,
      lastActivity: this.migrationLog.length > 0 ? 
        this.migrationLog[this.migrationLog.length - 1].timestamp : null
    };
  }
}

// Create singleton instance
const cacheMigration = new CacheMigrationUtility();

export default cacheMigration;

// Export utility functions
export const {
  createCompatibilityWrappers,
  analyzeCacheUsage,
  createMigrationPlan,
  generateMigrationCode,
  performComponentMigration,
  generateMigrationReport,
  clearLog,
  getStatus
} = cacheMigration;

// Export enhanced cache functions for easy migration
export * from '../api/enhancedFirestoreCache';