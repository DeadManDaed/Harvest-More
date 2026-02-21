// components/AuthScreen.js
import { useState } from 'react';
import { getSupabaseBrowser } from '../lib/supabase';
import { AuthLog, ErrorLog, UILog } from '../lib/log';

export default function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'magic'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' }); // type: 'success' | 'error' | 'info'

  // ========================================
  // CONNEXION EMAIL/PASSWORD
  // ========================================
  const handleSignIn = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      UILog.formError('signin-form', { email: !email, password: !password });
      setMessage({ text: 'Email et mot de passe requis', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: 'Connexion...', type: 'info' });
    AuthLog.loginAttempt(email);

    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        AuthLog.loginFailure(email, error);
        ErrorLog.handled(error, { context: 'handleSignIn', email });
        setMessage({ 
          text: error.message === 'Invalid login credentials' 
            ? 'Email ou mot de passe incorrect' 
            : error.message, 
          type: 'error' 
        });
        setLoading(false);
        return;
      }

      AuthLog.loginSuccess(data.session.user.id, email, 'password');
      setMessage({ text: '✅ Connexion réussie !', type: 'success' });
      
      // Callback vers parent avec session
      if (onAuthSuccess) {
        onAuthSuccess(data.session);
      }
    } catch (err) {
      AuthLog.loginFailure(email, err);
      ErrorLog.handled(err, { context: 'handleSignIn-catch', email });
      setMessage({ text: 'Erreur réseau', type: 'error' });
      setLoading(false);
    }
  };

  // ========================================
  // INSCRIPTION EMAIL/PASSWORD
  // ========================================
  const handleSignUp = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      UILog.formError('signup-form', { email: !email, password: !password });
      setMessage({ text: 'Email et mot de passe requis', type: 'error' });
      return;
    }

    if (password.length < 6) {
      UILog.formError('signup-form', { password: 'too_short' });
      setMessage({ text: 'Mot de passe trop court (min 6 caractères)', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: 'Création du compte...', type: 'info' });
    AuthLog.signupAttempt(email);

    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // On ajoute ?next=/profil pour dire au callback où envoyer l'utilisateur
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/profil`,
        },
      });
      if (error) {
        AuthLog.signupFailure(email, error);
        ErrorLog.handled(error, { context: 'handleSignUp', email });
        setMessage({ text: error.message, type: 'error' });
        setLoading(false);
        return;
      }

      // Vérifier si confirmation email requise
   if (data.user && !data.session) {
  AuthLog.signupSuccess(data.user.id, email);
  setMessage({ 
    text: '📧 Email de confirmation envoyé. Vérifie ta boîte mail.', 
    type: 'success' 
  });
  setLoading(false);
  return;
}

AuthLog.signupSuccess(data.user.id, email);
setMessage({ text: '✅ Compte créé ! Redirection...', type: 'success' });

// FORCER RELOAD COMPLET après 1 seconde
/*setTimeout(() => {
  window.location.href = '/';
}, 1000);*/
      
      if (onAuthSuccess && data.session) {
        onAuthSuccess(data.session);
      }
    } catch (err) {
      AuthLog.signupFailure(email, err);
      ErrorLog.handled(err, { context: 'handleSignUp-catch', email });
      setMessage({ text: 'Erreur réseau', type: 'error' });
      setLoading(false);
    }
  };

  // ========================================
  // MAGIC LINK (OTP)
  // ========================================
  const handleMagicLink = async (e) => {
    e.preventDefault();
    
    if (!email) {
      UILog.formError('magic-link-form', { email: !email });
      setMessage({ text: 'Email requis', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: 'Envoi du lien magique...', type: 'info' });
    AuthLog.magicLinkRequest(email);

    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        AuthLog.loginFailure(email, error);
        ErrorLog.handled(error, { context: 'handleMagicLink', email });
        setMessage({ text: error.message, type: 'error' });
        setLoading(false);
        return;
      }

      AuthLog.magicLinkSent(email);
      setMessage({ 
        text: '📧 Lien magique envoyé ! Vérifie ta boîte mail.', 
        type: 'success' 
      });
      setLoading(false);
    } catch (err) {
      AuthLog.loginFailure(email, err);
      ErrorLog.handled(err, { context: 'handleMagicLink-catch', email });
      setMessage({ text: 'Erreur réseau', type: 'error' });
      setLoading(false);
    }
  };

  // ========================================
  // RENDER
  // ========================================
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>🍃</div>
        <h1 style={styles.title}>CAFCOOP</h1>
        <p style={styles.subtitle}>Coopérative Agricole</p>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={mode === 'signin' ? styles.tabActive : styles.tab}
            onClick={() => setMode('signin')}
            disabled={loading}
          >
            Connexion
          </button>
          <button
            style={mode === 'signup' ? styles.tabActive : styles.tab}
            onClick={() => setMode('signup')}
            disabled={loading}
          >
            Inscription
          </button>
          <button
            style={mode === 'magic' ? styles.tabActive : styles.tab}
            onClick={() => setMode('magic')}
            disabled={loading}
          >
            Magic Link
          </button>
        </div>

        {/* Message feedback */}
        {message.text && (
          <div style={{
            ...styles.message,
            backgroundColor: 
              message.type === 'error' ? '#fee' : 
              message.type === 'success' ? '#efe' : 
              '#eef',
            color: 
              message.type === 'error' ? '#c33' : 
              message.type === 'success' ? '#2a2' : 
              '#337',
          }}>
            {message.text}
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={
          mode === 'signin' ? handleSignIn : 
          mode === 'signup' ? handleSignUp : 
          handleMagicLink
        }>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            disabled={loading}
            required
          />

          {(mode === 'signin' || mode === 'signup') && (
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              disabled={loading}
              required
            />
          )}

          <button
            type="submit"
            style={styles.button}
            disabled={loading}
          >
            {loading ? '⏳ Chargement...' : 
             mode === 'signin' ? '🔐 Se connecter' :
             mode === 'signup' ? '✨ Créer un compte' :
             '📧 Envoyer le lien'}
          </button>
        </form>

        <p style={styles.footer}>
          Besoin d'aide ? Contacte l'administrateur
        </p>
      </div>
    </div>
  );
}

// ========================================
// STYLES
// ========================================
const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px 30px',
    maxWidth: '420px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  logo: {
    fontSize: '48px',
    textAlign: 'center',
    marginBottom: '10px',
  },
  title: {
    textAlign: 'center',
    fontSize: '28px',
    fontWeight: '700',
    color: '#2d3748',
    margin: '0 0 5px 0',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#718096',
    marginBottom: '30px',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
  },
  tab: {
    flex: 1,
    padding: '10px',
    border: '1px solid #e2e8f0',
    background: 'white',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    flex: 1,
    padding: '10px',
    border: '1px solid #667eea',
    background: '#667eea',
    color: 'white',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  message: {
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '15px',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    padding: '14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '15px',
    marginBottom: '12px',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '14px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  footer: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#a0aec0',
    marginTop: '20px',
  },
};
