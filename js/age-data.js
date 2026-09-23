import { supabase } from './supabase-init.js';

// The account's age and what it means for what it may do. `account_ages` is
// readable only by its owner and writable by nobody from a client, so this is
// a read of your own row plus one RPC that fills it in once.
//
// The mirror of mobile/src/data/age.ts. Both talk to the same three database
// objects, so neither can quietly diverge from the rules.

/** Null when there is no row at all, which is every account made before this. */
export async function getAccountAge(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('account_ages')
    .select('birth_date, consent_state')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { birthDate: data.birth_date, consentState: data.consent_state };
}

/**
 * Whether the site should stand in front of everything and ask for a date.
 * A missing row and a row with no date on it mean the same thing: nobody has
 * said how old this person is.
 */
export function needsBirthDate(age) {
  return !age || !age.birthDate;
}

/** Whether a 13-15 year old is still waiting on a parent. */
export function awaitingParent(age) {
  return Boolean(age && age.birthDate && age.consentState === 'pending');
}

/**
 * Fills the date in. The server decides what it means and refuses a second
 * attempt, so the returned state is the server's answer rather than ours.
 */
export async function setBirthDate(birthDate) {
  const { data, error } = await supabase.rpc('set_birth_date', { p_birth: birthDate });
  if (error) throw new Error(error.message);
  return data;
}

/** Asks the Edge Function to email a parent. */
export async function requestParentalConsent(parentEmail) {
  const { data, error } = await supabase.functions.invoke('parental-consent', {
    body: { action: 'request', parentEmail },
  });
  if (error) {
    // The function answers with a readable reason; surface that rather than
    // "Edge Function returned a non-2xx status code".
    throw new Error((data && data.error) || error.message);
  }
  return true;
}

/**
 * Builds an ISO date from three fields, or throws with something a person can
 * act on. Shared by the sign-up form and the gate so they cannot disagree
 * about what counts as a date.
 */
export function isoDateFrom(day, month, year) {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y || String(year).length !== 4) {
    throw new Error('Fill in the day, month and year.');
  }
  if (d < 1 || d > 31 || m < 1 || m > 12) throw new Error('That date does not look right.');
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Round-trips through Date to catch the 31st of February and similar.
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== d || parsed.getUTCMonth() + 1 !== m) {
    throw new Error('That date does not exist.');
  }
  return iso;
}
