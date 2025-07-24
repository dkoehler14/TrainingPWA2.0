#!/usr/bin/env node

/**
 * Data Integrity Checker
 * 
 * This script validates the integrity of extracted Firestore data and checks for:
 * - Missing required fields
 * - Invalid data types
 * - Broken relationships
 * - Data consistency issues
 * - Orphaned records
 * 
 * Usage:
 *   node scripts/migration/data-integrity-checker.js [options]
 */

const fs = require('fs').promises;
const path = require('path');

class DataIntegrityChecker {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.data = {};
    this.issues = {
      critical: [],
      warnings: [],
      info: []
    };
    this.stats = {
      totalDocuments: 0,
      collectionsChecked: 0,
      relationshipsValidated: 0,
      issuesFound: 0
    };
  }

  async loadData() {
    console.log('📂 Loading extracted data...');
    
    const collections = ['users', 'exercises', 'exercises_metadata', 'programs', 'workoutLogs', 'userAnalytics'];
    
    for (const collection of collections) {
      const filePath = path.join(this.dataDir, `${collection}.json`);
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        this.data[collection] = JSON.parse(fileContent);
        console.log(`✅ Loaded ${this.data[collection].length} documents from ${collection}`);
        this.stats.totalDocuments += this.data[collection].length;
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`⚠️ Collection ${collection} not found, skipping...`);
          this.data[collection] = [];
        } else {
          throw new Error(`Failed to load ${collection}: ${error.message}`);
        }
      }
    }
    
    this.stats.collectionsChecked = Object.keys(this.data).length;
  }

  async checkIntegrity() {
    console.log('\n🔍 Starting data integrity checks...');
    
    // Check each collection
    await this.checkUsers();
    await this.checkExercises();
    await this.checkPrograms();
    await this.checkWorkoutLogs();
    await this.checkUserAnalytics();
    
    // Check relationships
    await this.checkRelationships();
    
    // Check for orphaned records
    await this.checkOrphanedRecords();
    
    // Generate summary
    this.generateSummary();
  }

  async checkUsers() {
    console.log('👤 Checking users collection...');
    
    const users = this.data.users || [];
    const userIds = new Set();
    const emails = new Set();
    
    for (const user of users) {
      // Check required fields
      if (!user.email) {
        this.addIssue('critical', 'users', user.id, 'Missing required field: email');
      }
      
      // Check email format
      if (user.email && !this.isValidEmail(user.email)) {
        this.addIssue('warnings', 'users', user.id, `Invalid email format: ${user.email}`);
      }
      
      // Check for duplicate emails
      if (user.email) {
        if (emails.has(user.email)) {
          this.addIssue('critical', 'users', user.id, `Duplicate email: ${user.email}`);
        }
        emails.add(user.email);
      }
      
      // Check for duplicate user IDs
      if (userIds.has(user.id)) {
        this.addIssue('critical', 'users', user.id, 'Duplicate user ID');
      }
      userIds.add(user.id);
      
      // Check data types
      if (user.age && (typeof user.age !== 'number' || user.age < 0 || user.age > 150)) {
        this.addIssue('warnings', 'users', user.id, `Invalid age: ${user.age}`);
      }
      
      if (user.weight && (typeof user.weight !== 'number' || user.weight <= 0)) {
        this.addIssue('warnings', 'users', user.id, `Invalid weight: ${user.weight}`);
      }
      
      if (user.height && (typeof user.height !== 'number' || user.height <= 0)) {
        this.addIssue('warnings', 'users', user.id, `Invalid height: ${user.height}`);
      }
      
      // Check array fields
      if (user.goals && !Array.isArray(user.goals)) {
        this.addIssue('warnings', 'users', user.id, 'Goals should be an array');
      }
      
      if (user.availableEquipment && !Array.isArray(user.availableEquipment)) {
        this.addIssue('warnings', 'users', user.id, 'Available equipment should be an array');
      }
      
      if (user.injuries && !Array.isArray(user.injuries)) {
        this.addIssue('warnings', 'users', user.id, 'Injuries should be an array');
      }
    }
    
    console.log(`   Checked ${users.length} users`);
  }

  async checkExercises() {
    console.log('💪 Checking exercises collection...');
    
    const exercises = this.data.exercises || [];
    const exerciseIds = new Set();
    const exerciseNames = new Set();
    
    for (const exercise of exercises) {
      // Check required fields
      if (!exercise.name) {
        this.addIssue('critical', 'exercises', exercise.id, 'Missing required field: name');
      }
      
      if (!exercise.primaryMuscleGroup) {
        this.addIssue('critical', 'exercises', exercise.id, 'Missing required field: primaryMuscleGroup');
      }
      
      if (!exercise.exerciseType) {
        this.addIssue('critical', 'exercises', exercise.id, 'Missing required field: exerciseType');
      }
      
      // Check for duplicate IDs
      if (exerciseIds.has(exercise.id)) {
        this.addIssue('critical', 'exercises', exercise.id, 'Duplicate exercise ID');
      }
      exerciseIds.add(exercise.id);
      
      // Check for duplicate names (warning only)
      if (exercise.name) {
        if (exerciseNames.has(exercise.name.toLowerCase())) {
          this.addIssue('warnings', 'exercises', exercise.id, `Duplicate exercise name: ${exercise.name}`);
        }
        exerciseNames.add(exercise.name.toLowerCase());
      }
      
      // Check createdBy reference if present
      if (exercise.createdBy && !this.userExists(exercise.createdBy)) {
        this.addIssue('warnings', 'exercises', exercise.id, `Referenced user not found: ${exercise.createdBy}`);
      }
    }
    
    console.log(`   Checked ${exercises.length} exercises`);
  }

  async checkPrograms() {
    console.log('📋 Checking programs collection...');
    
    const programs = this.data.programs || [];
    
    for (const program of programs) {
      // Check required fields
      if (!program.userId) {
        this.addIssue('critical', 'programs', program.id, 'Missing required field: userId');
      }
      
      if (!program.name) {
        this.addIssue('critical', 'programs', program.id, 'Missing required field: name');
      }
      
      if (!program.duration || typeof program.duration !== 'number') {
        this.addIssue('critical', 'programs', program.id, 'Missing or invalid duration');
      }
      
      if (!program.daysPerWeek || typeof program.daysPerWeek !== 'number') {
        this.addIssue('critical', 'programs', program.id, 'Missing or invalid daysPerWeek');
      }
      
      // Check user reference
      if (program.userId && !this.userExists(program.userId)) {
        this.addIssue('critical', 'programs', program.id, `Referenced user not found: ${program.userId}`);
      }
      
      // Check workouts structure
      if (program.workouts) {
        if (!Array.isArray(program.workouts)) {
          this.addIssue('warnings', 'programs', program.id, 'Workouts should be an array');
        } else {
          this.checkProgramWorkouts(program);
        }
      }
      
      // Check data ranges
      if (program.duration && (program.duration < 1 || program.duration > 52)) {
        this.addIssue('warnings', 'programs', program.id, `Unusual duration: ${program.duration} weeks`);
      }
      
      if (program.daysPerWeek && (program.daysPerWeek < 1 || program.daysPerWeek > 7)) {
        this.addIssue('warnings', 'programs', program.id, `Invalid daysPerWeek: ${program.daysPerWeek}`);
      }
    }
    
    console.log(`   Checked ${programs.length} programs`);
  }

  checkProgramWorkouts(program) {
    for (const workout of program.workouts) {
      // Check required fields
      if (typeof workout.weekNumber !== 'number') {
        this.addIssue('warnings', 'programs', program.id, `Invalid weekNumber in workout: ${workout.weekNumber}`);
      }
      
      if (typeof workout.dayNumber !== 'number') {
        this.addIssue('warnings', 'programs', program.id, `Invalid dayNumber in workout: ${workout.dayNumber}`);
      }
      
      if (!workout.name) {
        this.addIssue('warnings', 'programs', program.id, 'Workout missing name');
      }
      
      // Check exercises
      if (workout.exercises && Array.isArray(workout.exercises)) {
        for (const exercise of workout.exercises) {
          if (!exercise.exerciseId) {
            this.addIssue('warnings', 'programs', program.id, 'Program exercise missing exerciseId');
          } else if (!this.exerciseExists(exercise.exerciseId)) {
            this.addIssue('warnings', 'programs', program.id, `Referenced exercise not found: ${exercise.exerciseId}`);
          }
          
          if (!exercise.sets || typeof exercise.sets !== 'number' || exercise.sets < 1) {
            this.addIssue('warnings', 'programs', program.id, `Invalid sets value: ${exercise.sets}`);
          }
        }
      }
    }
  }

  async checkWorkoutLogs() {
    console.log('🏋️ Checking workoutLogs collection...');
    
    const workoutLogs = this.data.workoutLogs || [];
    
    for (const log of workoutLogs) {
      // Check required fields
      if (!log.userId) {
        this.addIssue('critical', 'workoutLogs', log.id, 'Missing required field: userId');
      }
      
      if (!log.date) {
        this.addIssue('critical', 'workoutLogs', log.id, 'Missing required field: date');
      }
      
      // Check user reference
      if (log.userId && !this.userExists(log.userId)) {
        this.addIssue('critical', 'workoutLogs', log.id, `Referenced user not found: ${log.userId}`);
      }
      
      // Check program reference if present
      if (log.programId && !this.programExists(log.programId)) {
        this.addIssue('warnings', 'workoutLogs', log.id, `Referenced program not found: ${log.programId}`);
      }
      
      // Check date format
      if (log.date && !this.isValidDate(log.date)) {
        this.addIssue('warnings', 'workoutLogs', log.id, `Invalid date format: ${log.date}`);
      }
      
      // Check exercises
      if (log.exercises && Array.isArray(log.exercises)) {
        for (const exercise of log.exercises) {
          if (!exercise.exerciseId) {
            this.addIssue('warnings', 'workoutLogs', log.id, 'Workout exercise missing exerciseId');
          } else if (!this.exerciseExists(exercise.exerciseId)) {
            this.addIssue('warnings', 'workoutLogs', log.id, `Referenced exercise not found: ${exercise.exerciseId}`);
          }
          
          // Check arrays consistency
          if (exercise.reps && exercise.weights && exercise.completed) {
            const repsLength = exercise.reps.length;
            const weightsLength = exercise.weights.length;
            const completedLength = exercise.completed.length;
            
            if (repsLength !== weightsLength || repsLength !== completedLength) {
              this.addIssue('warnings', 'workoutLogs', log.id, 
                `Inconsistent exercise arrays: reps(${repsLength}), weights(${weightsLength}), completed(${completedLength})`);
            }
          }
        }
      }
    }
    
    console.log(`   Checked ${workoutLogs.length} workout logs`);
  }

  async checkUserAnalytics() {
    console.log('📊 Checking userAnalytics collection...');
    
    const analytics = this.data.userAnalytics || [];
    
    for (const analytic of analytics) {
      // Check user reference
      if (analytic.userId && !this.userExists(analytic.userId)) {
        this.addIssue('critical', 'userAnalytics', analytic.id, `Referenced user not found: ${analytic.userId}`);
      }
      
      // Check exercise reference
      if (analytic.exerciseId && !this.exerciseExists(analytic.exerciseId)) {
        this.addIssue('warnings', 'userAnalytics', analytic.id, `Referenced exercise not found: ${analytic.exerciseId}`);
      }
      
      // Check numeric values
      if (analytic.totalVolume && (typeof analytic.totalVolume !== 'number' || analytic.totalVolume < 0)) {
        this.addIssue('warnings', 'userAnalytics', analytic.id, `Invalid totalVolume: ${analytic.totalVolume}`);
      }
      
      if (analytic.maxWeight && (typeof analytic.maxWeight !== 'number' || analytic.maxWeight < 0)) {
        this.addIssue('warnings', 'userAnalytics', analytic.id, `Invalid maxWeight: ${analytic.maxWeight}`);
      }
    }
    
    console.log(`   Checked ${analytics.length} analytics records`);
  }

  async checkRelationships() {
    console.log('🔗 Checking data relationships...');
    
    let relationshipsChecked = 0;
    
    // Check program-user relationships
    const programs = this.data.programs || [];
    for (const program of programs) {
      if (program.userId) {
        relationshipsChecked++;
        if (!this.userExists(program.userId)) {
          this.addIssue('critical', 'relationships', program.id, 
            `Program references non-existent user: ${program.userId}`);
        }
      }
    }
    
    // Check workout log-user relationships
    const workoutLogs = this.data.workoutLogs || [];
    for (const log of workoutLogs) {
      if (log.userId) {
        relationshipsChecked++;
        if (!this.userExists(log.userId)) {
          this.addIssue('critical', 'relationships', log.id, 
            `Workout log references non-existent user: ${log.userId}`);
        }
      }
    }
    
    // Check analytics-user relationships
    const analytics = this.data.userAnalytics || [];
    for (const analytic of analytics) {
      if (analytic.userId) {
        relationshipsChecked++;
        if (!this.userExists(analytic.userId)) {
          this.addIssue('critical', 'relationships', analytic.id, 
            `Analytics record references non-existent user: ${analytic.userId}`);
        }
      }
    }
    
    this.stats.relationshipsValidated = relationshipsChecked;
    console.log(`   Validated ${relationshipsChecked} relationships`);
  }

  async checkOrphanedRecords() {
    console.log('🔍 Checking for orphaned records...');
    
    const users = this.data.users || [];
    const userIds = new Set(users.map(u => u.id));
    
    // Find programs without users
    const programs = this.data.programs || [];
    const orphanedPrograms = programs.filter(p => p.userId && !userIds.has(p.userId));
    
    if (orphanedPrograms.length > 0) {
      this.addIssue('critical', 'orphaned', 'programs', 
        `Found ${orphanedPrograms.length} orphaned programs`);
    }
    
    // Find workout logs without users
    const workoutLogs = this.data.workoutLogs || [];
    const orphanedLogs = workoutLogs.filter(l => l.userId && !userIds.has(l.userId));
    
    if (orphanedLogs.length > 0) {
      this.addIssue('critical', 'orphaned', 'workoutLogs', 
        `Found ${orphanedLogs.length} orphaned workout logs`);
    }
    
    // Find analytics without users
    const analytics = this.data.userAnalytics || [];
    const orphanedAnalytics = analytics.filter(a => a.userId && !userIds.has(a.userId));
    
    if (orphanedAnalytics.length > 0) {
      this.addIssue('critical', 'orphaned', 'userAnalytics', 
        `Found ${orphanedAnalytics.length} orphaned analytics records`);
    }
    
    console.log(`   Checked for orphaned records`);
  }

  // Helper methods
  userExists(userId) {
    const users = this.data.users || [];
    return users.some(user => user.id === userId);
  }

  exerciseExists(exerciseId) {
    const exercises = this.data.exercises || [];
    const exercisesMetadata = this.data.exercises_metadata || [];
    
    // Check in exercises collection
    if (exercises.some(ex => ex.id === exerciseId)) {
      return true;
    }
    
    // Check in exercises_metadata
    for (const metadata of exercisesMetadata) {
      if (metadata.exercises && typeof metadata.exercises === 'object') {
        if (exerciseId in metadata.exercises) {
          return true;
        }
      }
    }
    
    return false;
  }

  programExists(programId) {
    const programs = this.data.programs || [];
    return programs.some(program => program.id === programId);
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidDate(date) {
    if (date instanceof Date) return !isNaN(date.getTime());
    if (typeof date === 'string') return !isNaN(Date.parse(date));
    return false;
  }

  addIssue(severity, collection, documentId, message) {
    const issue = {
      severity,
      collection,
      documentId,
      message,
      timestamp: new Date().toISOString()
    };
    
    this.issues[severity].push(issue);
    this.stats.issuesFound++;
  }

  generateSummary() {
    const totalIssues = this.issues.critical.length + this.issues.warnings.length + this.issues.info.length;
    
    console.log('\n📋 Data Integrity Summary:');
    console.log('='.repeat(50));
    console.log(`Total Documents Checked: ${this.stats.totalDocuments}`);
    console.log(`Collections Checked: ${this.stats.collectionsChecked}`);
    console.log(`Relationships Validated: ${this.stats.relationshipsValidated}`);
    console.log(`Total Issues Found: ${totalIssues}`);
    console.log(`  Critical Issues: ${this.issues.critical.length}`);
    console.log(`  Warnings: ${this.issues.warnings.length}`);
    console.log(`  Info: ${this.issues.info.length}`);
    
    if (this.issues.critical.length > 0) {
      console.log('\n❌ Critical Issues:');
      this.issues.critical.forEach(issue => {
        console.log(`   ${issue.collection}/${issue.documentId}: ${issue.message}`);
      });
    }
    
    if (this.issues.warnings.length > 0 && this.issues.warnings.length <= 10) {
      console.log('\n⚠️ Warnings (showing first 10):');
      this.issues.warnings.slice(0, 10).forEach(issue => {
        console.log(`   ${issue.collection}/${issue.documentId}: ${issue.message}`);
      });
    }
  }

  async saveReport(outputPath) {
    const report = {
      summary: this.stats,
      issues: this.issues,
      timestamp: new Date().toISOString(),
      dataIntegrityScore: this.calculateIntegrityScore()
    };
    
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n📄 Integrity report saved to: ${outputPath}`);
  }

  calculateIntegrityScore() {
    const totalDocuments = this.stats.totalDocuments;
    const criticalIssues = this.issues.critical.length;
    const warnings = this.issues.warnings.length;
    
    if (totalDocuments === 0) return 0;
    
    // Score based on issues per document
    const criticalPenalty = (criticalIssues / totalDocuments) * 50;
    const warningPenalty = (warnings / totalDocuments) * 20;
    
    const score = Math.max(0, 100 - criticalPenalty - warningPenalty);
    return Math.round(score * 100) / 100;
  }
}

// CLI execution
async function main() {
  const dataDir = process.argv[2] || './migration-data';
  const outputPath = process.argv[3] || path.join(dataDir, 'integrity-report.json');
  
  console.log('🔍 Data Integrity Checker');
  console.log(`Data Directory: ${dataDir}`);
  console.log(`Output Report: ${outputPath}`);
  
  try {
    const checker = new DataIntegrityChecker(dataDir);
    await checker.loadData();
    await checker.checkIntegrity();
    await checker.saveReport(outputPath);
    
    const criticalIssues = checker.issues.critical.length;
    
    if (criticalIssues > 0) {
      console.log(`\n❌ Data integrity check failed with ${criticalIssues} critical issues.`);
      process.exit(1);
    } else {
      console.log('\n✅ Data integrity check passed!');
    }
    
  } catch (error) {
    console.error('💥 Error during integrity check:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DataIntegrityChecker };