import { supabase } from './supabase-init.js';

// Thin wrappers over Supabase Auth - sign up, log in, log out, password reset
// and change, the current user and auth-state changes - that turn Supabase's
// error strings into ones a person can act on. Sessions live in localStorage,
// managed by supabase-js; nothing here stores anything itself.

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

// Returns { user, session }. `session` is null when the project has email
// confirmation enabled (Supabase's default) - the caller must handle that
// case by prompting the user to check their inbox rather than assuming
// they're immediately logged in.
export async function registerUser(email, password, displayName, birthDate) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // birth_date rides along in the signup metadata because that is what
    // handle_new_user() reads. Sending it afterwards would mean an account
    // could exist with no age on it whenever that second call failed.
    options: {
      data: { display_name: displayName, birth_date: birthDate },
      // The confirmation link lands on the login page, which says the address
      // is confirmed. Must be in Supabase's Redirect URLs allowlist
      // (Authentication -> URL Configuration), or Supabase falls back to its
      // Site URL instead.
      emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
    },
  });
  if (error) throw new Error(friendlyError(error));
  return { user: data.user, session: data.session };
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
    // login.html sees ?reset=1 (and the recovery session the link carries)
    // and asks for a new password instead of moving on to the dashboard.
    redirectTo: `${window.location.origin}/login?reset=1`,
  });
  if (error) throw new Error(friendlyError(error));
}

// Resolves once with the current user (or null) - handy for one-off checks
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

// Keeps auth.user_metadata.display_name (what nav.js/bottom-nav.js show)
// in sync with the profiles table, which is the source of truth for
// display name everywhere else (profile pages, project author names).
export async function updateDisplayNameMetadata(displayName) {
  const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
  if (error) throw new Error(friendlyError(error));
}

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(friendlyError(error));
}

export function displayNameOf(user) {
  return (user && user.user_metadata && user.user_metadata.display_name) || (user && user.email) || 'Unknown';
}
