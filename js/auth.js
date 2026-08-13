import { supabase } from './supabase-init.js';

function friendlyError(err) {
  const message = err && err.message ? err.message : 'Something went wrong. Please try again.';
  const map = {
    'User already registered': 'An account with that email already exists.',
    'Invalid login credentials': 'Incorrect email or password.',
    'Password should be at least 6 characters.': 'Password must be at least 6 characters long.',
    'Email not confirmed': 'Please confirm your email address before logging in (check your inbox).',
  };
  return map[message] || message;
}

export async function registerUser(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw new Error(friendlyError(error));
  return data.user;
}

export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyError(error));
  return data.user;
}

export async function logoutUser() {
  await supabase.auth.signOut();
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login.html`,
  });
  if (error) throw new Error(friendlyError(error));
}

// Resolves once with the current user (or null) — handy for one-off checks
// like "am I already logged in?" on the login/register pages.
export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Fires immediately with the current auth state (Supabase emits an
// INITIAL_SESSION event on subscribe), then again on every change.
// Returns an unsubscribe function.
export function onAuthChange(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? session.user : null);
  });
  return () => subscription.unsubscribe();
}

export function displayNameOf(user) {
  return (user && user.user_metadata && user.user_metadata.display_name) || (user && user.email) || 'Unknown';
}
