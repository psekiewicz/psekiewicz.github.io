import { supabase } from '../lib/supabase';

// The account's age and what it means for what it may do. `account_ages` is
// readable only by its owner and writable by nobody from a client, so this is
// a read of your own row and one RPC that fills it in once.

export type ConsentState = 'not_required' | 'pending' | 'granted';

export type AccountAge = {
  /** Null until the account holder has given one. */
  birthDate: string | null;
  consentState: ConsentState;
};

/** Null when there is no row at all, which is every account made before this. */
export async function getAccountAge(userId: string | null): Promise<AccountAge | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('account_ages')
    .select('birth_date, consent_state')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { birthDate: data.birth_date, consentState: data.consent_state as ConsentState };
}

/**
 * Whether the app should stand in front of everything and ask for a date.
 * Treated the same way by a missing row and a row with no date on it, because
 * they mean the same thing: nobody has said how old this person is.
 */
export function needsBirthDate(age: AccountAge | null) {
  return !age || !age.birthDate;
}

/** Whether a 13-15 year old is still waiting on a parent. */
export function awaitingParent(age: AccountAge | null) {
  return !!age && !!age.birthDate && age.consentState === 'pending';
}

/**
 * Fills the date in. The server decides what it means and refuses a second
 * attempt, so the returned state is the server's answer rather than ours.
 */
export async function setBirthDate(birthDate: string): Promise<ConsentState> {
  const { data, error } = await supabase.rpc('set_birth_date', { p_birth: birthDate });
  if (error) throw error;
  return data as ConsentState;
}

/** Asks the Edge Function to email a parent. */
export async function requestParentalConsent(parentEmail: string) {
  const { data, error } = await supabase.functions.invoke('parental-consent', {
    body: { action: 'request', parentEmail },
  });
  if (error) {
    // The function answers with a readable reason; surface that rather than
    // "Edge Function returned a non-2xx status code".
    const detail = (data as any)?.error;
    throw new Error(detail || error.message);
  }
  return true;
}
