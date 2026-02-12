import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getSupabaseBrowser } from '../lib/supabase';
import { ProfileLog, UILog } from '../lib/log';
import Head from 'next/head';

export default function Profil() {
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  
  // État du formulaire
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    telephone: '',
  });

  // Initialiser le formulaire avec les données existantes
  useEffect(() => {
    if (profile) {
      setFormData({
        nom: profile.nom || '',
        prenom: profile.prenom || '',
        telephone: profile.telephone || '',
      });
    }
  }, [profile]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

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

      if (error) throw error;

      ProfileLog.updateSuccess(user.id);
      setMessage({ text: 'Profil mis à jour avec succès !', type: 'success' });
      await refreshProfile(); // Rafraîchit les données globales
    } catch (err) {
      ProfileLog.updateFailure(user.id, err);
      setMessage({ text: 'Erreur lors de la mise à jour.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) return <div style={styles.container}>Chargement...</div>;

  return (
    <div style={styles.container}>
      <Head>
        <title>Mon Profil - CAFCOOP</title>
      </Head>

      <header style={styles.header}>
        <button onClick={() => window.location.href='/'} style={styles.backBtn}>←</button>
        <h1 style={styles.title}>Mon Profil</h1>
      </header>

      <div style={styles.card}>
        <div style={styles.avatarSection}>
          <div style={styles.avatar}>
            {formData.prenom ? formData.prenom[0] : '👤'}
          </div>
          <p style={styles.emailText}>{user?.email}</p>
          <span style={styles.badge}>{profile?.role}</span>
        </div>

        {message.text && (
          <div style={{...styles.message, backgroundColor: message.type === 'success' ? '#c6f6d5' : '#fed7d7'}}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleUpdate} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Prénom</label>
            <input 
              style={styles.input}
              value={formData.prenom}
              onChange={(e) => setFormData({...formData, prenom: e.target.value})}
              placeholder="Ex: Jean"
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Nom</label>
            <input 
              style={styles.input}
              value={formData.nom}
              onChange={(e) => setFormData({...formData, nom: e.target.value})}
              placeholder="Ex: Dupont"
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
            />
          </div>

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: { padding: '20px', maxWidth: '500px', margin: '0 auto', fontFamily: 'sans-serif', backgroundColor: '#f7fafc', minHeight: '100vh' },
  header: { display: 'flex', alignItems: 'center', marginBottom: '20px', gap: '15px' },
  backBtn: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' },
  title: { fontSize: '20px', fontWeight: '700', margin: 0 },
  card: { background: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' },
  avatarSection: { textAlign: 'center', marginBottom: '25px' },
  avatar: { width: '80px', height: '80px', borderRadius: '50%', background: '#667eea', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px', margin: '0 auto 10px' },
  emailText: { color: '#718096', fontSize: '14px', margin: '5px 0' },
  badge: { background: '#ebf4ff', color: '#4299e1', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' },
  form: { display: 'flex', flexDirection: 'column', gap: '15px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '14px', fontWeight: '600', color: '#4a5568' },
  input: { padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '16px' },
  submitBtn: { padding: '15px', borderRadius: '8px', border: 'none', background: '#667eea', color: 'white', fontWeight: '600', fontSize: '16px', cursor: 'pointer', marginTop: '10px' },
  message: { padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '14px', textAlign: 'center' }
};
