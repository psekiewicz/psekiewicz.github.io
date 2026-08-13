// ⚠️ REPLACE these placeholder values with your own Firebase project's config.
//
// Where to get them:
//   1. https://console.firebase.google.com → create a project (free tier is enough)
//   2. Build → Authentication → Get started → enable the "Email/Password" sign-in provider
//   3. Build → Firestore Database → Create database → start in production mode
//      (then paste firestore.rules from this repo into the Rules tab and Publish)
//   4. Project settings (gear icon) → General → "Your apps" → Add app → Web (</>)
//      → copy the firebaseConfig object it gives you and paste the values below.
//
// These values are safe to expose in client-side code — they identify your
// Firebase project, they are not secret keys. Real access control is enforced
// by the Firestore security rules (firestore.rules), not by hiding this file.
export const firebaseConfig = {
  apiKey: 'REPLACE_WITH_YOUR_API_KEY',
  authDomain: 'REPLACE_WITH_YOUR_PROJECT.firebaseapp.com',
  projectId: 'REPLACE_WITH_YOUR_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_YOUR_PROJECT.appspot.com',
  messagingSenderId: 'REPLACE_WITH_YOUR_SENDER_ID',
  appId: 'REPLACE_WITH_YOUR_APP_ID',
};
