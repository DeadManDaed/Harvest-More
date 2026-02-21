// pages/profil.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth-with-edge-function';
import { getSupabaseBrowser } from '../lib/supabase';
import { ProfileLog, UILog, ErrorLog } from '../lib/log';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function Profil() {
const router = useRouter();
  const { user, profile, refreshProfile, loading: authLoading, error: authError } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [timedOut, setTimedOut] = useState(false);

  // État du formulaire
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    telephone: '',
  });

  // ========================================
  // TIMEOUT DE SÉCURITÉ
  // ========================================
  // Si authLoading reste vrai > 10 secondes, afficher erreur
  useEffect(() => {
    if (authLoading) {
      const timeout = setTimeout(() => {
        console.error('⏱️ Auth loading timeout after 10 seconds');
        ErrorLog.unhandled(new Error('Auth loading timeout'), { 
          context: 'profil-page',
          authLoading,
          hasUser: !!user,
          hasProfile: !!profile,
        });
        setTimedOut(true);
      }, 10000); // 10 secondes

      return () => clearTimeout(timeout);
    } else {
      setTimedOut(false);
    }
  }, [authLoading, user, profile]);

  // ========================================
  // INITIALISER LE FORMULAIRE
  // ========================================
  useEffect(() => {
    if (profile) {
      UILog.pageView('profil', user?.id);
      setFormData({
        nom: profile.nom || '',
        prenom: profile.prenom || '',
        telephone: profile.telephone || '',
      });
    }
  }, [profile, user]);

  // ========================================
  // HANDLER : MISE À JOUR PROFIL
  // ========================================
  const handleUpdate = async (e) => {
    e.preventDefault();
    
    if (!user || !profile) {
      setMessage({ text: 'Session expirée. Reconnectez-vous.', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    ProfileLog.updateAttempt(profile.id_utilisateur, formData);

    try {
      const supabase = getSupabaseBrowser();

      const { error } = await supabase
        .from('utilisateurs')
        .update({
          nom: formData.nom,
          prenom: formData.prenom,
          telephone: formData.telephone,
        })
        .eq('id_auth', user.id);

      if (error) {
        ProfileLog.updateFailure(profile.id_utilisateur, error);
        throw error;
      }

      ProfileLog.updateSuccess(profile.id_utilisateur);
      setMessage({ text: '✅ Profil mis à jour avec succès !', type: 'success' });
      
      // Rafraîchir le profil global
      await refreshProfile();
    } catch (err) {
      ErrorLog.handled(err, { context: 'handleUpdate', userId: user.id });
      setMessage({ text: '❌ Erreur lors de la mise à jour.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // RENDER : LOADING
  // ========================================
  if (authLoading && !timedOut) {
    return (
      <>
        <Head>
          <title>Profil - Chargement...</title>
        </Head>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}>⏳</div>
          <p style={styles.loadingText}>Chargement de votre profil...</p>
        </div>
      </>
    );
  }

  // ========================================
  // RENDER : TIMEOUT ERROR
  // ========================================
  if (timedOut || authError) {
    return (
      <>
        <Head>
          <title>Profil - Erreur</title>
        </Head>
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠️</div>
          <h2 style={styles.errorTitle}>Erreur de chargement</h2>
          <p style={styles.errorText}>
            {authError || 'Le chargement a pris trop de temps.'}
          </p>
          <button 
            style={styles.retryButton} 
            onClick={() => {
              window.location.href = '/';
            }}
          >
            🏠 Retour à l'accueil
          </button>
          <button 
            style={{...styles.retryButton, marginTop: '10px', background: '#48bb78'}} 
            onClick={() => {
              window.location.reload();
            }}
          >
            🔄 Réessayer
          </button>
        </div>
      </>
    );
  }

  // ========================================
  // RENDER : NOT AUTHENTICATED
  // ========================================
  if (!user || !profile) {
    return (
      <>
        <Head>
          <title>Profil - Non connecté</title>
        </Head>
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>🔒</div>
          <h2 style={styles.errorTitle}>Non authentifié</h2>
          <p style={styles.errorText}>
            Vous devez être connecté pour accéder à votre profil.
          </p>
          <button 
            style={styles.retryButton} 
            onClick={() => {
              window.location.href = '/';
            }}
          >
            🔐 Se connecter
          </button>
        </div>
      </>
    );
  }

  // ========================================
  // RENDER : PROFIL FORM
  // ========================================
  return (
    <>
      <Head>
        <title>Mon Profil - CAFCOOP</title>
      </Head>
      
      <div style={styles.container}>
        <header style={styles.header}>
          <button onClick={() => router.push('/')} style={styles.backBtn}>
    ←
  </button>
          <h1 style={styles.title}>Mon Profil</h1>
        </header>

        <div style={styles.card}>
          {/* Avatar Section */}
          <div style={styles.avatarSection}>
            <div style={styles.avatar}>
              {formData.prenom ? formData.prenom[0].toUpperCase() : '👤'}
            </div>
            <p style={styles.emailText}>{user.email}</p>
            <span style={styles.badge}>{profile.role || 'agriculteur'}</span>
          </div>

          {/* Message Feedback */}
          {message.text && (
            <div 
              style={{
                ...styles.message, 
                backgroundColor: message.type === 'success' ? '#c6f6d5' : '#fed7d7',
                color: message.type === 'success' ? '#2f855a' : '#c53030',
              }}
            >
              {message.text}
            </div>
          )}

          {/* Formulaire */}
          <form onSubmit={handleUpdate} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Prénom</label>
              <input 
                style={styles.input}
                value={formData.prenom}
                onChange={(e) => setFormData({...formData, prenom: e.target.value})}
                placeholder="Ex: Jean"
                disabled={loading}
                required
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Nom</label>
              <input 
                style={styles.input}
                value={formData.nom}
                onChange={(e) => setFormData({...formData, nom: e.target.value})}
                placeholder="Ex: Dupont"
                disabled={loading}
                required
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Téléphone</label>
              <input 
                style={styles.input}
                type="tel"
                value={formData.telephone}
                onChange={(e) => setFormData({...formData, telephone: e.target.value})}
                placeholder="Ex: +237 6xx xxx xxx"
                disabled={loading}
              />
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              style={{
                ...styles.submitBtn,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '⏳ Enregistrement...' : '💾 Enregistrer les modifications'}
            </button>
          </form>

          {/* Profil Info */}
          <div style={styles.infoSection}>
            <p style={styles.infoLabel}>ID Utilisateur</p>
            <p style={styles.infoValue}>{profile.id_utilisateur}</p>
            
            <p style={styles.infoLabel}>Inscrit le</p>
            <p style={styles.infoValue}>
              {profile.date_inscription 
                ? new Date(profile.date_inscription).toLocaleDateString('fr-FR')
                : 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ========================================
// STYLES
// ========================================
const styles = {
  // Loading
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#f7fafc',
  },
  spinner: {
    fontSize: '48px',
    animation: 'spin 2s linear infinite',
  },
  loadingText: {
    marginTop: '20px',
    color: '#718096',
    fontSize: '16px',
  },

  // Error
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#fff5f5',
    padding: '20px',
  },
  errorIcon: {
    fontSize: '64px',
  },
  errorTitle: {
    marginTop: '20px',
    color: '#c53030',
    fontSize: '24px',
  },
  errorText: {
    color: '#742a2a',
    textAlign: 'center',
    maxWidth: '400px',
    marginBottom: '20px',
  },
  retryButton: {
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    cursor: 'pointer',
    fontWeight: '600',
  },

  // Page
  container: {
    padding: '20px',
    maxWidth: '600px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#f7fafc',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '20px',
    gap: '15px',
  },
  backBtn: {
    background: 'white',
    border: '1px solid #e2e8f0',
    fontSize: '24px',
    cursor: 'pointer',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    margin: 0,
    color: '#2d3748',
  },
  card: {
    background: 'white',
    padding: '30px',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  avatarSection: {
    textAlign: 'center',
    marginBottom: '30px',
    paddingBottom: '20px',
    borderBottom: '1px solid #e2e8f0',
  },
  avatar: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    fontWeight: '700',
    margin: '0 auto 15px',
    boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
  },
  emailText: {
    color: '#718096',
    fontSize: '14px',
    margin: '10px 0',
  },
  badge: {
    display: 'inline-block',
    background: '#ebf4ff',
    color: '#4299e1',
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    marginBottom: '30px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#4a5568',
  },
  input: {
    padding: '14px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    fontSize: '16px',
    transition: 'border-color 0.2s',
  },
  submitBtn: {
    padding: '16px',
    borderRadius: '8px',
    border: 'none',
    background: '#667eea',
    color: 'white',
    fontWeight: '600',
    fontSize: '16px',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'all 0.2s',
  },
  message: {
    padding: '14px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '14px',
    textAlign: 'center',
    fontWeight: '500',
  },
  infoSection: {
    paddingTop: '20px',
    borderTop: '1px solid #e2e8f0',
  },
  infoLabel: {
    fontSize: '12px',
    color: '#a0aec0',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  infoValue: {
    fontSize: '14px',
    color: '#2d3748',
    marginBottom: '15px',
    fontWeight: '500',
  },
};
