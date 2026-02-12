// components/LogViewer.js
import { useState, useEffect } from 'react';

/**
 * Composant pour visualiser les logs de l'application
 * 
 * Usage:
 * import LogViewer from '../components/LogViewer';
 * <LogViewer />
 */
export default function LogViewer() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({
    level: '',
    category: '',
    limit: 100,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Charger les logs
  const fetchLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.level) params.append('level', filters.level);
      if (filters.category) params.append('category', filters.category);
      if (filters.limit) params.append('limit', filters.limit.toString());

      const response = await fetch(`/api/logs/read?${params.toString()}`);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Échec chargement logs');
      }

      setLogs(data.logs || []);
    } catch (err) {
      console.error('fetchLogs error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Charger au montage
  useEffect(() => {
    fetchLogs();
  }, []);

  // Couleurs par niveau
  const getLevelColor = (level) => {
    switch (level) {
      case 'DEBUG': return '#718096';
      case 'INFO': return '#4299e1';
      case 'WARN': return '#ed8936';
      case 'ERROR': return '#f56565';
      case 'CRITICAL': return '#c53030';
      default: return '#2d3748';
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📋 Logs de l'application</h2>
        <button style={styles.refreshButton} onClick={fetchLogs}>
          🔄 Rafraîchir
        </button>
      </div>

      {/* Filtres */}
      <div style={styles.filters}>
        <select 
          value={filters.level} 
          onChange={(e) => setFilters({ ...filters, level: e.target.value })}
          style={styles.select}
        >
          <option value="">Tous les niveaux</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>

        <select 
          value={filters.category} 
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          style={styles.select}
        >
          <option value="">Toutes les catégories</option>
          <option value="AUTH">AUTH</option>
          <option value="PROFILE">PROFILE</option>
          <option value="DATA">DATA</option>
          <option value="UI">UI</option>
          <option value="API">API</option>
          <option value="ERROR">ERROR</option>
          <option value="PERF">PERF</option>
        </select>

        <input
          type="number"
          placeholder="Limite"
          value={filters.limit}
          onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) || 100 })}
          style={styles.input}
          min="1"
          max="1000"
        />

        <button style={styles.applyButton} onClick={fetchLogs}>
          Appliquer filtres
        </button>
      </div>

      {/* État de chargement */}
      {loading && <div style={styles.loading}>Chargement...</div>}

      {/* Erreur */}
      {error && <div style={styles.error}>❌ {error}</div>}

      {/* Liste des logs */}
      {!loading && !error && (
        <div style={styles.logsList}>
          <div style={styles.statsBar}>
            {logs.length} log(s) affichés
          </div>

          {logs.length === 0 && (
            <div style={styles.emptyState}>Aucun log à afficher</div>
          )}

          {logs.map((log, index) => (
            <div key={log.id || index} style={styles.logEntry}>
              <div style={styles.logHeader}>
                <span 
                  style={{
                    ...styles.logLevel,
                    backgroundColor: getLevelColor(log.level),
                  }}
                >
                  {log.level}
                </span>
                <span style={styles.logCategory}>{log.category}</span>
                <span style={styles.logTimestamp}>
                  {new Date(log.timestamp).toLocaleString('fr-FR')}
                </span>
              </div>

              <div style={styles.logMessage}>{log.message}</div>

              {log.data && Object.keys(log.data).length > 0 && (
                <details style={styles.logDetails}>
                  <summary style={styles.logDetailsSummary}>Détails</summary>
                  <pre style={styles.logData}>
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </details>
              )}

              {log.caller && (
                <div style={styles.logCaller}>
                  📍 {log.caller.function} ({log.caller.file}:{log.caller.line})
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ========================================
// STYLES
// ========================================
const styles = {
  container: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '24px',
    color: '#2d3748',
    margin: 0,
  },
  refreshButton: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  filters: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  select: {
    padding: '10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
  },
  input: {
    padding: '10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100px',
  },
  applyButton: {
    padding: '10px 20px',
    background: '#48bb78',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#718096',
  },
  error: {
    padding: '15px',
    background: '#fff5f5',
    border: '1px solid #feb2b2',
    borderRadius: '6px',
    color: '#c53030',
  },
  logsList: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  statsBar: {
    padding: '12px 15px',
    background: '#f7fafc',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '14px',
    color: '#718096',
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center',
    color: '#a0aec0',
  },
  logEntry: {
    padding: '15px',
    borderBottom: '1px solid #e2e8f0',
  },
  logHeader: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    marginBottom: '8px',
  },
  logLevel: {
    padding: '4px 10px',
    borderRadius: '4px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
  },
  logCategory: {
    padding: '4px 10px',
    background: '#edf2f7',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#4a5568',
  },
  logTimestamp: {
    fontSize: '12px',
    color: '#a0aec0',
    marginLeft: 'auto',
  },
  logMessage: {
    fontSize: '14px',
    color: '#2d3748',
    marginBottom: '8px',
  },
  logDetails: {
    marginTop: '8px',
  },
  logDetailsSummary: {
    cursor: 'pointer',
    fontSize: '13px',
    color: '#4299e1',
    userSelect: 'none',
  },
  logData: {
    marginTop: '8px',
    padding: '10px',
    background: '#f7fafc',
    borderRadius: '4px',
    fontSize: '12px',
    overflow: 'auto',
    maxHeight: '200px',
  },
  logCaller: {
    fontSize: '11px',
    color: '#a0aec0',
    marginTop: '5px',
  },
};
