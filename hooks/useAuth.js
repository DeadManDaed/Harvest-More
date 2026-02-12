// hooks/useAuth.js
import { useState, useEffect } from 'react';
import { getSupabaseBrowser } from '../lib/supabase';
import { AuthLog, ProfileLog, ErrorLog, PerfLog } from '../lib/log';

/**
 * Hook personnalisé pour gérer l'authentification
 * 
 * @returns {Object} État auth
 * - session: Session Supabase actuelle
 * - user: Utilisateur auth Supabase
 * - profile: Profil CAFCOOP (public.utilisateurs)
 * - loading: Chargement initial
 * - error: Erreur éventuelle
 * - refreshProfile: Fonction pour recharger le profil
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ========================================
  // FONCTION : Charger le profil CAFCOOP
  // ========================================
  const loadProfile = async (authUserId) => {
    if (!authUserId) {
      ProfileLog.loadFailure(authUserId, new Error('Missing authUserId'));
      return null;
    }

    const perfMeasure = PerfLog.measureStart('loadProfile');
    ProfileLog.loadAttempt(authUserId);

    try {
      const supabase = getSupabaseBrowser();

      // Récupérer le profil lié
      const { data: userRow, error: profileError } = await supabase
        .from('utilisateurs')
        .select('*')
        .eq('id_auth', authUserId)
        .maybeSingle();

      if (profileError) {
        ProfileLog.loadFailure(authUserId, profileError);
        ErrorLog.handled(profileError, { context: 'loadProfile', authUserId });
        throw profileError;
      }

      // Si profil n'existe pas, appeler l'API pour le créer
      if (!userRow) {
        ProfileLog.createAttempt(authUserId, 'fetching email...');
        
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const email = authUser?.email || '';

        ProfileLog.createAttempt(authUserId, email);
        
        const response = await fetch('/api/auth/link-profile', {
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
      ProfileLog.loadFailure(authUserId, err);
      ErrorLog.handled(err, { context: 'loadProfile', authUserId });
      perfMeasure.end();
      throw err;
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
    const supabase = getSupabaseBrowser();
    let isMounted = true;

    // Fonction init
    const initAuth = async () => {
      const perfMeasure = PerfLog.measureStart('initAuth');
      AuthLog.authStateChange('INIT', null);

      try {
        // Récupérer la session actuelle
        const { data: { session: currentSession }, error: sessionError } = 
          await supabase.auth.getSession();

        if (sessionError) {
          AuthLog.loginFailure('session-check', sessionError);
          ErrorLog.handled(sessionError, { context: 'getSession' });
          throw sessionError;
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
        if (isMounted) {
          setLoading(false);
        }
        perfMeasure.end();
      }
    };

    // Lancer init
    initAuth();

    // Écouter les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
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

    // Cleanup
    return () => {
      isMounted = false;
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
