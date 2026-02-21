// supabase/functions/create-user-profile/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

/**
 * Edge Function CAFCOOP - Création Profil Utilisateur
 * 
 * Appelée automatiquement après signup via Database Webhook
 * OU manuellement depuis le frontend via useAuth
 * 
 * Endpoints:
 * POST /create-user-profile
 * 
 * Body: { id_auth, email, nom?, prenom?, role? }
 * 
 * Returns: { ok: true, profile: {...}, existed: boolean }
 */

interface ProfileRequest {
  id_auth: string
  email: string
  nom?: string
  prenom?: string
  role?: string
  telephone?: string
}

interface ProfileResponse {
  ok: boolean
  profile?: any
  existed?: boolean
  error?: string
}

serve(async (req) => {
  // CORS headers pour permettre appels depuis le frontend
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ========================================
    // 1. INITIALISATION SUPABASE
    // ========================================
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables')
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
    
    console.log('✅ Supabase client initialized')
    
    // ========================================
    // 2. PARSE REQUEST BODY
    // ========================================
    const body: ProfileRequest = await req.json()
    
    const {
      id_auth,
      email,
      nom = '',
      prenom = '',
      role = 'agriculteur',
      telephone = '',
    } = body
    
    // Validation
    if (!id_auth || !email) {
      console.error('❌ Missing required fields:', { id_auth, email })
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Missing required fields: id_auth and email',
        } as ProfileResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    
    console.log('🔵 Creating profile for:', email, '| id_auth:', id_auth)
    
    // ========================================
    // 3. VÉRIFIER SI PROFIL EXISTE DÉJÀ
    // ========================================
    const { data: existingProfile, error: checkError } = await supabase
      .from('utilisateurs')
      .select('*')
      .eq('id_auth', id_auth)
      .maybeSingle()
    
    if (checkError) {
      console.error('❌ Error checking existing profile:', checkError)
      throw checkError
    }
    
    if (existingProfile) {
      console.log('✅ Profile already exists:', existingProfile.id_utilisateur)
      return new Response(
        JSON.stringify({
          ok: true,
          profile: existingProfile,
          existed: true,
        } as ProfileResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    
    // ========================================
    // 4. CRÉER LE PROFIL
    // ========================================
    console.log('📝 Creating new profile...')
    
    const { data: newProfile, error: insertError } = await supabase
      .from('utilisateurs')
      .insert({
        id_auth,
        email,
        nom,
        prenom,
        telephone,
        role,
        statut: 'actif',
        date_inscription: new Date().toISOString(),
        derniere_connexion: new Date().toISOString(),
      })
      .select()
      .single()
    
    if (insertError) {
      console.error('❌ Error inserting profile:', insertError)
      
      // Gestion spécifique des erreurs
      if (insertError.code === '23505') {
        // Duplicate key (race condition possible)
        console.warn('⚠️ Duplicate profile detected, fetching existing...')
        
        const { data: existing } = await supabase
          .from('utilisateurs')
          .select('*')
          .eq('id_auth', id_auth)
          .single()
        
        if (existing) {
          return new Response(
            JSON.stringify({
              ok: true,
              profile: existing,
              existed: true,
            } as ProfileResponse),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
      }
      
      throw insertError
    }
    
    console.log('✅ Profile created successfully:', newProfile.id_utilisateur)
    
    // ========================================
    // 5. LOG DANS UNE TABLE D'AUDIT (OPTIONNEL)
    // ========================================
    try {
      await supabase.from('audit_logs').insert({
        action: 'profile_created',
        user_id: id_auth,
        metadata: {
          email,
          role,
          created_at: new Date().toISOString(),
        },
      })
    } catch (auditError) {
      // Ne pas bloquer si audit échoue
      console.warn('⚠️ Audit log failed:', auditError)
    }
    
    // ========================================
    // 6. RETOURNER LE PROFIL CRÉÉ
    // ========================================
    return new Response(
      JSON.stringify({
        ok: true,
        profile: newProfile,
        existed: false,
      } as ProfileResponse),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
    
  } catch (error) {
    console.error('❌ Edge Function fatal error:', error)
    
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
      } as ProfileResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

/* Test local:
deno run --allow-net --allow-env index.ts
curl -X POST http://localhost:8000 \
  -H "Content-Type: application/json" \
  -d '{"id_auth":"test-uuid","email":"test@example.com"}'
*/
