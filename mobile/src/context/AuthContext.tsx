import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { getProfile, Profile } from '../data/profiles';
import { supabase } from '../lib/supabase';

type AuthValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  // `loading` is only true until the persisted session has been read off disk.
  // Every gate in the app waits on this rather than on `user`, so a cold start
  // doesn't flash the signed-out UI at someone who is signed in.
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Supabase emits INITIAL_SESSION on subscribe, so this fires once with
    // whatever was persisted and again on every change - no separate
    // getSession() call needed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setProfile(null);
      return;
    }
    getProfile(userId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        // A profile row that hasn't been created yet (or an offline start)
        // shouldn't sign anyone out - the rest of the app handles a null
        // profile by falling back to auth metadata.
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshProfile = async () => {
    if (!userId) return;
    const p = await getProfile(userId).catch(() => null);
    if (p) setProfile(p);
  };

  const value = useMemo<AuthValue>(
    () => ({ user: session?.user ?? null, session, profile, loading, refreshProfile }),
    [session, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
