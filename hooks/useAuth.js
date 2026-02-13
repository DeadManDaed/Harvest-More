// hooks/useAuth-fixed.js
import { useState, useEffect, useRef } from 'react';
import { getSupabaseBrowser, resetSupabaseClient } from '../lib/supabase-fixed';
import { AuthLog, ProfileLog, ErrorLog, PerfLog } from '../lib/log';

/**
 * Hook useAuth ROBUSTE avec gestion des erreurs "signal aborted"
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Refs pour éviter les appels multiples
  const initAttempted = useRef(false);
  const loadProfileAttempted = useRef(new Set());

  // ========================================
  // FONCTION : Charger le profil CAFCOOP
  // ========================================
  const loadProfile = async (authUserId, retryCount = 0) => {
    const maxRetries = 2;
    
    // Éviter les doubles appels
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

      // IMPORTANT : Timeout manuel de 8 secondes
      const profilePromise = supabase
        .from('utilisateurs')
        .select('*')
        .eq('id_auth', authUserId)
        .maybeSingle();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile query timeout')), 8000)
      );

      const { data: userRow, error: profileError } = await Promise.race([
        profilePromise,
        timeoutPromise,
      ]);

      if (profileError) {
        // Si erreur "aborted" et retry disponible
        if (profileError.message?.includes('aborted') && retryCount < maxRetries) {
          console.warn(`⚠️ Signal aborted, retry ${retryCount + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return await loadProfile(authUserId, retryCount + 1);
        }

        ProfileLog.loadFailure(authUserId, profileError);
        ErrorLog.handled(profileError, { context: 'loadProfile', authUserId, retryCount });
        throw profileError;
      }

      // Si profil n'existe pas, appeler l'API pour le créer
      if (!userRow) {
        ProfileLog.createAttempt(authUserId, 'fetching email...');
        
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const email = authUser?.email || '';

        ProfileLog.createAttempt(authUserId, email);
        
        // Timeout pour l'API aussi
        const apiPromise = fetch('/api/auth/link-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_auth: authUserId,
            email,
            nom: '',
            prenom: '',
            role: 'agriculteur',
          }),
        });

        const apiTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Link profile API timeout')), 10000)
        );

        const response = await Promise.race([apiPromise, apiTimeoutPromise]);
        const json = await response.json();

        if (!response.ok || !json.ok) {
          ProfileLog.createFailure(authUserId, new Error(json.error));
          throw new Error(json.error || 'Échec création profil');
        }

        ProfileLog.createSuccess(authUserId, json.user.id_utilisateur);
        perfMeasure.end();
        return json.user;
      }

      ProfileLog.loadSuccess(authUserId, userRow.id_utilisateur, userRow.role);
      
      // Vérifier profil incomplet
      if (!userRow.nom || !userRow.prenom) {
        ProfileLog.profileIncomplete(userRow.id_utilisateur, {
          nom: !userRow.nom,
          prenom: !userRow.prenom,
        });
      }

      perfMeasure.end();
      return userRow;

    } catch (err) {
      // Si erreur "aborted" et retry disponible
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
      // Nettoyer le cache après 5 secondes
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
    // Éviter double init en React Strict Mode
    if (initAttempted.current) {
      console.log('⚠️ useAuth déjà initialisé, skip');
      return;
    }
    initAttempted.current = true;

    let supabase;
    let subscription;
    let isMounted = true;
    let initTimeout;

    // Fonction init
    const initAuth = async () => {
      const perfMeasure = PerfLog.measureStart('initAuth');
      AuthLog.authStateChange('INIT', null);

      try {
        supabase = getSupabaseBrowser();

        // Timeout global de 10 secondes pour init
        initTimeout = setTimeout(() => {
          if (isMounted && loading) {
            console.error('⏱️ Init auth timeout après 10s');
            setError('Timeout initialisation auth');
            setLoading(false);
          }
        }, 10000);

        // Récupérer la session actuelle avec timeout
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
          // Si erreur "aborted", reset et retry
          if (sessionError.message?.includes('aborted')) {
            console.warn('⚠️ Session aborted, reset client et retry...');
            resetSupabaseClient();
            
            // Retry une fois
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

        // Session trouvée
        AuthLog.sessionStart(currentSession.user.id, currentSession.user.email);
        setSession(currentSession);
        setUser(currentSession.user);

        // Charger le profil CAFCOOP
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

    // Lancer init
    initAuth();

    // Écouter les changements d'auth
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
          } else if (event === 'TOKEN_REFRESHED') {
            AuthLog.authStateChange('TOKEN_REFRESHED', newSession?.user?.id);
          } else if (event === 'USER_UPDATED') {
            AuthLog.authStateChange('USER_UPDATED', newSession?.user?.id);
          }
        }
      );
      subscription = authListener.subscription;
    } catch (err) {
      console.error('❌ Erreur onAuthStateChange:', err);
    }

    // Cleanup
    return () => {
      isMounted = false;
      if (initTimeout) clearTimeout(initTimeout);
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
