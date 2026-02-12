// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// ========================================
// CLIENT-SIDE SUPABASE (Browser)
// ========================================
let browserClient = null;

export function getSupabaseBrowser() {
  if (typeof window === 'undefined') {
    throw new Error('getSupabaseBrowser appelé côté serveur');
  }

  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant');
    }

    browserClient = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'cafcoop-auth',
      },
    });
  }

  return browserClient;
}

// ========================================
// SERVER-SIDE SUPABASE (API Routes)
// ========================================
export function getSupabaseServer() {
  if (typeof window !== 'undefined') {
    throw new Error('getSupabaseServer appelé côté client');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant (serveur)');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ========================================
// HELPERS
// ========================================

/**
 * Récupère l'utilisateur auth courant (client-side uniquement)
 */
export async function getCurrentAuthUser() {
  const supabase = getSupabaseBrowser();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('getCurrentAuthUser error:', error);
    return null;
  }
  
  return user;
}

/**
 * Récupère la session courante (client-side uniquement)
 */
export async function getCurrentSession() {
  const supabase = getSupabaseBrowser();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('getCurrentSession error:', error);
    return null;
  }
  
  return session;
}

/**
 * Déconnexion (client-side uniquement)
 */
export async function signOut() {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('signOut error:', error);
    return { success: false, error };
  }
  
  return { success: true };
}
