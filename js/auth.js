import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { auth } from './firebase-init.js';

function friendlyError(err) {
  const map = {
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters long.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again in a few minutes.',
    'auth/network-request-failed': 'Network error — please check your connection and try again.',
  };
  return map[err.code] || err.message || 'Something went wrong. Please try again.';
}

export async function registerUser(email, password, displayName) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    return cred.user;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function loginUser(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function logoutUser() {
  await signOut(auth);
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

// Resolves once with the current user (or null) — handy for one-off checks
// like "am I already logged in?" on the login/register pages.
export function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// Fires immediately with the current auth state, then again on every change.
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
