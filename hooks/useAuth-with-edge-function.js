// hooks/useAuth-with-edge-function.js

import { useState, useEffect, useRef } from 'react';
import { getSupabaseBrowser, resetSupabaseClient } from '../lib/supabase-fixed';
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
  const loadProfile = async (authUserId, retryCount = 0) => {
    const maxRetries = 2;
    const cacheKey = `${authUserId}-${retryCount}`;
    
    if (loadProfileAttempted.current.has(cacheKey)) {
      console.warn('⚠️ loadProfile déjà en cours, skip');
      return null;
    }
    loadProfileAttempted.current.add(cacheKey);

    if (!authUserId) {
      ProfileLog.loadFailure(authUserId, new Error('Missing authUserId'));
      return null;
    }

    const perfMeasure = PerfLog.measureStart('loadProfile');
    ProfileLog.loadAttempt(authUserId);

    try {
      const supabase = getSupabaseBrowser();

      // Timeout de 10 secondes (augmenté)
      const profilePromise = supabase
        .from('utilisateurs')
        .select('*')
        .eq('id_auth', authUserId)
        .maybeSingle();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile query timeout')), 10000)
      );

      const { data: userRow, error: profileError } = await Promise.race([
        profilePromise,
        timeoutPromise,
      ]);

      if (profileError) {
        if (profileError.message?.includes('aborted') && retryCount < maxRetries) {
          console.warn(`⚠️ Signal aborted, retry ${retryCount + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return await loadProfile(authUserId, retryCount + 1);
        }

        ProfileLog.loadFailure(authUserId, profileError);
        ErrorLog.handled(profileError, { context: 'loadProfile', authUserId, retryCount });
        throw profileError;
      }

      // ========================================
      // SI PROFIL N'EXISTE PAS → APPELER EDGE FUNCTION
      // ========================================
      if (!userRow) {
        ProfileLog.createAttempt(authUserId, 'fetching email...');
        
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const email = authUser?.email || '';

        ProfileLog.createAttempt(authUserId, email);
        
        // URL de l'Edge Function
        const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-user-profile`;
        
        console.log('🔵 Calling Edge Function:', EDGE_FUNCTION_URL);
        
        // Appel à l'Edge Function avec timeout
        const edgeFunctionPromise = fetch(EDGE_FUNCTION_URL, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            id_auth: authUserId,
            email,
            nom: '',
            prenom: '',
            role: 'agriculteur',
          }),
        });

        const edgeTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Edge Function timeout')), 8000)
        );

        const response = await Promise.race([edgeFunctionPromise, edgeTimeoutPromise]);
        const json = await response.json();

        if (!response.ok || !json.ok) {
          ProfileLog.createFailure(authUserId, new Error(json.error));
          throw new Error(json.error || 'Échec création profil');
        }

        ProfileLog.createSuccess(authUserId, json.profile.id_utilisateur);
        perfMeasure.end();
        return json.profile;
      }

      ProfileLog.loadSuccess(authUserId, userRow.id_utilisateur, userRow.role);
      
      if (!userRow.nom || !userRow.prenom) {
        ProfileLog.profileIncomplete(userRow.id_utilisateur, {
          nom: !userRow.nom,
          prenom: !userRow.prenom,
        });
      }

      perfMeasure.end();
      return userRow;

    } catch (err) {
      if (err.message?.includes('aborted') && retryCount < maxRetries) {
        console.warn(`⚠️ Catch aborted, retry ${retryCount + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await loadProfile(authUserId, retryCount + 1);
      }

      ProfileLog.loadFailure(authUserId, err);
      ErrorLog.handled(err, { context: 'loadProfile', authUserId, retryCount });
      perfMeasure.end();
      throw err;
    } finally {
      setTimeout(() => {
        loadProfileAttempted.current.delete(cacheKey);
      }, 5000);
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
