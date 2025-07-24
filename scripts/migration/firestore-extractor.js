#!/usr/bin/env node

/**
 * Firestore Data Extraction Tool
 * 
 * This script extracts all user data from Firestore collections for migration to Supabase.
 * It handles large datasets with batching, progress tracking, and data validation.
 * 
 * Usage:
 *   node scripts/migration/firestore-extractor.js [options]
 * 
 * Options:
 *   --output-dir <path>     Output directory for extracted data (default: ./migration-data)
 *   --batch-size <number>   Batch size for processing (default: 100)
 *   --collections <list>    Comma-separated list of collections to extract (default: all)
 *   --validate              Enable data validation during extraction
 *   --dry-run              Show what would be extracted without actually extracting
 *   --verbose              Enable verbose logging
 *   --user-id <id>         Extract data for specific user only
 */

const admin = require('firebase-admin');
const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

// Configuration
const CONFIG = {
  outputDir: './migration-data',
  batchSize: 100,
  collections: [
    'users',
    'exercises',
    'exercises_metadata', 
    'programs',
    'workoutLogs',
    'userAnalytics'
  ],
  validate: false,
  dryRun: false,
  verbose: false,
  userId: null
};

// Progress tracking
class ProgressTracker {
  constructor() {
    this.startTime = Date.now();
    this.collections = new Map();
    this.totalDocuments = 0;
    this.processedDocuments = 0;
    this.errors = [];
    this.warnings = [];
  }

  startCollection(name, estimatedCount = 0) {
    this.collections.set(name, {
      name,
      estimatedCount,
      processedCount: 0,
      startTime: Date.now(),
      errors: [],
      warnings: []
    });
    this.log(`📂 Starting extraction of collection: ${name}`);
  }

  updateCollection(name, processedCount, totalCount = null) {
    const collection = this.collections.get(name);
    if (collection) {
      collection.processedCount = processedCount;
      if (totalCount !== null) {
        collection.estimatedCount = totalCount;
      }
      this.processedDocuments = Array.from(this.collections.values())
        .reduce((sum, col) => sum + col.processedCount, 0);
    }
  }

  addError(collectionName, error, documentId = null) {
    const errorInfo = {
      collection: collectionName,
      documentId,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    this.errors.push(errorInfo);
    
    const collection = this.collections.get(collectionName);
    if (collection) {
      collection.errors.push(errorInfo);
    }
    
    this.log(`❌ Error in ${collectionName}${documentId ? ` (doc: ${documentId})` : ''}: ${error.message}`);
  }

  addWarning(collectionName, warning, documentId = null) {
    const warningInfo = {
      collection: collectionName,
      documentId,
      warning,
      timestamp: new Date().toISOString()
    };
    
    this.warnings.push(warningInfo);
    
    const collection = this.collections.get(collectionName);
    if (collection) {
      collection.warnings.push(warningInfo);
    }
    
    if (CONFIG.verbose) {
      this.log(`⚠️ Warning in ${collectionName}${documentId ? ` (doc: ${documentId})` : ''}: ${warning}`);
    }
  }

  finishCollection(name) {
    const collection = this.collections.get(name);
    if (collection) {
      const duration = Date.now() - collection.startTime;
      this.log(`✅ Completed ${name}: ${collection.processedCount} documents in ${this.formatDuration(duration)}`);
      
      if (collection.errors.length > 0) {
        this.log(`   Errors: ${collection.errors.length}`);
      }
      if (collection.warnings.length > 0) {
        this.log(`   Warnings: ${collection.warnings.length}`);
      }
    }
  }

  getProgress() {
    const totalEstimated = Array.from(this.collections.values())
      .reduce((sum, col) => sum + col.estimatedCount, 0);
    
    const percentage = totalEstimated > 0 ? 
      ((this.processedDocuments / totalEstimated) * 100).toFixed(1) : 0;
    
    return {
      processedDocuments: this.processedDocuments,
      totalEstimated,
      percentage: `${percentage}%`,
      collections: Array.from(this.collections.values()),
      errors: this.errors.length,
      warnings: this.warnings.length,
      duration: this.formatDuration(Date.now() - this.startTime)
    };
  }

  getSummary() {
    const duration = Date.now() - this.startTime;
    const collections = Array.from(this.collections.values());
    
    return {
      totalDuration: this.formatDuration(duration),
      totalDocuments: this.processedDocuments,
      totalCollections: collections.length,
      totalErrors: this.errors.length,
      totalWarnings: this.warnings.length,
      collections: collections.map(col => ({
        name: col.name,
        documents: col.processedCount,
        duration: this.formatDuration(Date.now() - col.startTime),
        errors: col.errors.length,
        warnings: col.warnings.length
      })),
      errors: this.errors,
      warnings: this.warnings,
      averageDocsPerSecond: duration > 0 ? 
        ((this.processedDocuments / (duration / 1000)).toFixed(2)) : 0
    };
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
  }
}

// Data validator
class DataValidator {
  constructor() {
    this.schemas = {
      users: {
        required: ['email'],
        optional: ['name', 'experienceLevel', 'preferredUnits', 'age', 'weight', 'height', 'goals', 'availableEquipment', 'injuries', 'preferences', 'settings']
      },
      exercises: {
        required: ['name', 'primaryMuscleGroup', 'exerciseType'],
        optional: ['instructions', 'isGlobal', 'createdBy']
      },
      programs: {
        required: ['userId', 'name', 'duration', 'daysPerWeek'],
        optional: ['description', 'weightUnit', 'difficulty', 'goals', 'equipment', 'isTemplate', 'isCurrent', 'isActive', 'startDate', 'completedWeeks', 'workouts']
      },
      workoutLogs: {
        required: ['userId', 'date'],
        optional: ['programId', 'weekIndex', 'dayIndex', 'name', 'type', 'completedDate', 'isWorkoutFinished', 'isDraft', 'weightUnit', 'duration', 'notes', 'exercises']
      }
    };
  }

  validateDocument(collection, document) {
    const schema = this.schemas[collection];
    if (!schema) {
      return { valid: true, warnings: [`No validation schema for collection: ${collection}`] };
    }

    const errors = [];
    const warnings = [];

    // Check required fields
    for (const field of schema.required) {
      if (!(field in document) || document[field] === null || document[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check data types and formats
    if (collection === 'users') {
      if (document.email && !this.isValidEmail(document.email)) {
        warnings.push(`Invalid email format: ${document.email}`);
      }
      if (document.age && (typeof document.age !== 'number' || document.age < 0 || document.age > 150)) {
        warnings.push(`Invalid age value: ${document.age}`);
      }
    }

    if (collection === 'workoutLogs') {
      if (document.date && !this.isValidDate(document.date)) {
        warnings.push(`Invalid date format: ${document.date}`);
      }
    }

    // Check for orphaned references
    if (document.userId && !this.isValidId(document.userId)) {
      warnings.push(`Invalid userId format: ${document.userId}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidDate(date) {
    if (date instanceof Date) return !isNaN(date.getTime());
    if (typeof date === 'string') return !isNaN(Date.parse(date));
    if (date && date.seconds) return true; // Firestore Timestamp
    return false;
  }

  isValidId(id) {
    return typeof id === 'string' && id.length > 0;
  }
}

// Firestore extractor
class FirestoreExtractor {
  constructor(config) {
    this.config = config;
    this.progress = new ProgressTracker();
    this.validator = new DataValidator();
    this.db = null;
  }

  async initialize() {
    try {
      // Initialize Firebase Admin SDK
      if (!admin.apps.length) {
        // Try to use service account key if available
        const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
          './functions/sample-firebase-ai-app-d056c-firebase-adminsdk-fbsvc-047d03194a.json';
        
        try {
          const serviceAccount = require(path.resolve(serviceAccountPath));
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
          this.progress.log('✅ Firebase Admin initialized with service account');
        } catch (error) {
          // Fallback to default credentials
          admin.initializeApp();
          this.progress.log('✅ Firebase Admin initialized with default credentials');
        }
      }

      this.db = admin.firestore();
      
      // Create output directory
      await fs.mkdir(this.config.outputDir, { recursive: true });
      this.progress.log(`📁 Output directory created: ${this.config.outputDir}`);
      
    } catch (error) {
      throw new Error(`Failed to initialize Firebase Admin: ${error.message}`);
    }
  }

  async extractAllCollections() {
    this.progress.log('🚀 Starting Firestore data extraction...');
    
    if (this.config.dryRun) {
      this.progress.log('🔍 DRY RUN MODE - No data will be extracted');
    }

    const results = {};
    
    for (const collectionName of this.config.collections) {
      try {
        const data = await this.extractCollection(collectionName);
        results[collectionName] = {
          success: true,
          documentCount: data.length,
          filePath: path.join(this.config.outputDir, `${collectionName}.json`)
        };
      } catch (error) {
        this.progress.addError(collectionName, error);
        results[collectionName] = {
          success: false,
          error: error.message
        };
      }
    }

    // Generate extraction summary
    const summary = this.progress.getSummary();
    if (!this.config.dryRun) {
      await this.saveSummary(summary);
    }

    return { results, summary };
  }

  async extractCollection(collectionName) {
    this.progress.startCollection(collectionName);
    
    try {
      // Get collection reference
      let query = this.db.collection(collectionName);
      
      // Apply user filter if specified
      if (this.config.userId && this.hasUserIdField(collectionName)) {
        query = query.where('userId', '==', this.config.userId);
      }

      // Get total count for progress tracking
      const countSnapshot = await query.count().get();
      const totalCount = countSnapshot.data().count;
      this.progress.updateCollection(collectionName, 0, totalCount);
      
      if (totalCount === 0) {
        this.progress.log(`📭 Collection ${collectionName} is empty`);
        this.progress.finishCollection(collectionName);
        return [];
      }

      this.progress.log(`📊 Found ${totalCount} documents in ${collectionName}`);
      
      if (this.config.dryRun) {
        this.progress.updateCollection(collectionName, totalCount);
        this.progress.finishCollection(collectionName);
        return [];
      }

      // Extract documents in batches
      const allDocuments = [];
      let lastDoc = null;
      let processedCount = 0;

      while (processedCount < totalCount) {
        let batchQuery = query.limit(this.config.batchSize);
        
        if (lastDoc) {
          batchQuery = batchQuery.startAfter(lastDoc);
        }

        const snapshot = await batchQuery.get();
        
        if (snapshot.empty) {
          break;
        }

        const batchDocuments = [];
        
        for (const doc of snapshot.docs) {
          try {
            const data = this.processDocument(doc, collectionName);
            batchDocuments.push(data);
            lastDoc = doc;
          } catch (error) {
            this.progress.addError(collectionName, error, doc.id);
          }
        }

        allDocuments.push(...batchDocuments);
        processedCount += batchDocuments.length;
        
        this.progress.updateCollection(collectionName, processedCount);
        
        if (CONFIG.verbose) {
          this.progress.log(`   Processed ${processedCount}/${totalCount} documents`);
        }

        // Small delay to avoid overwhelming Firestore
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Handle subcollections for specific collections
      if (this.hasSubcollections(collectionName)) {
        await this.extractSubcollections(collectionName, allDocuments);
      }

      // Save collection data
      await this.saveCollectionData(collectionName, allDocuments);
      
      this.progress.finishCollection(collectionName);
      return allDocuments;
      
    } catch (error) {
      this.progress.addError(collectionName, error);
      throw error;
    }
  }

  processDocument(doc, collectionName) {
    const data = {
      id: doc.id,
      ...doc.data()
    };

    // Convert Firestore timestamps to ISO strings
    this.convertTimestamps(data);
    
    // Validate document if enabled
    if (this.config.validate) {
      const validation = this.validator.validateDocument(collectionName, data);
      
      if (!validation.valid) {
        validation.errors.forEach(error => 
          this.progress.addError(collectionName, new Error(error), doc.id)
        );
      }
      
      validation.warnings.forEach(warning => 
        this.progress.addWarning(collectionName, warning, doc.id)
      );
    }

    return data;
  }

  convertTimestamps(obj) {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        if (value.seconds && value.nanoseconds !== undefined) {
          // Firestore Timestamp
          obj[key] = new Date(value.seconds * 1000 + value.nanoseconds / 1000000).toISOString();
        } else if (value instanceof Date) {
          obj[key] = value.toISOString();
        } else if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'object') {
              this.convertTimestamps(item);
            }
          });
        } else {
          this.convertTimestamps(value);
        }
      }
    }
  }

  async extractSubcollections(parentCollection, parentDocuments) {
    // Handle specific subcollections based on collection type
    if (parentCollection === 'programs') {
      await this.extractProgramWorkouts(parentDocuments);
    }
  }

  async extractProgramWorkouts(programs) {
    this.progress.log('📂 Extracting program workouts subcollections...');
    
    for (const program of programs) {
      try {
        const workoutsRef = this.db.collection('programs').doc(program.id).collection('workouts');
        const workoutsSnapshot = await workoutsRef.get();
        
        const workouts = [];
        for (const workoutDoc of workoutsSnapshot.docs) {
          const workoutData = this.processDocument(workoutDoc, 'program_workouts');
          
          // Extract exercises subcollection
          const exercisesRef = workoutDoc.ref.collection('exercises');
          const exercisesSnapshot = await exercisesRef.get();
          
          const exercises = exercisesSnapshot.docs.map(exerciseDoc => 
            this.processDocument(exerciseDoc, 'program_exercises')
          );
          
          workoutData.exercises = exercises;
          workouts.push(workoutData);
        }
        
        program.workouts = workouts;
        
      } catch (error) {
        this.progress.addError('program_workouts', error, program.id);
      }
    }
  }

  hasUserIdField(collectionName) {
    return ['programs', 'workoutLogs', 'userAnalytics'].includes(collectionName);
  }

  hasSubcollections(collectionName) {
    return ['programs'].includes(collectionName);
  }

  async saveCollectionData(collectionName, data) {
    const filePath = path.join(this.config.outputDir, `${collectionName}.json`);
    const jsonData = JSON.stringify(data, null, 2);
    
    await fs.writeFile(filePath, jsonData, 'utf8');
    this.progress.log(`💾 Saved ${data.length} documents to ${filePath}`);
  }

  async saveSummary(summary) {
    const summaryPath = path.join(this.config.outputDir, 'extraction-summary.json');
    const summaryData = JSON.stringify(summary, null, 2);
    
    await fs.writeFile(summaryPath, summaryData, 'utf8');
    this.progress.log(`📋 Extraction summary saved to ${summaryPath}`);
  }
}

// CLI argument parsing
function parseArguments() {
  const args = process.argv.slice(2);
  const config = { ...CONFIG };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--output-dir':
        config.outputDir = args[++i];
        break;
      case '--batch-size':
        config.batchSize = parseInt(args[++i]);
        break;
      case '--collections':
        config.collections = args[++i].split(',').map(c => c.trim());
        break;
      case '--validate':
        config.validate = true;
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--user-id':
        config.userId = args[++i];
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
  }
  
  return config;
}

function printHelp() {
  console.log(`
Firestore Data Extraction Tool

Usage: node scripts/migration/firestore-extractor.js [options]

Options:
  --output-dir <path>     Output directory for extracted data (default: ./migration-data)
  --batch-size <number>   Batch size for processing (default: 100)
  --collections <list>    Comma-separated list of collections to extract (default: all)
  --validate              Enable data validation during extraction
  --dry-run              Show what would be extracted without actually extracting
  --verbose              Enable verbose logging
  --user-id <id>         Extract data for specific user only
  --help                 Show this help message

Examples:
  # Extract all collections
  node scripts/migration/firestore-extractor.js

  # Extract specific collections with validation
  node scripts/migration/firestore-extractor.js --collections users,programs --validate

  # Dry run to see what would be extracted
  node scripts/migration/firestore-extractor.js --dry-run --verbose

  # Extract data for specific user
  node scripts/migration/firestore-extractor.js --user-id user123 --verbose
`);
}

// Main execution
async function main() {
  try {
    const config = parseArguments();
    Object.assign(CONFIG, config);
    
    console.log('🔧 Configuration:', CONFIG);
    
    const extractor = new FirestoreExtractor(CONFIG);
    await extractor.initialize();
    
    const { results, summary } = await extractor.extractAllCollections();
    
    console.log('\n📊 Extraction Results:');
    console.log('='.repeat(50));
    
    for (const [collection, result] of Object.entries(results)) {
      if (result.success) {
        console.log(`✅ ${collection}: ${result.documentCount} documents`);
      } else {
        console.log(`❌ ${collection}: ${result.error}`);
      }
    }
    
    console.log('\n📋 Summary:');
    console.log(`   Total Duration: ${summary.totalDuration}`);
    console.log(`   Total Documents: ${summary.totalDocuments}`);
    console.log(`   Total Collections: ${summary.totalCollections}`);
    console.log(`   Total Errors: ${summary.totalErrors}`);
    console.log(`   Total Warnings: ${summary.totalWarnings}`);
    console.log(`   Average Docs/Second: ${summary.averageDocsPerSecond}`);
    
    if (summary.totalErrors > 0) {
      console.log('\n❌ Errors occurred during extraction. Check extraction-summary.json for details.');
      process.exit(1);
    }
    
    console.log('\n🎉 Data extraction completed successfully!');
    
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { FirestoreExtractor, DataValidator, ProgressTracker };