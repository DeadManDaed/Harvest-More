// hooks/useAuth.js - Harvest More Africa
// Système d'authentification complet avec gestion multi-rôles et relations

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  tableName: 'utilisateurs',
  roles: {
    AGRICULTEUR: 'agriculteur',
    COMMERCIAL: 'commercial',
    TECHNICIEN: 'technicien',
    ADMIN: 'admin',
    SUPERADMIN: 'superadmin',
    AUDITEUR: 'auditeur',
  },
  safetyTimeout: 15000, // 15 secondes
  maxRetries: 3,
};

// ═══════════════════════════════════════════════════════════════════════════
// Utilitaires
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère un username depuis prénom + nom
 * Exemple: "Bernard Olivier" + "Ndjom Fils" → "bernardolivier.ndjomfils"
 */
function generateUsername(prenom, nom) {
  if (!prenom || !nom) return null;
  
  const normalize = str => str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Retire accents
    .replace(/[^a-z0-9]/g, '');       // Garde que alphanumeric
  
  return `${normalize(prenom)}.${normalize(nom)}`;
}

/**
 * Détermine si l'identifiant est un email, téléphone ou username
 */
function identifyLoginType(identifier) {
  if (!identifier) return null;
  
  const cleaned = identifier.trim();
  
  // Email : contient @ et .
  if (cleaned.includes('@') && cleaned.includes('.')) {
    return { type: 'email', value: cleaned };
  }
  
  // Téléphone : commence par + ou chiffres uniquement (priorité Cameroun)
  if (/^[\+]?[0-9\s\-\(\)]+$/.test(cleaned)) {
    const cleanedPhone = cleaned.replace(/[\s\-\(\)]/g, '');
    return { type: 'telephone', value: cleanedPhone };
  }
  
  // Username : format prenom.nom
  if (cleaned.includes('.')) {
    return { type: 'username', value: cleaned.toLowerCase() };
  }
  
  // Par défaut, traiter comme username
  return { type: 'username', value: cleaned.toLowerCase() };
}

/**
 * Nettoyage localStorage à la déconnexion
 */
function clearLocalUserData() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    // Préserver clés Supabase
    if (key && !key.startsWith('sb-') && !key.startsWith('supabase.auth')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  sessionStorage.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper fetch authentifié
// ═══════════════════════════════════════════════════════════════════════════

export async function authFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    window.dispatchEvent(new Event('auth:expired'));
    throw new Error('Session expirée');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `Erreur HTTP ${res.status}` }));
    throw new Error(err.message || `Erreur HTTP ${res.status}`);
  }

  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// Chargement du profil utilisateur
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Charge le profil utilisateur avec toutes ses relations
 * Retry avec backoff exponentiel en cas d'échec
 */
async function loadUserProfile(authId, retries = CONFIG.maxRetries) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Charger utilisateur de base
      const { data: user, error: userError } = await supabase
        .from('utilisateurs')
        .select(`
          id_utilisateur,
          nom,
          prenom,
          email,
          telephone,
          role,
          statut,
          photo_profil,
          langue,
          magasin_id,
          cooperative_id,
          agriculteur_id,
          date_derniere_activite,
          demande_reactivation
        `)
        .eq('id_auth', authId)
        .maybeSingle();

      if (userError) {
        console.error(`[useAuth] Erreur chargement profil (${attempt + 1}/${retries}):`, userError);
        
        if (attempt < retries - 1) {
          const delay = 500 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return null;
      }

      // Vérifier statut
      if (!user) {
        console.warn('[useAuth] Profil non trouvé');
        return null;
      }

      // Gestion réactivation automatique (< 6 mois) ou demande (> 6 mois)
      if (user.statut === 'inactif') {
        const inactivityDays = user.date_derniere_activite
          ? Math.floor((Date.now() - new Date(user.date_derniere_activite)) / (1000 * 60 * 60 * 24))
          : 999;

        if (inactivityDays < 180) {
          // Réactivation automatique
          console.log('[useAuth] Réactivation auto (< 6 mois)');
          
          await supabase
            .from('utilisateurs')
            .update({
              statut: 'actif',
              date_derniere_activite: new Date().toISOString(),
              demande_reactivation: false,
            })
            .eq('id_auth', authId);
          
          user.statut = 'actif';
        } else {
          // Marquer demande de réactivation
          if (!user.demande_reactivation) {
            console.log('[useAuth] Demande réactivation (> 6 mois)');
            
            await supabase
              .from('utilisateurs')
              .update({
                demande_reactivation: true,
                date_demande_reactivation: new Date().toISOString(),
              })
              .eq('id_auth', authId);
          }
          
          console.warn('[useAuth] Compte inactif > 6 mois, validation requise');
          return null;
        }
      }

      // Rejeter si suspendu ou exclu
      if (user.statut === 'suspendu' || user.statut === 'exclu') {
        console.warn('[useAuth] Compte suspendu ou exclu');
        return null;
      }

      // Vérifier statut actif final
      if (user.statut !== 'actif') {
        console.warn('[useAuth] Statut non actif:', user.statut);
        return null;
      }

      // Construire profil de base
      const profile = {
        id: user.id_utilisateur,
        authId: authId,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        role: user.role,
        statut: user.statut,
        photoProfiler: user.photo_profil,
        langue: user.langue || 'fr',
        username: generateUsername(user.prenom, user.nom),
      };

      // ─────────────────────────────────────────────────────────────────────
      // Charger relations selon rôle
      // ─────────────────────────────────────────────────────────────────────

      // Magasin (pour commercial, admin)
      if (user.magasin_id) {
        const { data: magasin } = await supabase
          .from('magasins')
          .select('id, nom, telephone, arrondissement_id')
          .eq('id', user.magasin_id)
          .maybeSingle();

        profile.magasin = magasin ? {
          id: magasin.id,
          nom: magasin.nom,
          telephone: magasin.telephone,
        } : null;
      }

      // Magasins multiples (pour admin)
      if (user.role === 'admin') {
        const { data: adminMagasins } = await supabase
          .from('admin_magasins')
          .select(`
            magasin_id,
            est_principal,
            magasins (id, nom, telephone)
          `)
          .eq('admin_id', user.id_utilisateur)
          .eq('statut', 'actif');

        profile.magasins = adminMagasins?.map(am => ({
          id: am.magasins.id,
          nom: am.magasins.nom,
          telephone: am.magasins.telephone,
          estPrincipal: am.est_principal,
        })) || [];
      }

      // Coopérative (pour agriculteur)
      if (user.cooperative_id) {
        const { data: cooperative } = await supabase
          .from('cooperatives')
          .select('id, nom, president_nom, telephone_contact')
          .eq('id', user.cooperative_id)
          .maybeSingle();

        profile.cooperative = cooperative ? {
          id: cooperative.id,
          nom: cooperative.nom,
          presidentNom: cooperative.president_nom,
          telephone: cooperative.telephone_contact,
        } : null;
      }

      // Fiche agriculteur détaillée
      if (user.agriculteur_id) {
        const { data: agriculteur } = await supabase
          .from('agriculteurs')
          .select(`
            id_agriculteur,
            numero_carte_agriculteur,
            commune,
            village,
            superficie_totale,
            type_exploitation,
            niveau_formation,
            cooperative
          `)
          .eq('id_agriculteur', user.agriculteur_id)
          .maybeSingle();

        profile.agriculteur = agriculteur ? {
          id: agriculteur.id_agriculteur,
          numeroCarte: agriculteur.numero_carte_agriculteur,
          commune: agriculteur.commune,
          village: agriculteur.village,
          superficie: agriculteur.superficie_totale,
          typeExploitation: agriculteur.type_exploitation,
          niveauFormation: agriculteur.niveau_formation,
          cooperativeNom: agriculteur.cooperative,
        } : null;
      }

      return profile;

    } catch (err) {
      console.error(`[useAuth] Exception chargement profil (${attempt + 1}/${retries}):`, err);
      
      if (attempt < retries - 1) {
        const delay = 500 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AuthProvider
// ═══════════════════════════════════════════════════════════════════════════

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const resolving = useRef(false);
  const initialLoadDone = useRef(false);

  const resolveProfile = useCallback(async (supabaseUser) => {
    if (resolving.current) {
      console.log('[useAuth] resolveProfile déjà en cours, skip');
      return;
    }
    resolving.current = true;

    try {
      if (!supabaseUser) {
        console.log('[useAuth] Pas de user Supabase, clear user');
        setUser(null);
        return;
      }

      console.log('[useAuth] Chargement profil pour:', supabaseUser.id);
      const profile = await loadUserProfile(supabaseUser.id);
      
      if (profile) {
        console.log('[useAuth] Profil chargé:', profile.email, profile.role);
        
        // Update derniere_activite
        supabase
          .from('utilisateurs')
          .update({ date_derniere_activite: new Date().toISOString() })
          .eq('id_auth', supabaseUser.id)
          .then(() => console.log('[useAuth] Dernière activité mise à jour'));
      } else {
        console.warn('[useAuth] Profil non trouvé, inactif ou en attente validation');
      }
      
      setUser(profile ?? null);

    } catch (err) {
      console.error('[useAuth] Erreur resolveProfile:', err);
      setUser(null);
    } finally {
      resolving.current = false;
      
      if (!initialLoadDone.current) {
        console.log('[useAuth] Chargement initial terminé');
        initialLoadDone.current = true;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    console.log('[useAuth] Initialisation...');

    const safetyTimeout = setTimeout(() => {
      if (mounted && !initialLoadDone.current) {
        console.warn('[useAuth] Safety timeout atteint, déblocage loading');
        initialLoadDone.current = true;
        setLoading(false);
      }
    }, CONFIG.safetyTimeout);

    const initAuth = async () => {
      try {
        console.log('[useAuth] getSession...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[useAuth] Erreur getSession:', error);
        }
        
        if (mounted) {
          await resolveProfile(session?.user ?? null);
        }
      } catch (err) {
        console.error('[useAuth] Exception initAuth:', err);
        if (mounted) {
          setUser(null);
          if (!initialLoadDone.current) {
            initialLoadDone.current = true;
            setLoading(false);
          }
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log('[useAuth] onAuthStateChange:', event);

        if (event === 'SIGNED_OUT') {
          console.log('[useAuth] SIGNED_OUT → clear user');
          clearLocalUserData();
          setUser(null);
          return;
        }

        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          console.log('[useAuth]', event, '→ skip');
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          if (user) {
            console.log('[useAuth] SIGNED_IN mais user déjà chargé, skip');
            return;
          }
          console.log('[useAuth] SIGNED_IN → resolve profile');
          await resolveProfile(session.user);
        }
      }
    );

    return () => {
      console.log('[useAuth] Cleanup');
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [resolveProfile, user]);

  // ═════════════════════════════════════════════════════════════════════════
  // Login
  // ═════════════════════════════════════════════════════════════════════════

  const login = async ({ identifier, password }) => {
    console.log('[useAuth] login avec:', identifier);
    
    const loginInfo = identifyLoginType(identifier);
    
    if (!loginInfo) {
      throw new Error('Identifiant invalide');
    }

    let email = null;

    // Cas 1 : Login direct avec email
    if (loginInfo.type === 'email') {
      email = loginInfo.value;
    }
    // Cas 2 : Login avec téléphone (PRIORITÉ Cameroun)
    else if (loginInfo.type === 'telephone') {
      console.log('[useAuth] Recherche email par téléphone:', loginInfo.value);
      
      const { data, error } = await supabase
        .from('utilisateurs')
        .select('email')
        .eq('telephone', loginInfo.value)
        .eq('statut', 'actif')
        .maybeSingle();

      if (error || !data) {
        console.error('[useAuth] Téléphone non trouvé:', error);
        throw new Error('Numéro de téléphone introuvable ou compte inactif');
      }

      email = data.email;
    }
    // Cas 3 : Login avec username
    else if (loginInfo.type === 'username') {
      console.log('[useAuth] Recherche email par username:', loginInfo.value);
      
      const { data: users, error } = await supabase
        .from('utilisateurs')
        .select('prenom, nom, email')
        .eq('statut', 'actif');

      if (error || !users || users.length === 0) {
        console.error('[useAuth] Erreur recherche users:', error);
        throw new Error('Utilisateur introuvable');
      }

      const match = users.find(u => {
        const generatedUsername = generateUsername(u.prenom, u.nom);
        return generatedUsername === loginInfo.value;
      });

      if (!match) {
        console.warn('[useAuth] Username non trouvé:', loginInfo.value);
        throw new Error('Utilisateur introuvable');
      }

      email = match.email;
    }

    if (!email) {
      throw new Error('Impossible de déterminer l\'email');
    }

    console.log('[useAuth] Login Supabase avec email:', email);

    // Login Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });

    if (error) {
      console.error('[useAuth] Erreur login Supabase:', error);
      throw new Error(error.message || 'Identifiants incorrects');
    }

    // Charger le profil
    console.log('[useAuth] Login réussi, chargement profil...');
    const profile = await loadUserProfile(data.user.id);
    
    if (!profile) {
      console.error('[useAuth] Profil introuvable, inactif ou en attente validation');
      await supabase.auth.signOut();
      throw new Error('Profil introuvable, compte inactif ou en attente de validation');
    }

    console.log('[useAuth] Login complet:', profile.email, profile.role);
    setUser(profile);
    return profile;
  };

  // ═════════════════════════════════════════════════════════════════════════
  // Logout
  // ═════════════════════════════════════════════════════════════════════════

  const logout = async () => {
    console.log('[useAuth] logout');
    try {
      clearLocalUserData();
      await supabase.auth.signOut().catch((err) => {
        console.error('[useAuth] Erreur signOut:', err);
      });
    } finally {
      setUser(null);
      resolving.current = false;
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // Context Value
  // ═════════════════════════════════════════════════════════════════════════

  const contextValue = {
    user,
    loading,
    login,
    logout,
    
    // Helpers
    isAuthenticated: !!user,
    
    // Rôles
    isAgriculteur: user?.role === CONFIG.roles.AGRICULTEUR,
    isCommercial: user?.role === CONFIG.roles.COMMERCIAL,
    isTechnicien: user?.role === CONFIG.roles.TECHNICIEN,
    isAdmin: user?.role === CONFIG.roles.ADMIN || user?.role === CONFIG.roles.SUPERADMIN,
    isSuperAdmin: user?.role === CONFIG.roles.SUPERADMIN,
    isAuditeur: user?.role === CONFIG.roles.AUDITEUR,
    
    // Relations
    magasinId: user?.magasin?.id ?? null,
    magasins: user?.magasins ?? [], // Pour admin multi-magasins
    cooperativeId: user?.cooperative?.id ?? null,
    agriculteurId: user?.agriculteur?.id ?? null,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Hook useAuth
// ═══════════════════════════════════════════════════════════════════════════

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

export { generateUsername, identifyLoginType };
