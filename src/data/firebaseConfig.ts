import type { FirebaseOptions } from 'firebase/app';

/**
 * Paste your Firebase web-app config here (Firebase console → Project settings → Your apps → SDK setup and
 * configuration → Config). While this is `null` the app runs in local mode (data stays on each device).
 *
 * These values are public identifiers, not secrets — every visitor's browser receives them. What protects the
 * data is `firestore.rules` (public read, approved scorers write).
 */
export const firebaseConfig: FirebaseOptions | null = null;
