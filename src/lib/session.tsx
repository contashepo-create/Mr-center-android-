// ============================================================
// مزوّد الجلسة: تهيئة الاتصال، تتبع الدخول، تحميل الملف والاشتراك
// ============================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, initSupabase, isSupabaseReady } from './supabase';
import { registerPushToken } from './push';
import type { MySubscription, Profile, Role } from './types';

interface SessionState {
  ready: boolean;               // انتهت التهيئة
   configured: boolean;         // توجد مفاتيح اتصال صالحة
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  subscription: MySubscription | null;
  refresh: () => Promise<void>;
  reinitConnection: () => Promise<'ready' | 'missing'>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<MySubscription | null>(null);

  const loadProfile = useCallback(async (sess: Session | null) => {
    if (!sess || !isSupabaseReady()) {
      setProfile(null);
      setSubscription(null);
      return;
    }
    try {
      const sb = getSupabase();
      const { data: prof, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', sess.user.id)
        .maybeSingle();
      if (error) throw error;
      setProfile((prof as Profile) ?? null);
      if (prof) {
        const { data: sub } = await sb.rpc('get_my_subscription');
        setSubscription((sub as MySubscription) ?? null);
        void registerPushToken();
      } else {
        setSubscription(null);
      }
    } catch {
      // عطل عابر (شبكة) — إعادة محاولة واحدة بعد ثانيتين قبل الاستسلام
      try {
        await new Promise((r) => setTimeout(r, 2000));
        const sb = getSupabase();
        const { data: prof } = await sb
          .from('profiles')
          .select('*')
          .eq('id', sess.user.id)
          .maybeSingle();
        setProfile((prof as Profile) ?? null);
        if (prof) {
          const { data: sub } = await sb.rpc('get_my_subscription');
          setSubscription((sub as MySubscription) ?? null);
        } else {
          setSubscription(null);
        }
        return;
      } catch {
        // تجاهل
      }
      setProfile(null);
      setSubscription(null);
    }
  }, []);

  const reinitConnection = useCallback(async (): Promise<'ready' | 'missing'> => {
    const status = await initSupabase();
    setConfigured(status === 'ready');
    return status;
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const status = await initSupabase();
      setConfigured(status === 'ready');
      if (status === 'ready') {
        const sb = getSupabase();
        const { data } = await sb.auth.getSession();
        setSession(data.session ?? null);
        await loadProfile(data.session ?? null);
        const { data: listener } = sb.auth.onAuthStateChange((_event, newSession) => {
          setSession(newSession);
          // تأخير بسيط حتى تكتمل معاملات التسجيل قبل قراءة الملف
          setTimeout(() => { void loadProfile(newSession); }, 0);
        });
        unsub = () => listener.subscription.unsubscribe();
      }
      setReady(true);
    })();
    return () => { unsub?.(); };
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    if (!isSupabaseReady()) return;
    const { data } = await getSupabase().auth.getSession();
    setSession(data.session ?? null);
    await loadProfile(data.session ?? null);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    if (isSupabaseReady()) {
      try { await getSupabase().auth.signOut(); } catch { /* تجاهل */ }
    }
    setSession(null);
    setProfile(null);
    setSubscription(null);
  }, []);

  const value = useMemo<SessionState>(() => ({
    ready,
    configured,
    session,
    profile,
    role: profile?.role ?? null,
    subscription,
    refresh,
    reinitConnection,
    signOut,
  }), [ready, configured, session, profile, subscription, refresh, reinitConnection, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession يجب أن يُستخدم داخل SessionProvider');
  return ctx;
}
