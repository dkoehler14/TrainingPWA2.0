import os
import json
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore

# --- Configuration ---
# Place your Firebase Admin SDK service account key file in the same directory
# as this script, or provide the path to it.
SERVICE_ACCOUNT_KEY_PATH = 'sample-firebase-ai-app-d056c-firebase-adminsdk-fbsvc-047d03194a.json'

def process_workouts():
    """
    Enhanced workout processing function that mirrors the JavaScript processWorkout functionality.
    Processes completed workout logs from Firestore, aggregates user analytics with advanced features,
    and writes the results back to the userAnalytics collection.
    
    Enhanced features:
    - PR tracking for different rep ranges
    - Effective reps calculation (RPE 7+ equivalent)
    - Intensity tracking as percentage of e1RM
    - Compound lift identification and specialized tracking
    - Exercise variation tracking and staleness detection
    - Plateau detection
    - Muscle balance calculations
    - Proper handling of existing analytics data
    """
    # --- Initialize Firebase Admin SDK ---
    if not os.path.exists(SERVICE_ACCOUNT_KEY_PATH):
        print(f"Error: Service account key file not found at '{SERVICE_ACCOUNT_KEY_PATH}'")
        print("Please download it from your Firebase project settings and place it in the correct path.")
        return

    try:
        cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("Firebase Admin SDK initialized successfully.")
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")
        return

    # --- Constants for Enhanced Analytics ---
    COMPOUND_LIFTS = {
        'squat', 'bench press', 'deadlift', 'overhead press', 'military press',
        'front squat', 'incline bench press', 'sumo deadlift', 'rdl'
    }

    REP_RANGES = {
        '1RM': {'min': 1, 'max': 1},
        '3RM': {'min': 2, 'max': 3},
        '5RM': {'min': 4, 'max': 5},
        '8RM': {'min': 6, 'max': 8},
        '12RM': {'min': 9, 'max': 12},
        '15RM': {'min': 13, 'max': 20}
    }

    # RPE to percentage of 1RM mapping (approximate)
    RPE_TO_PERCENTAGE = {
        10: 1.00, 9.5: 0.98, 9: 0.96, 8.5: 0.94, 8: 0.92,
        7.5: 0.90, 7: 0.88, 6.5: 0.86, 6: 0.84, 5: 0.82
    }

    # --- In-memory data stores ---
    all_users_analytics = {}
    user_bodyweight_cache = {}
    exercise_metadata_cache = {}

    # --- Helper Functions ---
    def normalize_datetime(dt):
        """Convert datetime to timezone-naive for consistent comparison."""
        if dt is None:
            return None
        
        # If it's a Firestore timestamp, convert to datetime
        if hasattr(dt, 'timestamp'):
            dt = datetime.fromtimestamp(dt.timestamp())
        
        # Remove timezone info if present
        if hasattr(dt, 'tzinfo') and dt.tzinfo is not None:
            return dt.replace(tzinfo=None)
        
        return dt

    def get_user_bodyweight(user_id):
        """Get user's bodyweight from cache or fetch from Firestore."""
        if user_id in user_bodyweight_cache:
            return user_bodyweight_cache[user_id]
        try:
            user_doc = db.collection('users').document(user_id).get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                bodyweight = user_data.get('weightLbs', 0)
                user_bodyweight_cache[user_id] = bodyweight
                return bodyweight
            else:
                user_bodyweight_cache[user_id] = 0
                return 0
        except Exception as e:
            print(f"Error fetching user profile for {user_id}: {e}")
            user_bodyweight_cache[user_id] = 0
            return 0

    def get_exercise_metadata(exercise_id):
        """Get exercise metadata from cache or fetch from Firestore."""
        if exercise_id in exercise_metadata_cache:
            return exercise_metadata_cache[exercise_id]
        try:
            doc = db.collection('exercises').document(exercise_id).get()
            if doc.exists:
                data = doc.to_dict()
                exercise_name = data.get('name', 'Unknown')
                metadata = {
                    'name': exercise_name,
                    'muscleGroup': data.get('primaryMuscleGroup', 'Unknown'),
                    'exerciseType': data.get('exerciseType', 'Unknown'),
                    'isCompoundLift': exercise_name.lower() in COMPOUND_LIFTS,
                    'movementPattern': data.get('movementPattern', 'Unknown'),
                    'equipment': data.get('equipment', 'Unknown')
                }
                exercise_metadata_cache[exercise_id] = metadata
                return metadata
            else:
                default_metadata = {
                    'name': 'Unknown',
                    'muscleGroup': 'Unknown',
                    'exerciseType': 'Unknown',
                    'isCompoundLift': False,
                    'movementPattern': 'Unknown',
                    'equipment': 'Unknown'
                }
                exercise_metadata_cache[exercise_id] = default_metadata
                return default_metadata
        except Exception as e:
            print(f"Error fetching exercise metadata for {exercise_id}: {e}")
            default_metadata = {
                'name': 'Unknown',
                'muscleGroup': 'Unknown',
                'exerciseType': 'Unknown',
                'isCompoundLift': False,
                'movementPattern': 'Unknown',
                'equipment': 'Unknown'
            }
            exercise_metadata_cache[exercise_id] = default_metadata
            return default_metadata

    def calculate_effective_rpe(weight, reps, e1rm):
        """Calculate effective RPE based on percentage of e1RM and rep count."""
        if e1rm == 0:
            return 5  # Default low RPE if no e1RM available
        
        percentage = weight / e1rm
        
        # Adjust for rep count - higher reps at same percentage = higher RPE
        rep_adjustment = max(0, (reps - 5) * 0.02)
        adjusted_percentage = percentage + rep_adjustment
        
        # Find closest RPE
        closest_rpe = 5
        min_diff = float('inf')
        
        for rpe, pct in RPE_TO_PERCENTAGE.items():
            diff = abs(adjusted_percentage - pct)
            if diff < min_diff:
                min_diff = diff
                closest_rpe = float(rpe)
        
        return closest_rpe

    def calculate_effective_reps(sets, e1rm):
        """Calculate effective reps (reps performed at RPE 7+ equivalent)."""
        effective_reps = 0
        
        # Ensure sets is iterable
        if not isinstance(sets, (list, tuple)):
            print(f"Warning: sets parameter is not iterable: {type(sets)}")
            return 0
        
        for set_data in sets:
            if not isinstance(set_data, dict):
                print(f"Warning: set_data is not a dictionary: {type(set_data)}")
                continue
                
            weight = set_data.get('weight', 0)
            reps = set_data.get('reps', 0)
            
            if reps > 0 and weight > 0:
                rpe = calculate_effective_rpe(weight, reps, e1rm)
                if rpe >= 7:
                    # Scale reps based on how much above RPE 7 they are
                    rpe_multiplier = min(2.0, (rpe - 6) / 4)  # Max 2x multiplier at RPE 10
                    effective_reps += reps * rpe_multiplier
        
        return round(effective_reps)

    def get_rep_range_category(reps):
        """Determine rep range category for PR tracking."""
        for category, range_data in REP_RANGES.items():
            if reps >= range_data['min'] and reps <= range_data['max']:
                return category
        return '15RM'  # Default for high rep work

    def calculate_staleness_score(exercise_id, user_id, current_date, recent_workouts):
        """Calculate exercise staleness score (days since last variation)."""
        try:
            days_since_variation = 0
            found_variation = False
            
            for doc in recent_workouts:
                workout_data = doc.to_dict()
                workout_date = workout_data.get('completedDate') or workout_data.get('date')
                
                if workout_date:
                    # Normalize both dates for comparison
                    current_date_normalized = normalize_datetime(current_date)
                    workout_date_normalized = normalize_datetime(workout_date)
                    
                    if current_date_normalized and workout_date_normalized:
                        days_diff = (current_date_normalized - workout_date_normalized).days
                    
                    # Check if this workout contains the same exercise
                    exercises = workout_data.get('exercises', [])
                    has_exercise = any(ex.get('exerciseId') == exercise_id for ex in exercises)
                    
                    if has_exercise:
                        days_since_variation = days_diff
                    else:
                        # Check for similar exercises (same movement pattern)
                        metadata = get_exercise_metadata(exercise_id)
                        has_similar_exercise = any(
                            get_exercise_metadata(ex.get('exerciseId'))['movementPattern'] == metadata['movementPattern']
                            for ex in exercises
                        )
                        
                        if has_similar_exercise:
                            found_variation = True
                            break
            
            # Return staleness score (0-100, higher = more stale)
            if found_variation:
                return min(100, days_since_variation * 2)  # 2 points per day
            else:
                return min(100, days_since_variation * 3)  # 3 points per day if no variation
                
        except Exception as e:
            print(f"Error calculating staleness for exercise {exercise_id}: {e}")
            return 0

    def detect_plateau(exercise_id, user_id, recent_workouts):
        """Detect plateau in exercise progress."""
        try:
            e1rm_history = []
            
            for doc in recent_workouts:
                workout_data = doc.to_dict()
                exercises = workout_data.get('exercises', [])
                exercise = next((ex for ex in exercises if ex.get('exerciseId') == exercise_id), None)
                
                if exercise:
                    max_e1rm = 0
                    metadata = get_exercise_metadata(exercise_id)
                    
                    # Handle both data structures
                    if 'sets' in exercise and isinstance(exercise['sets'], list):
                        # Current data structure
                        for set_data in exercise['sets']:
                            weight = set_data.get('weight', 0)
                            reps = set_data.get('reps', 0)
                            if reps > 0:
                                # Handle bodyweight exercises
                                effective_weight = weight
                                if metadata['exerciseType'] == 'Bodyweight':
                                    effective_weight = get_user_bodyweight(user_id)
                                elif metadata['exerciseType'] == 'Bodyweight Loadable':
                                    effective_weight = get_user_bodyweight(user_id) + weight
                                
                                set_e1rm = effective_weight * (1 + (reps / 30))
                                max_e1rm = max(max_e1rm, set_e1rm)
                    else:
                        # Historical data structure
                        reps_list = exercise.get('reps', [])
                        weight_list = exercise.get('weights', [])
                        completed_list = exercise.get('completed', [])
                        num_sets = min(len(reps_list), len(weight_list), len(completed_list))
                        
                        for i in range(num_sets):
                            if completed_list[i]:
                                reps = int(reps_list[i]) if reps_list[i] else 0
                                weight = int(weight_list[i]) if weight_list[i] else 0
                                if reps > 0:
                                    effective_weight = weight
                                    if metadata['exerciseType'] == 'Bodyweight':
                                        effective_weight = get_user_bodyweight(user_id)
                                    elif metadata['exerciseType'] == 'Bodyweight Loadable':
                                        effective_weight = get_user_bodyweight(user_id) + weight
                                    
                                    set_e1rm = effective_weight * (1 + (reps / 30))
                                    max_e1rm = max(max_e1rm, set_e1rm)
                    
                    if max_e1rm > 0:
                        workout_date = workout_data.get('completedDate') or workout_data.get('date')
                        e1rm_history.append({
                            'date': workout_date,
                            'e1RM': max_e1rm
                        })
            
            if len(e1rm_history) < 4:
                return {'isPlateaued': False, 'plateauDays': 0, 'trend': 'insufficient_data'}
            
            # Sort by date (oldest first)
            e1rm_history.sort(key=lambda x: x['date'])
            
            # Check for plateau (no improvement in last 4 workouts)
            recent_4 = e1rm_history[-4:]
            max_recent = max(h['e1RM'] for h in recent_4)
            is_plateaued = all(h['e1RM'] <= max_recent * 1.02 for h in recent_4)  # Allow 2% variance
            
            # Calculate trend
            first_2_avg = (recent_4[0]['e1RM'] + recent_4[1]['e1RM']) / 2
            last_2_avg = (recent_4[2]['e1RM'] + recent_4[3]['e1RM']) / 2
            trend_percent = ((last_2_avg - first_2_avg) / first_2_avg) * 100
            
            trend = 'stable'
            if trend_percent > 2:
                trend = 'improving'
            elif trend_percent < -2:
                trend = 'declining'
            
            plateau_days = 0
            if is_plateaued:
                # Normalize dates for comparison
                start_date_normalized = normalize_datetime(recent_4[0]['date'])
                end_date_normalized = normalize_datetime(recent_4[3]['date'])
                
                if start_date_normalized and end_date_normalized:
                    plateau_days = (end_date_normalized - start_date_normalized).days
            
            return {
                'isPlateaued': is_plateaued,
                'plateauDays': plateau_days,
                'trend': trend,
                'trendPercent': trend_percent
            }
            
        except Exception as e:
            print(f"Error detecting plateau for exercise {exercise_id}: {e}")
            return {'isPlateaued': False, 'plateauDays': 0, 'trend': 'error'}

    def calculate_muscle_balance(user_id):
        """Calculate muscle balance ratios."""
        try:
            # Get existing exercise analytics for this user
            exercise_analytics = db.collection('userAnalytics').document(user_id).collection('exerciseAnalytics').stream()
            
            muscle_group_strength = {}
            
            for doc in exercise_analytics:
                data = doc.to_dict()
                muscle_group = data.get('muscleGroup')
                e1rm = data.get('e1RM', 0)
                
                if muscle_group and e1rm > 0:
                    if muscle_group not in muscle_group_strength:
                        muscle_group_strength[muscle_group] = []
                    muscle_group_strength[muscle_group].append(e1rm)
            
            # Calculate average strength per muscle group
            avg_strength = {}
            for muscle, strengths in muscle_group_strength.items():
                if strengths:
                    avg_strength[muscle] = sum(strengths) / len(strengths)
            
            # Calculate key ratios
            ratios = {}
            
            # Push/Pull ratio
            push_muscles = ['Chest', 'Shoulders', 'Triceps']
            pull_muscles = ['Back', 'Biceps']
            
            push_strength = sum(avg_strength.get(muscle, 0) for muscle in push_muscles)
            pull_strength = sum(avg_strength.get(muscle, 0) for muscle in pull_muscles)
            
            if pull_strength > 0:
                ratios['pushPullRatio'] = push_strength / pull_strength
            
            # Quad/Hamstring ratio
            if 'Quadriceps' in avg_strength and 'Hamstrings' in avg_strength:
                ratios['quadHamstringRatio'] = avg_strength['Quadriceps'] / avg_strength['Hamstrings']
            
            return {'muscleGroupStrength': avg_strength, 'ratios': ratios}
            
        except Exception as e:
            print(f"Error calculating muscle balance for user {user_id}: {e}")
            return {'muscleGroupStrength': {}, 'ratios': {}}

    # --- 1. Fetch all completed workout logs ---
    try:
        print("Fetching completed workout logs from 'workoutLogs' collection group...")
        logs_ref = db.collection_group('workoutLogs').where('isWorkoutFinished', '==', True)
        all_logs = logs_ref.stream()
        
        # First pass: organize workouts by user
        user_workouts = {}
        for log in all_logs:
            log_data = log.to_dict()
            user_id = log_data.get('userId')
            if user_id:
                if user_id not in user_workouts:
                    user_workouts[user_id] = []
                user_workouts[user_id].append(log)  # Store the Firestore document object
        
        # Sort each user's workouts by date (newest first)
        for user_id in user_workouts:
            user_workouts[user_id].sort(
                key=lambda log: log.to_dict().get('completedDate') or log.to_dict().get('date'),
                reverse=True
            )
        
        log_count = 0
        # Second pass: process each workout
        for user_id, user_logs in user_workouts.items():
            for log in user_logs:
                log_count += 1
                log_data = log.to_dict()
                
                user_id = log_data.get('userId')
                exercises = log_data.get('exercises', [])
                
                # The date of the workout is needed for monthly analytics
                workout_date = log_data.get('completedDate')
                if not workout_date:
                    # Fallback to the 'date' field if 'completedDate' is missing
                    workout_date = log_data.get('date')

                print(f"\nProcessing log {log.id} (User: {user_id}) with {len(exercises)} exercises. Date: {workout_date}")

                if not user_id or not exercises or not workout_date:
                    print(f"Skipping log {log.id} due to missing 'userId', 'exercises', or date.")
                    continue

                # Ensure user exists in our analytics dictionary
                if user_id not in all_users_analytics:
                    all_users_analytics[user_id] = {
                        "exercise_analytics": {},
                        "monthly_analytics": {}
                    }

                # --- 2. Process each exercise in the log with enhanced analytics ---
                total_workout_volume = 0
                total_effective_reps = 0
                muscle_group_volume = {}
                compound_lift_volume = {}
                
                for exercise in exercises:
                    try:
                        exercise_id = exercise.get('exerciseId')
                        if not exercise_id:
                            print(f"    Skipping exercise due to missing 'exerciseId'.")
                            continue

                        # Get exercise metadata
                        metadata = get_exercise_metadata(exercise_id)
                        print(f"  Exercise: {exercise.get('exerciseName', exercise_id)} (Type: {metadata['exerciseType']}, Compound: {metadata['isCompoundLift']})")
                        
                        # Debug: Print exercise structure
                        print(f"    Exercise structure: {list(exercise.keys())}")
                        if 'sets' in exercise:
                            print(f"    Sets type: {type(exercise['sets'])}, Sets value: {exercise['sets']}")

                        # Initialize exercise analytics variables
                        workout_e1rm = 0
                        workout_volume = 0
                        workout_total_reps = 0
                        workout_total_sets = 0
                        workout_effective_reps = 0
                        intensity_distribution = {}
                        prs_by_rep_range = {}
                        average_intensity_percent = 0
                        total_intensity_sum = 0
                        valid_sets_for_intensity = 0

                        # Get current e1RM for intensity calculations (from existing analytics)
                        current_e1rm = 0
                        if exercise_id in all_users_analytics[user_id]["exercise_analytics"]:
                            current_e1rm = all_users_analytics[user_id]["exercise_analytics"][exercise_id].get("e1RM", 0)

                        # --- Handle both historical and current data structures ---
                        if 'sets' in exercise and isinstance(exercise['sets'], list):
                            # Current data structure with sets array
                            workout_total_sets = len(exercise['sets'])
                            
                            for set_data in exercise['sets']:
                                weight = set_data.get('weight', 0)
                                reps = set_data.get('reps', 0)
                                
                                if reps > 0:
                                    # Handle bodyweight exercises
                                    effective_weight = weight
                                    if metadata['exerciseType'] == 'Bodyweight':
                                        effective_weight = get_user_bodyweight(user_id)
                                    elif metadata['exerciseType'] == 'Bodyweight Loadable':
                                        effective_weight = get_user_bodyweight(user_id) + weight

                                    set_e1rm = effective_weight * (1 + (reps / 30))
                                    if set_e1rm > workout_e1rm:
                                        workout_e1rm = set_e1rm
                                    
                                    workout_volume += effective_weight * reps
                                    workout_total_reps += reps

                                    # --- Enhanced Analytics Calculations ---
                                    
                                    # Calculate intensity percentage
                                    if current_e1rm > 0:
                                        intensity_percent = round((effective_weight / current_e1rm) * 100)
                                        total_intensity_sum += intensity_percent
                                        valid_sets_for_intensity += 1
                                        
                                        # Track intensity distribution
                                        intensity_bucket = (intensity_percent // 10) * 10  # Round to nearest 10%
                                        intensity_distribution[str(intensity_bucket)] = intensity_distribution.get(str(intensity_bucket), 0) + 1

                                    # Track PRs by rep range
                                    rep_range = get_rep_range_category(reps)
                                    if rep_range not in prs_by_rep_range or set_e1rm > prs_by_rep_range[rep_range]['e1RM']:
                                        prs_by_rep_range[rep_range] = {
                                            'e1RM': round(set_e1rm),
                                            'weight': effective_weight,
                                            'reps': reps,
                                            'date': workout_date
                                        }

                            # Calculate effective reps for this exercise
                            if 'sets' in exercise and isinstance(exercise['sets'], list):
                                sets_for_effective_reps = [{'weight': s.get('weight', 0), 'reps': s.get('reps', 0)} for s in exercise['sets']]
                                workout_effective_reps = calculate_effective_reps(sets_for_effective_reps, current_e1rm)
                            else:
                                # Fallback for cases where sets is not a list
                                workout_effective_reps = 0
                            
                        else:
                            # Historical data structure with separate arrays
                            reps_list = exercise.get('reps', [])
                            weight_list = exercise.get('weights', [])
                            completed_list = exercise.get('completed', [])
                            num_sets = min(len(reps_list), len(weight_list), len(completed_list))

                            if num_sets == 0:
                                print(f"    [!] Warning: Skipping exercise '{exercise.get('exerciseName', exercise_id)}' in log {log.id} due to empty set data.")
                                continue

                            completed_sets = []
                            for i in range(num_sets):
                                # Only process completed sets
                                if completed_list[i]:
                                    reps = int(reps_list[i]) if reps_list[i] else 0
                                    weight = int(weight_list[i]) if weight_list[i] else 0
                                    
                                    if reps > 0:
                                        # Handle bodyweight exercises
                                        effective_weight = weight
                                        if metadata['exerciseType'] == 'Bodyweight':
                                            effective_weight = get_user_bodyweight(user_id)
                                        elif metadata['exerciseType'] == 'Bodyweight Loadable':
                                            effective_weight = get_user_bodyweight(user_id) + weight

                                        set_e1rm = effective_weight * (1 + (reps / 30))
                                        if set_e1rm > workout_e1rm:
                                            workout_e1rm = set_e1rm
                                        
                                        workout_volume += effective_weight * reps
                                        workout_total_reps += reps
                                        workout_total_sets += 1  # Only count completed sets

                                        # --- Enhanced Analytics Calculations ---
                                        
                                        # Calculate intensity percentage
                                        if current_e1rm > 0:
                                            intensity_percent = round((effective_weight / current_e1rm) * 100)
                                            total_intensity_sum += intensity_percent
                                            valid_sets_for_intensity += 1
                                            
                                            # Track intensity distribution
                                            intensity_bucket = (intensity_percent // 10) * 10  # Round to nearest 10%
                                            intensity_distribution[str(intensity_bucket)] = intensity_distribution.get(str(intensity_bucket), 0) + 1

                                        # Track PRs by rep range
                                        rep_range = get_rep_range_category(reps)
                                        if rep_range not in prs_by_rep_range or set_e1rm > prs_by_rep_range[rep_range]['e1RM']:
                                            prs_by_rep_range[rep_range] = {
                                                'e1RM': round(set_e1rm),
                                                'weight': effective_weight,
                                                'reps': reps,
                                                'date': workout_date
                                            }

                                        # Store for effective reps calculation
                                        completed_sets.append({'weight': effective_weight, 'reps': reps})

                            # Calculate effective reps for this exercise
                            workout_effective_reps = calculate_effective_reps(completed_sets, current_e1rm)

                        # Calculate average intensity percentage
                        if valid_sets_for_intensity > 0:
                            average_intensity_percent = round(total_intensity_sum / valid_sets_for_intensity)

                        # Get recent workouts for staleness and plateau calculations
                        recent_workouts = user_workouts[user_id][:20]  # Get first 20 (already sorted)

                        # Calculate staleness score
                        staleness_score = calculate_staleness_score(exercise_id, user_id, workout_date, recent_workouts)

                        # Detect plateau for this exercise
                        plateau_data = detect_plateau(exercise_id, user_id, recent_workouts)

                        # --- 3. Aggregate exercise analytics in memory with enhanced data ---
                        exercise_analytics = all_users_analytics[user_id]["exercise_analytics"]
                        if exercise_id not in exercise_analytics:
                            exercise_analytics[exercise_id] = {
                                "exerciseName": metadata['name'],
                                "muscleGroup": metadata['muscleGroup'],
                                "exerciseType": metadata['exerciseType'],
                                "isCompoundLift": metadata['isCompoundLift'],
                                "movementPattern": metadata['movementPattern'],
                                "equipment": metadata['equipment'],
                                "e1RM": workout_e1rm,
                                "totalVolume": workout_volume,
                                "totalSets": workout_total_sets,
                                "totalReps": workout_total_reps,
                                "totalEffectiveReps": workout_effective_reps,
                                "averageIntensity": workout_volume / workout_total_reps if workout_total_reps > 0 else 0,
                                "averageIntensityPercent": average_intensity_percent,
                                "intensityDistribution": intensity_distribution,
                                "stalenessScore": staleness_score,
                                "plateauData": plateau_data,
                                "prsByRepRange": prs_by_rep_range,
                            }
                        else:
                            # Aggregate by adding totals and finding the max E1RM
                            ea = exercise_analytics[exercise_id]
                            # Always refresh metadata from master collection
                            ea["exerciseName"] = metadata['name']
                            ea["muscleGroup"] = metadata['muscleGroup']
                            ea["exerciseType"] = metadata['exerciseType']
                            ea["isCompoundLift"] = metadata['isCompoundLift']
                            ea["movementPattern"] = metadata['movementPattern']
                            ea["equipment"] = metadata['equipment']
                            
                            if workout_e1rm > ea.get("e1RM", 0):
                                ea["e1RM"] = workout_e1rm
                            
                            ea["totalVolume"] = ea.get("totalVolume", 0) + workout_volume
                            ea["totalSets"] = ea.get("totalSets", 0) + workout_total_sets
                            ea["totalReps"] = ea.get("totalReps", 0) + workout_total_reps
                            ea["totalEffectiveReps"] = ea.get("totalEffectiveReps", 0) + workout_effective_reps
                            ea["averageIntensity"] = ea["totalVolume"] / ea["totalReps"] if ea["totalReps"] > 0 else 0
                            ea["averageIntensityPercent"] = average_intensity_percent
                            ea["stalenessScore"] = staleness_score
                            ea["plateauData"] = plateau_data
                            
                            # Merge intensity distributions
                            for bucket, count in intensity_distribution.items():
                                ea["intensityDistribution"][bucket] = ea["intensityDistribution"].get(bucket, 0) + count
                            
                            # Merge PRs by rep range
                            for rep_range, pr_data in prs_by_rep_range.items():
                                if rep_range not in ea["prsByRepRange"] or pr_data['e1RM'] > ea["prsByRepRange"][rep_range]['e1RM']:
                                    ea["prsByRepRange"][rep_range] = pr_data

                        total_workout_volume += workout_volume
                        total_effective_reps += workout_effective_reps
                        
                        # Track muscle group volume
                        muscle_group = metadata['muscleGroup']
                        muscle_group_volume[muscle_group] = muscle_group_volume.get(muscle_group, 0) + workout_volume
                        
                        # Track compound lift volume
                        if metadata['isCompoundLift']:
                            compound_lift_volume[metadata['name']] = compound_lift_volume.get(metadata['name'], 0) + workout_volume
                            
                    except Exception as e:
                        print(f"    Error processing exercise {exercise_id}: {e}")
                        continue

                # --- 4. Aggregate monthly analytics in memory with enhanced data ---
                month_str = workout_date.strftime('%Y-%m')
                monthly_analytics = all_users_analytics[user_id]["monthly_analytics"]
                
                # Calculate muscle balance ratios
                muscle_balance = calculate_muscle_balance(user_id)
                
                if month_str not in monthly_analytics:
                    monthly_analytics[month_str] = {
                        "totalVolume": total_workout_volume,
                        "totalWorkouts": 1,
                        "totalEffectiveReps": total_effective_reps,
                        "muscleGroupVolume": muscle_group_volume,
                        "compoundLiftVolume": compound_lift_volume,
                        "muscleBalance": muscle_balance,
                    }
                else:
                    monthly_analytics[month_str]["totalVolume"] += total_workout_volume
                    monthly_analytics[month_str]["totalWorkouts"] += 1
                    monthly_analytics[month_str]["totalEffectiveReps"] += total_effective_reps
                    
                    # Merge muscle group volumes
                    for muscle, volume in muscle_group_volume.items():
                        monthly_analytics[month_str]["muscleGroupVolume"][muscle] = monthly_analytics[month_str]["muscleGroupVolume"].get(muscle, 0) + volume
                    
                    # Merge compound lift volumes
                    for lift, volume in compound_lift_volume.items():
                        monthly_analytics[month_str]["compoundLiftVolume"][lift] = monthly_analytics[month_str]["compoundLiftVolume"].get(lift, 0) + volume
                    
                    # Update muscle balance with latest calculation
                    monthly_analytics[month_str]["muscleBalance"] = muscle_balance

        print(f"Processed {log_count} logs in memory for {len(all_users_analytics)} users.")

    except Exception as e:
        print(f"An error occurred while fetching or processing logs: {e}")
        return

    # --- 5. Write aggregated data to Firestore in batches with enhanced structure ---
    print("\nStarting to write enhanced aggregated analytics to Firestore...")
    server_timestamp = firestore.SERVER_TIMESTAMP

    for user_id, user_data in all_users_analytics.items():
        print(f"Writing enhanced data for user: {user_id}")
        batch = db.batch()

        # Set exercise analytics with enhanced structure
        for exercise_id, exercise_data in user_data["exercise_analytics"].items():
            # Calculate final average intensity
            if exercise_data["totalReps"] > 0:
                exercise_data["averageIntensity"] = exercise_data["totalVolume"] / exercise_data["totalReps"]
            else:
                exercise_data["averageIntensity"] = 0
            
            exercise_data["lastUpdated"] = server_timestamp
            
            doc_ref = db.collection('userAnalytics').document(user_id).collection('exerciseAnalytics').document(exercise_id)
            batch.set(doc_ref, exercise_data)

            # Store PR History in subcollection
            for rep_range, pr_data in exercise_data.get("prsByRepRange", {}).items():
                pr_history_ref = doc_ref.collection('prHistory').document(rep_range)
                batch.set(pr_history_ref, {
                    'repRange': rep_range,
                    'e1RM': pr_data['e1RM'],
                    'weight': pr_data['weight'],
                    'reps': pr_data['reps'],
                    'achievedDate': pr_data['date'],
                    'exerciseName': exercise_data['exerciseName'],
                    'lastUpdated': server_timestamp,
                })

        # Set monthly analytics with enhanced structure
        for month_str, monthly_data in user_data["monthly_analytics"].items():
            monthly_data["lastUpdated"] = server_timestamp
            doc_ref = db.collection('userAnalytics').document(user_id).collection('monthlyAnalytics').document(month_str)
            batch.set(doc_ref, monthly_data)
            
        try:
            batch.commit()
            print(f"Successfully committed enhanced analytics for user: {user_id}")
        except Exception as e:
            print(f"Error committing batch for user {user_id}: {e}")

    print("\nEnhanced analytics migration script finished.")

if __name__ == '__main__':
    process_workouts() 