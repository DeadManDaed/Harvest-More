// pages/index.js
import React, { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import AuthScreen from '../components/AuthScreen';
import Head from 'next/head';
import { UILog, AuthLog } from '../lib/log';

export default function Home() {
  const { session, user, profile, loading, error, refreshProfile } = useAuth();

  // Log page view
  useEffect(() => {
    if (!loading && user) {
      UILog.pageView('home', user.id);
    }
  }, [loading, user]);

  // ========================================
  // LOADING STATE
  // ========================================
  if (loading) {
    return (
      <>
        <Head>
          <title>CAFCOOP - Chargement...</title>
        </Head>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}>⏳</div>
          <p style={styles.loadingText}>Chargement...</p>
        </div>
      </>
    );
  }

  // ========================================
  // NOT AUTHENTICATED
  // ========================================
  if (!session || !user) {
    return (
      <>
        <Head>
          <title>CAFCOOP - Connexion</title>
        </Head>
        <AuthScreen onAuthSuccess={(newSession) => {
          UILog.pageView('auth-success', newSession.user.id);
          // Le hook useAuth détectera automatiquement le changement via onAuthStateChange
        }} />
      </>
    );
  }

  // ========================================
  // ERROR STATE
  // ========================================
  if (error) {
    return (
      <>
        <Head>
          <title>CAFCOOP - Erreur</title>
        </Head>
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠️</div>
          <h2 style={styles.errorTitle}>Erreur</h2>
          <p style={styles.errorText}>{error}</p>
          <button 
            style={styles.retryButton} 
            onClick={() => {
              UILog.buttonClick('retry-profile', { userId: user?.id });
              refreshProfile();
            }}
          >
            🔄 Réessayer
          </button>
        </div>
      </>
    );
  }

  // ========================================
  // AUTHENTICATED - Main App
  // ========================================
  return (
    <>
      <Head>
        <title>CAFCOOP - Accueil</title>
      </Head>
      <div style={styles.appContainer}>
        <header style={styles.header}>
          <div style={styles.logo}>🍃</div>
          <h1 style={styles.appTitle}>CAFCOOP</h1>
          <button 
            style={styles.logoutButton}
            onClick={async () => {
              UILog.buttonClick('logout', { userId: user.id });
              AuthLog.logout(user.id);
              const { signOut } = await import('../lib/supabase');
              await signOut();
            }}
          >
            Déconnexion
          </button>
        </header>

        <main style={styles.main}>
          <div style={styles.welcomeCard}>
            <h2 style={styles.welcomeTitle}>
              Bienvenue {profile?.nom || profile?.prenom || user.email} !
            </h2>
            
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <strong>Email:</strong> {user.email}
              </div>
              <div style={styles.infoItem}>
                <strong>Rôle:</strong> {profile?.role || 'agriculteur'}
              </div>
              <div style={styles.infoItem}>
                <strong>Statut:</strong> {profile?.statut || 'actif'}
              </div>
              <div style={styles.infoItem}>
                <strong>ID Auth:</strong> {user.id.slice(0, 8)}...
              </div>
              <div style={styles.infoItem}>
                <strong>ID Profil:</strong> {profile?.id_utilisateur || 'N/A'}
              </div>
            </div>

            {(!profile?.nom || !profile?.prenom) && (
              <div style={styles.warningBox}>
                ⚠️ <strong>Profil incomplet</strong> - Complétez vos informations dans la section Profil
              </div>
            )}
          </div>

          {/* Placeholders pour les sections de l'app */}
          <div style={styles.sectionsGrid}>
            <div style={styles.sectionCard}>
              <div style={styles.sectionIcon}>🛒</div>
              <h3 style={styles.sectionTitle}>Boutique</h3>
              <p style={styles.sectionDesc}>Acheter des produits agricoles</p>
            </div>

            <div style={styles.sectionCard}>
              <div style={styles.sectionIcon}>🩺</div>
              <h3 style={styles.sectionTitle}>Diagnostic</h3>
              <p style={styles.sectionDesc}>Signaler un problème de culture</p>
            </div>

            <div style={styles.sectionCard}>
              <div style={styles.sectionIcon}>📦</div>
              <h3 style={styles.sectionTitle}>Commandes</h3>
              <p style={styles.sectionDesc}>Suivre vos commandes</p>
            </div>

            <div 
              style={styles.sectionCard}
              onClick={() => {
                UILog.buttonClick('section-profil', { userId: user.id });
                window.location.href = '/profil';
              }}
            >
              <div style={styles.sectionIcon}>👤</div>
              <h3 style={styles.sectionTitle}>Profil</h3>
              <p style={styles.sectionDesc}>Gérer votre compte</p>
            </div>
          </div>
        </main>

        <footer style={styles.footer}>
          <p style={styles.footerText}>
            © 2024 CAFCOOP - Coopérative Agricole
          </p>
        </footer>
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
  },
  retryButton: {
    marginTop: '20px',
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    cursor: 'pointer',
  },

  // App
  appContainer: {
    minHeight: '100vh',
    background: '#f7fafc',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontSize: '32px',
  },
  appTitle: {
    fontSize: '24px',
    fontWeight: '700',
    flex: 1,
    marginLeft: '15px',
  },
  logoutButton: {
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '8px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
  },
  main: {
    flex: 1,
    padding: '30px 20px',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
  },
  welcomeCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '30px',
    marginBottom: '30px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  welcomeTitle: {
    fontSize: '28px',
    color: '#2d3748',
    marginBottom: '20px',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '15px',
  },
  infoItem: {
    padding: '12px',
    background: '#f7fafc',
    borderRadius: '8px',
    fontSize: '14px',
  },
  warningBox: {
    marginTop: '20px',
    padding: '15px',
    background: '#fffaf0',
    border: '1px solid #fbd38d',
    borderRadius: '8px',
    color: '#7c2d12',
  },
  sectionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  sectionCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '30px',
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },
  sectionIcon: {
    fontSize: '48px',
    marginBottom: '15px',
  },
  sectionTitle: {
    fontSize: '20px',
    color: '#2d3748',
    marginBottom: '10px',
  },
  sectionDesc: {
    fontSize: '14px',
    color: '#718096',
  },
  footer: {
    padding: '20px',
    textAlign: 'center',
    background: 'white',
    borderTop: '1px solid #e2e8f0',
  },
  footerText: {
    color: '#718096',
    fontSize: '14px',
  },
};
