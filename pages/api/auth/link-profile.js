// pages/api/auth/link-profile.js
import { getSupabaseServer } from '../../../lib/supabase';

/**
 * API Route pour créer/récupérer un profil CAFCOOP lié à un utilisateur auth
 * 
 * POST /api/auth/link-profile
 * Body: { id_auth, email, nom?, prenom?, role? }
 * 
 * Retourne: { ok: true, user } ou { ok: false, error }
 */
export default async function handler(req, res) {
  // Méthode autorisée
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      ok: false, 
      error: 'Method not allowed' 
    });
  }

  // Validation input
  const { id_auth, email, nom = '', prenom = '', role = 'agriculteur' } = req.body || {};
  
  if (!id_auth || !email) {
    return res.status(400).json({ 
      ok: false, 
      error: 'id_auth et email requis' 
    });
  }

  // Vérification env vars
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Variables d\'environnement manquantes (serveur)');
    return res.status(500).json({ 
      ok: false, 
      error: 'Configuration serveur incomplète' 
    });
  }

  try {
    const supabase = getSupabaseServer();

    // ========================================
    // ÉTAPE 1 : Vérifier si profil existe déjà
    // ========================================
    const { data: existing, error: checkError } = await supabase
      .from('utilisateurs')
      .select('*')
      .eq('id_auth', id_auth)
      .maybeSingle();

    if (checkError) {
      console.error('❌ Erreur vérification profil existant:', checkError);
      return res.status(500).json({ 
        ok: false, 
        error: 'Erreur vérification profil' 
      });
    }

    // Si profil existe déjà, le retourner
    if (existing) {
      console.log('✅ Profil existant trouvé:', existing.id_utilisateur);
      return res.status(200).json({ 
        ok: true, 
        user: existing 
      });
    }

    // ========================================
    // ÉTAPE 2 : Créer le nouveau profil
    // ========================================
    const newUser = {
      id_auth,
      email: email.toLowerCase(),
      nom,
      prenom,
      role,
      statut: 'actif',
      date_inscription: new Date().toISOString(),
      derniere_connexion: new Date().toISOString(),
    };

    const { data: created, error: insertError } = await supabase
      .from('utilisateurs')
      .insert(newUser)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Erreur création profil:', insertError);
      
      // Gestion erreur duplicate email (si contrainte UNIQUE)
      if (insertError.code === '23505') {
        return res.status(409).json({ 
          ok: false, 
          error: 'Un profil avec cet email existe déjà' 
        });
      }

      return res.status(500).json({ 
        ok: false, 
        error: insertError.message || 'Échec création profil' 
      });
    }

    console.log('✅ Profil créé avec succès:', created.id_utilisateur);
    
    return res.status(201).json({ 
      ok: true, 
      user: created 
    });

  } catch (err) {
    console.error('❌ Erreur serveur link-profile:', err);
    return res.status(500).json({ 
      ok: false, 
      error: 'Erreur serveur interne' 
    });
  }
}
