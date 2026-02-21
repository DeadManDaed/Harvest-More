// pages/debug-auth.js
import { useAuth } from '../hooks/useAuth-with-edge-function;
import { getSupabaseBrowser } from '../lib/supabase';
import { useState, useEffect } from 'react';

export default function DebugAuth() {
  const authState = useAuth();
  const [manualCheck, setManualCheck] = useState(null);
  const [envCheck, setEnvCheck] = useState(null);

  useEffect(() => {
    async function checkManually() {
      try {
        const supabase = getSupabaseBrowser();
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        setManualCheck({
          session: session ? {
            user: {
              id: session.user.id,
              email: session.user.email,
            },
            expires_at: session.expires_at,
          } : null,
          sessionError,
        });

        if (session) {
          const { data: profile, error: profileError } = await supabase
            .from('utilisateurs')
            .select('*')
            .eq('id_auth', session.user.id)
            .maybeSingle();

          setManualCheck(prev => ({
            ...prev,
            profile,
            profileError,
          }));
        }
      } catch (err) {
        setManualCheck({ error: err.message });
      }
    }

    checkManually();
  }, []);

  useEffect(() => {
    setEnvCheck({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing',
    });
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '800px', margin: '0 auto' }}>
      <h1>🔍 Debug Auth State</h1>
      
      <section style={sectionStyle}>
        <h2>⚙️ Environment Variables</h2>
        <pre style={preStyle}>
          {JSON.stringify(envCheck, null, 2)}
        </pre>
      </section>

      <section style={sectionStyle}>
        <h2>🪝 useAuth Hook State</h2>
        <pre style={preStyle}>
          {JSON.stringify({
            loading: authState.loading,
            error: authState.error,
            session: authState.session ? {
              user: {
                id: authState.session.user.id,
                email: authState.session.user.email,
              },
              expires_at: authState.session.expires_at,
            } : null,
            user: authState.user ? {
              id: authState.user.id,
              email: authState.user.email,
            } : null,
            profile: authState.profile ? {
              id_utilisateur: authState.profile.id_utilisateur,
              id_auth: authState.profile.id_auth,
              nom: authState.profile.nom,
              prenom: authState.profile.prenom,
              email: authState.profile.email,
              role: authState.profile.role,
            } : null,
          }, null, 2)}
        </pre>
      </section>

      <section style={sectionStyle}>
        <h2>🔬 Manual Supabase Check</h2>
        <pre style={preStyle}>
          {JSON.stringify(manualCheck, null, 2)}
        </pre>
      </section>

      <section style={sectionStyle}>
        <h2>📊 Diagnosis</h2>
        <ul style={{ lineHeight: '1.8' }}>
          <li>
            <strong>Auth Loading:</strong>{' '}
            <span style={{ color: authState.loading ? 'orange' : 'green' }}>
              {authState.loading ? '⏳ TRUE (stuck?)' : '✅ FALSE'}
            </span>
          </li>
          <li>
            <strong>Has Session:</strong>{' '}
            <span style={{ color: authState.session ? 'green' : 'red' }}>
              {authState.session ? '✅ YES' : '❌ NO'}
            </span>
          </li>
          <li>
            <strong>Has User:</strong>{' '}
            <span style={{ color: authState.user ? 'green' : 'red' }}>
              {authState.user ? '✅ YES' : '❌ NO'}
            </span>
          </li>
          <li>
            <strong>Has Profile:</strong>{' '}
            <span style={{ color: authState.profile ? 'green' : 'red' }}>
              {authState.profile ? '✅ YES' : '❌ NO'}
            </span>
          </li>
          <li>
            <strong>Has Error:</strong>{' '}
            <span style={{ color: authState.error ? 'red' : 'green' }}>
              {authState.error ? `❌ ${authState.error}` : '✅ NO'}
            </span>
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>🎯 Recommended Actions</h2>
        {authState.loading && (
          <div style={{ background: '#fff3cd', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
            <strong>⚠️ Auth is stuck in loading state</strong>
            <p>Possible causes:</p>
            <ul>
              <li>loadProfile() is hanging</li>
              <li>API call to /api/auth/link-profile is failing</li>
              <li>Network timeout to Supabase</li>
            </ul>
          </div>
        )}
        
        {!authState.session && !authState.loading && (
          <div style={{ background: '#f8d7da', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
            <strong>❌ No session found</strong>
            <p>User needs to login</p>
          </div>
        )}

        {authState.session && !authState.profile && !authState.loading && (
          <div style={{ background: '#fff3cd', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
            <strong>⚠️ Session exists but no profile</strong>
            <p>Check if /api/auth/link-profile is working</p>
          </div>
        )}

        {authState.session && authState.profile && !authState.loading && (
          <div style={{ background: '#d4edda', padding: '15px', borderRadius: '8px' }}>
            <strong>✅ Everything looks good!</strong>
          </div>
        )}
      </section>

      <div style={{ marginTop: '30px', display: 'flex', gap: '10px' }}>
        <button 
          onClick={() => window.location.href = '/'}
          style={buttonStyle}
        >
          🏠 Home
        </button>
        <button 
          onClick={() => window.location.reload()}
          style={buttonStyle}
        >
          🔄 Reload
        </button>
        <button 
          onClick={async () => {
            const supabase = getSupabaseBrowser();
            await supabase.auth.signOut();
            window.location.reload();
          }}
          style={{ ...buttonStyle, background: '#dc3545' }}
        >
          🚪 Logout
        </button>
      </div>
    </div>
  );
}

const sectionStyle = {
  marginTop: '30px',
  padding: '20px',
  background: '#f8f9fa',
  borderRadius: '8px',
  border: '1px solid #dee2e6',
};

const preStyle = {
  background: '#fff',
  padding: '15px',
  borderRadius: '6px',
  overflow: 'auto',
  fontSize: '13px',
  border: '1px solid #dee2e6',
};

const buttonStyle = {
  padding: '12px 24px',
  background: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: '600',
};
