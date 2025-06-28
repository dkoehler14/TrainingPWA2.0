import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
from google.cloud.firestore_v1.field_path import FieldPath
import os # To help with finding the service account key

# --- Configuration ---
# Replace 'path/to/your/serviceAccountKey.json' with the actual path
# If the JSON file is in the same directory as this script, you can just use its filename.
# Example: service_account_key_path = 'sample-firebase-ai-app-d056c-firebase-adminsdk-xxxxx-xxxxxx.json'
# For security, consider loading this path from an environment variable or secure config.
SERVICE_ACCOUNT_KEY_FILE = 'sample-firebase-ai-app-d056c-firebase-adminsdk-fbsvc-047d03194a.json' # <--- IMPORTANT: Update this filename!

# Construct the full path to the service account key
current_dir = os.path.dirname(os.path.abspath(__file__))
service_account_key_full_path = os.path.join(current_dir, SERVICE_ACCOUNT_KEY_FILE)

# --- Initialize Firebase Admin SDK ---
try:
    cred = credentials.Certificate(service_account_key_full_path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Firebase Admin SDK initialized successfully.")
except Exception as e:
    print(f"Error initializing Firebase Admin SDK: {e}")
    print("Please ensure your service account key file is correctly specified and accessible.")
    exit(1) # Exit if initialization fails

# --- Migration Logic ---
BATCH_SIZE = 400  # Keep it below Firestore's 500 limit for safety

def migrate_workout_logs():
    print("Starting migration of workoutLogs to add completedDate...")

    documents_processed = 0
    last_doc_snapshot = None
    continue_processing = True

    try:
        while continue_processing:
            query = db.collection_group('workoutLogs') \
                      .order_by(FieldPath.document_id()) \
                      .limit(BATCH_SIZE)

            if last_doc_snapshot:
                query = query.start_after(last_doc_snapshot)

            snapshot = query.stream() # Use .stream() for iterators

            docs_in_batch = []
            for doc in snapshot:
                docs_in_batch.append(doc)

            if not docs_in_batch:
                continue_processing = False
                print("No more documents found.")
                break

            batch = db.batch()
            updates_in_batch = 0

            for doc in docs_in_batch:
                doc_data = doc.to_dict()
                # Only update if 'date' exists AND 'completedDate' does NOT exist
                # This makes the script "idempotent" – running it multiple times won't cause issues
                if doc_data.get('date') and 'completedDate' not in doc_data:
                    # Assuming 'date' is a Firestore Timestamp object.
                    # If it's a string, you might need to convert it to a Firestore Timestamp or Python datetime object.
                    batch.update(doc.reference, {'completedDate': doc_data['date']})
                    updates_in_batch += 1

            if updates_in_batch > 0:
                batch.commit()
                print(f"Committed batch of {updates_in_batch} updates.")
            else:
                print("No documents needing update in this batch.")

            documents_processed += len(docs_in_batch)
            last_doc_snapshot = docs_in_batch[-1] # The last document in the current batch

            # If the number of documents retrieved is less than BATCH_SIZE,
            # it means we've processed the last page.
            if len(docs_in_batch) < BATCH_SIZE:
                continue_processing = False

        print(f"Migration complete! Processed {documents_processed} total documents.")
        return {'success': True, 'documents_processed': documents_processed, 'message': 'Migration completed successfully.'}

    except Exception as e:
        print(f"Error during workoutLogs migration: {e}")
        return {'success': False, 'message': 'Migration failed', 'error': str(e)}

# --- Run the migration ---
if __name__ == "__main__":
    result = migrate_workout_logs()
    print("\nMigration Summary:", result)
    if not result['success']:
        exit(1) # Indicate an error if migration failed
