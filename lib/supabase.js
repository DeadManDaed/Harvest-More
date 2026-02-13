// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// ========================================
// CONFIGURATION
// ========================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ ERREUR CRITIQUE : Variables Supabase manquantes');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌ MANQUANT');
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '✅' : '❌ MANQUANT');
}

// ========================================
// CLIENT-SIDE SUPABASE (Browser)
// ========================================
let browserClient = null;

export function getSupabaseBrowser() {
  if (typeof window === 'undefined') {
    throw new Error('❌ getSupabaseBrowser appelé côté serveur');
  }

  // Réutiliser le client existant si déjà créé
  if (browserClient) {
    return browserClient;
  }

  console.log('🔧 Création du client Supabase browser...');

  try {
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'cafcoop-auth',
        flowType: 'pkce',
      },
      global: {
        headers: {
          'X-Client-Info': 'cafcoop-web',
        },
        // CRITIQUE : Timeout plus long pour éviter "signal aborted"
        fetch: (url, options = {}) => {
          return fetch(url, {
            ...options,
            // Désactiver signal si présent (cause du "signal is aborted")
            signal: undefined,
          });
        },
      },
      db: {
        schema: 'public',
      },
    });

    console.log('✅ Client Supabase browser créé avec succès');
    return browserClient;
  } catch (err) {
    console.error('❌ Erreur création client Supabase:', err);
    throw err;
  }
}

// ========================================
// SERVER-SIDE SUPABASE (API Routes)
// ========================================
export function getSupabaseServer() {
  if (typeof window !== 'undefined') {
    throw new Error('❌ getSupabaseServer appelé côté client');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant (serveur)');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ========================================
// HELPERS AVEC RETRY LOGIC
// ========================================

/**
 * Wrapper fetch avec retry automatique
 */
async function fetchWithRetry(fn, maxRetries = 2, delay = 1000) {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      lastError = err;
      
      // Si erreur "signal aborted", retry immédiatement
      if (err.message?.includes('aborted') && i < maxRetries) {
        console.warn(`⚠️ Retry ${i + 1}/${maxRetries} après erreur:`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Si autre erreur, ne pas retry
      throw err;
    }
  }
  
  throw lastError;
}

/**
 * Récupère l'utilisateur auth courant avec retry
 */
export async function getCurrentAuthUser() {
  try {
    const supabase = getSupabaseBrowser();
    
    const result = await fetchWithRetry(async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        console.error('getCurrentAuthUser error:', error);
        throw error;
      }
      
      return user;
    });
    
    return result;
  } catch (err) {
    console.error('❌ getCurrentAuthUser fatal error:', err);
    return null;
  }
}

/**
 * Récupère la session courante avec retry
 */
export async function getCurrentSession() {
  try {
    const supabase = getSupabaseBrowser();
    
    const result = await fetchWithRetry(async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('getCurrentSession error:', error);
        throw error;
      }
      
      return session;
    });
    
    return result;
  } catch (err) {
    console.error('❌ getCurrentSession fatal error:', err);
    return null;
  }
}

/**
 * Déconnexion avec nettoyage complet
 */
export async function signOut() {
  try {
    const supabase = getSupabaseBrowser();
    
    // 1. Nettoyer localStorage AVANT l'appel API
    if (typeof window !== 'undefined') {
      console.log('🧹 Nettoyage localStorage...');
      
      // Clé spécifique CAFCOOP
      localStorage.removeItem('cafcoop-auth');
      
      // Clés Supabase génériques
      const projectRef = SUPABASE_URL?.split('//')[1]?.split('.')[0];
      if (projectRef) {
        localStorage.removeItem(`sb-${projectRef}-auth-token`);
      }
      
      // Nettoyer toutes les clés Supabase restantes
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });
    }
    
    // 2. Appeler l'API de logout
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('❌ signOut API error:', error);
      // Continuer quand même (localStorage déjà nettoyé)
    }
    
    // 3. Reset le client browser
    browserClient = null;
    
    console.log('✅ Déconnexion complète réussie');
    return { success: true };
  } catch (err) {
    console.error('❌ signOut fatal error:', err);
    
    // Forcer le nettoyage même en cas d'erreur
    if (typeof window !== 'undefined') {
      localStorage.clear();
    }
    browserClient = null;
    
    return { success: false, error: err };
  }
}

/**
 * Réinitialiser le client (utile après erreur)
 */
export function resetSupabaseClient() {
  console.log('🔄 Reset du client Supabase...');
  browserClient = null;
  
  if (typeof window !== 'undefined') {
    // Nettoyer le cache
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase') || key.includes('cafcoop')) {
        localStorage.removeItem(key);
      }
    });
  }
  
  console.log('✅ Client réinitialisé');
}
