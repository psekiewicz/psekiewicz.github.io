import { getCurrentUser } from './auth.js';
import { getAccountAge, needsBirthDate } from './age-data.js';

// Sends a signed-in account that has no date of birth to the page that asks
// for one, and keeps it there until it has one.
//
// Every account made before the age rules existed is in that position, and so
// is anyone who signed up through a client that did not ask yet. The database
// already refuses their writes - this is what turns that into one question
// rather than a wall of failures with no explanation.
//
// Imported by nav.js, which every page loads, so a new page is covered without
// anybody remembering to add it.

/** Pages a signed-out or half-signed-up visitor has to be able to reach. */
const EXEMPT = new Set([
  '/age.html',
  '/login.html',
  '/register.html',
  '/404.html',
  // A parent confirming a child's account may be signed in to an account of
  // their own that has no date yet; that must not bounce them off the page.
  '/consent.html',
]);

function isExempt() {
  const path = window.location.pathname.replace(/\/index\.html$/, '/');
  if (EXEMPT.has(path)) return true;
  // The legal documents have to stay readable, since the gate asks people to
  // agree to them.
  return path.startsWith('/legal');
}

export async function enforceAgeGate() {
  if (isExempt()) return;
  try {
    const user = await getCurrentUser();
    if (!user) return;
    const age = await getAccountAge(user.id);
    if (!needsBirthDate(age)) return;
    const next = window.location.pathname + window.location.search;
    window.location.replace('/age.html?next=' + encodeURIComponent(next));
  } catch {
    // Failing open is deliberate. A network blip must not lock somebody out
    // of their own account, and the database is still what actually refuses
    // a write.
  }
}

enforceAgeGate();
