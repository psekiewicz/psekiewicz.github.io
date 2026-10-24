import { supabase } from './supabase';

// The emails the app sends - "confirm your address" and "reset your
// password" - lead back into the app instead of to the website: Supabase
// checks the link and then redirects to showcase://auth, carrying the new
// session in the URL. This turns that into a signed-in session and tells the
// navigator where to go next.
//
// Supabase only redirects to addresses on the project's allow list
// (Authentication -> URL Configuration -> Redirect URLs needs showcase://auth).
// Without it a link still works - it just lands on the website's Site URL, as
// the site's own sign-ups do.

export const AUTH_REDIRECT = 'showcase://auth';

export type AuthLinkResult = { kind: 'confirmed' | 'recovery' } | { kind: 'error'; message: string };

export function isAuthLink(url: string | null | undefined): url is string {
  return Boolean(url && url.startsWith(AUTH_REDIRECT));
}

// Both halves of the URL can carry parameters: the query (what we sent, plus
// a PKCE code) and the fragment (the implicit flow's tokens, or an error).
function params(url: string) {
  const out = new URLSearchParams();
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.split('?')[1] || '';
  for (const part of [query, hash]) new URLSearchParams(part).forEach((v, k) => out.set(k, v));
  return out;
}

export async function handleAuthLink(url: string): Promise<AuthLinkResult> {
  const p = params(url);
  const error = p.get('error_description') || p.get('error');
  if (error) return { kind: 'error', message: error.replace(/\+/g, ' ') };

  const code = p.get('code');
  const accessToken = p.get('access_token');
  const refreshToken = p.get('refresh_token');
  if (code) {
    const { error: e } = await supabase.auth.exchangeCodeForSession(code);
    if (e) return { kind: 'error', message: e.message };
  } else if (accessToken && refreshToken) {
    const { error: e } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (e) return { kind: 'error', message: e.message };
  } else {
    return { kind: 'error', message: 'This link is incomplete or has already been used.' };
  }

  const recovery = p.get('type') === 'recovery' || p.has('reset');
  return { kind: recovery ? 'recovery' : 'confirmed' };
}
