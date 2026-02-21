// hooks/useAuth-with-edge-function.js

import { useState, useEffect, useRef } from 'react';
import { getSupabaseBrowser, resetSupabaseClient } from '../lib/supabase';
import { AuthLog, ProfileLog, ErrorLog, PerfLog } from '../lib/log';

/**
 * Hook useAuth avec Edge Function Supabase
 * 
 * Utilise create-user-profile Edge Function au lieu de /api/auth/link-profile
 * Polling agressif comme fallback
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const initAttempted = useRef(false);
  const loadProfileAttempted = useRef(new Set());

  // ========================================
  // FONCTION : Charger le profil CAFCOOP
  // ========================================
  // Remplace toute la fonction loadProfile dans hooks/useAuth-with-edge-function.js
const loadProfile = async (authUserId, retryCount = 0) => {
  const maxRetries = 2;
  const cacheKey = `${authUserId}-${retryCount}`;
  
  if (loadProfileAttempted.current.has(cacheKey)) return null;
  loadProfileAttempted.current.add(cacheKey);

  const perfMeasure = PerfLog.measureStart('loadProfile-via-Edge');

  try {
    const supabase = getSupabaseBrowser();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    
    // URL de ton Edge Function
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-user-profile`;

    // APPEL EXCLUSIF À L'EDGE FUNCTION (Elle gère le SELECT ou l'INSERT)
    const edgePromise = fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        id_auth: authUserId,
        email: authUser?.email || '',
        nom: '', 
        prenom: '',
        role: 'agriculteur',
      }),
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Edge Function timeout')), 12000)
    );

    const response = await Promise.race([edgePromise, timeoutPromise]);
    const json = await response.json();

    if (!response.ok || !json.ok) {
      throw new Error(json.error || 'Erreur Edge Function');
    }

    // Ton Edge Function renvoie le profil dans json.profile
    ProfileLog.loadSuccess(authUserId, json.profile.id_utilisateur, json.profile.role);
    perfMeasure.end();
    return json.profile;

  } catch (err) {
    if (retryCount < maxRetries) {
      await new Promise(res => setTimeout(res, 1500));
      return await loadProfile(authUserId, retryCount + 1);
    }
    ErrorLog.handled(err, { context: 'loadProfile-Edge-Fatal', authUserId });
    throw err;
  } finally {
    setTimeout(() => loadProfileAttempted.current.delete(cacheKey), 5000);
  }
};


  // ========================================
  // FONCTION : Rafraîchir le profil
  // ========================================
  const refreshProfile = async () => {
    if (!user?.id) {
      ProfileLog.loadFailure(null, new Error('No user to refresh'));
      return;
    }

    ProfileLog.loadAttempt(user.id);

    try {
      setLoading(true);
      const freshProfile = await loadProfile(user.id);
      setProfile(freshProfile);
      setError(null);
    } catch (err) {
      ProfileLog.loadFailure(user.id, err);
      ErrorLog.handled(err, { context: 'refreshProfile', userId: user.id });
      setError(err.message || 'Erreur rafraîchissement profil');
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // EFFECT : Initialisation + Listener auth
  // ========================================
  useEffect(() => {
    if (initAttempted.current) {
      console.log('⚠️ useAuth déjà initialisé, skip');
      return;
    }
    initAttempted.current = true;

    let supabase;
    let subscription;
    let isMounted = true;
    let initTimeout;
    let pollInterval;

    const initAuth = async () => {
      const perfMeasure = PerfLog.measureStart('initAuth');
      AuthLog.authStateChange('INIT', null);

      try {
        supabase = getSupabaseBrowser();

        initTimeout = setTimeout(() => {
          if (isMounted && loading) {
            console.error('⏱️ Init auth timeout après 15s');
            setError('Timeout initialisation auth');
            setLoading(false);
          }
        }, 15000);

        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('getSession timeout')), 5000)
        );

        let currentSession = null;
        let sessionError = null;

        try {
          const result = await Promise.race([
            sessionPromise,
            timeoutPromise,
          ]);
          currentSession = result.data?.session || null;
          sessionError = result.error || null;
        } catch (raceError) {
          sessionError = raceError;
        }

        if (sessionError) {
          if (sessionError.message?.includes('aborted')) {
            console.warn('⚠️ Session aborted, reset client et retry...');
            resetSupabaseClient();
            
            try {
              const retryResult = await supabase.auth.getSession();
              currentSession = retryResult.data?.session || null;
              sessionError = retryResult.error || null;
              
              if (sessionError) {
                AuthLog.loginFailure('session-check', sessionError);
                throw sessionError;
              }
            } catch (retryError) {
              AuthLog.loginFailure('session-retry', retryError);
              throw retryError;
            }
          } else {
            AuthLog.loginFailure('session-check', sessionError);
            ErrorLog.handled(sessionError, { context: 'getSession' });
            throw sessionError;
          }
        }

        if (!isMounted) return;

        if (!currentSession) {
          AuthLog.authStateChange('NO_SESSION', null);
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          perfMeasure.end();
          return;
        }

        AuthLog.sessionStart(currentSession.user.id, currentSession.user.email);
        setSession(currentSession);
        setUser(currentSession.user);

        try {
          const userProfile = await loadProfile(currentSession.user.id);
          if (isMounted) {
            setProfile(userProfile);
          }
        } catch (profileErr) {
          if (isMounted) {
            setError(profileErr.message || 'Erreur chargement profil');
          }
        }

      } catch (err) {
        ErrorLog.handled(err, { context: 'initAuth' });
        if (isMounted) {
          setError(err.message || 'Erreur initialisation');
        }
      } finally {
        if (initTimeout) clearTimeout(initTimeout);
        if (isMounted) {
          setLoading(false);
        }
        perfMeasure.end();
      }
    };

    initAuth();

    // ========================================
    // POLLING AGRESSIF (fallback si profil pas chargé)
    // ========================================
    let pollCount = 0;
    const maxPolls = 10;

    pollInterval = setInterval(async () => {
      if (!isMounted) return;
      
      pollCount++;
      
      if (pollCount > maxPolls) {
        clearInterval(pollInterval);
        if (session && !profile && loading) {
          console.error('⏱️ Profil toujours pas chargé après 20s');
          setLoading(false);
          setError('Impossible de charger le profil. Réessayez.');
        }
        return;
      }
      
      if (session && !profile && loading) {
        console.log(`🔄 Poll ${pollCount}/${maxPolls}: Retry loadProfile...`);
        
        try {
          const prof = await loadProfile(session.user.id);
          if (isMounted && prof) {
            setProfile(prof);
            setError(null);
            setLoading(false);
            clearInterval(pollInterval);
          }
        } catch (err) {
          console.warn(`⚠️ Poll ${pollCount} failed:`, err.message);
        }
      }
    }, 2000);

    // Listener auth
    try {
      const { data: authListener } = getSupabaseBrowser().auth.onAuthStateChange(
        async (event, newSession) => {
          AuthLog.authStateChange(event, newSession?.user?.id || null);

          if (!isMounted) return;

          if (event === 'SIGNED_IN' && newSession) {
            AuthLog.loginSuccess(newSession.user.id, newSession.user.email, 'password_or_magic');
            setSession(newSession);
            setUser(newSession.user);
            setLoading(true);

            try {
              const userProfile = await loadProfile(newSession.user.id);
              if (isMounted) {
                setProfile(userProfile);
                setError(null);
              }
            } catch (err) {
              ErrorLog.handled(err, { context: 'onAuthStateChange-SIGNED_IN', userId: newSession.user.id });
              if (isMounted) {
                setError(err.message);
              }
            } finally {
              if (isMounted) {
                setLoading(false);
              }
            }
          } else if (event === 'SIGNED_OUT') {
            AuthLog.logout(user?.id || 'unknown');
            setSession(null);
            setUser(null);
            setProfile(null);
            setError(null);
          }
        }
      );
      subscription = authListener.subscription;
    } catch (err) {
      console.error('❌ Erreur onAuthStateChange:', err);
    }

    return () => {
      isMounted = false;
      if (initTimeout) clearTimeout(initTimeout);
      if (pollInterval) clearInterval(pollInterval);
      subscription?.unsubscribe();
    };
  }, []);

  return {
    session,
    user,
    profile,
    loading,
    error,
    refreshProfile,
  };
}
