import type { FirebaseOptions } from 'firebase/app';

/**
 * Paste your Firebase web-app config here (Firebase console → Project settings → Your apps → SDK setup and
 * configuration → Config). While this is `null` the app runs in local mode (data stays on each device).
 *
 * These values are public identifiers, not secrets — every visitor's browser receives them. What protects the
 * data is `firestore.rules` (public read, approved scorers write).
 */
export const firebaseConfig: FirebaseOptions | null = {
  apiKey: 'AIzaSyDxlvs1IL7ZWOJLmMCuuGE1gTWX4nHVvvQ',
  authDomain: 'ntu-cricket-scorer.firebaseapp.com',
  projectId: 'ntu-cricket-scorer',
  storageBucket: 'ntu-cricket-scorer.firebasestorage.app',
  messagingSenderId: '1049998412586',
  appId: '1:1049998412586:web:1fe334d08e13479d63ac53',
};
