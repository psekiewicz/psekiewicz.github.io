import { supabase } from '../lib/supabase';

function friendlyError(err: any) {
  const message = err && err.message ? err.message : 'Something went wrong. Please try again.';
  const map: Record<string, string> = {
    'User already registered': 'An account with that email already exists.',
    'Invalid login credentials': 'Incorrect email or password.',
    'Password should be at least 6 characters.': 'Password must be at least 6 characters long.',
    'Email not confirmed':
      'Please confirm your email address before logging in (check your inbox).',
  };
  return map[message] || message;
}

// Returns { user, session }. `session` is null when the project has email
// confirmation enabled (Supabase's default) — the caller must handle that by
// prompting the user to check their inbox rather than assuming they're in.
export async function registerUser(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw new Error(friendlyError(error));
  return { user: data.user, session: data.session };
}

export async function loginUser(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyError(error));
  return data.user;
}

export async function logoutUser() {
  await supabase.auth.signOut();
}

// The web build sends people back to login.html. Here the reset link opens the
// site in a browser — the app registers the `showcase://` scheme but Supabase's
// recovery flow is a web page, and pointing it at the deployed site is both
// simpler and what a user tapping a link in their mail app expects.
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://psekiewicz.github.io/login.html',
  });
  if (error) throw new Error(friendlyError(error));
}

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Keeps auth.user_metadata.display_name in sync with the profiles table, which
// is the source of truth for display name everywhere else.
export async function updateDisplayNameMetadata(displayName: string) {
  const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
  if (error) throw new Error(friendlyError(error));
}

export async function changePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(friendlyError(error));
}

// Changing a password should require proving you know the current one. There's
// no Supabase API for "verify this password", so this re-signs in with it —
// which fails loudly if it's wrong and is otherwise a no-op on the session.
export async function verifyPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Current password is incorrect.');
}

export function displayNameOf(user: any) {
  return (
    (user && user.user_metadata && user.user_metadata.display_name) ||
    (user && user.email) ||
    'Unknown'
  );
}
