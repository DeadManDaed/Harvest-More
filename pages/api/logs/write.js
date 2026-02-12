// pages/api/logs/write.js
import fs from 'fs';
import path from 'path';

/**
 * API Route pour enregistrer les logs dans un fichier JSON
 * 
 * POST /api/logs/write
 * Body: { log: {...} }
 * 
 * Enregistre dans: logs/app-logs.json
 */

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app-logs.json');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB max

export default async function handler(req, res) {
  // Méthode autorisée
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { log } = req.body;

    if (!log) {
      return res.status(400).json({ ok: false, error: 'Missing log data' });
    }

    // Créer le dossier logs s'il n'existe pas
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    // Lire les logs existants
    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
      const fileContent = fs.readFileSync(LOG_FILE, 'utf-8');
      
      // Vérifier la taille du fichier
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        // Rotation des logs : renommer l'ancien fichier
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveFile = path.join(LOG_DIR, `app-logs-${timestamp}.json`);
        fs.renameSync(LOG_FILE, archiveFile);
        logs = [];
      } else {
        try {
          logs = JSON.parse(fileContent);
        } catch (parseError) {
          console.error('Error parsing existing logs:', parseError);
          logs = [];
        }
      }
    }

    // Ajouter le nouveau log
    logs.push(log);

    // Écrire dans le fichier
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), 'utf-8');

    return res.status(200).json({ ok: true, logged: true });

  } catch (error) {
    console.error('Error writing log:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to write log',
      details: error.message,
    });
  }
}
