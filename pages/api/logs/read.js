// pages/api/logs/read.js
import fs from 'fs';
import path from 'path';

/**
 * API Route pour lire les logs du fichier JSON
 * 
 * GET /api/logs/read?level=ERROR&category=AUTH&limit=100
 * 
 * Query params:
 * - level: Filtrer par niveau (DEBUG, INFO, WARN, ERROR, CRITICAL)
 * - category: Filtrer par catégorie (AUTH, PROFILE, DATA, UI, API, ERROR, PERF)
 * - startTime: Timestamp ISO début (ex: 2024-02-12T00:00:00Z)
 * - endTime: Timestamp ISO fin
 * - limit: Nombre max de logs à retourner (défaut: 100)
 * 
 * Retourne: { ok: true, logs: [...], total: 1234 }
 */

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app-logs.json');

export default async function handler(req, res) {
  // Méthode autorisée
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Vérifier que le fichier existe
    if (!fs.existsSync(LOG_FILE)) {
      return res.status(200).json({ 
        ok: true, 
        logs: [], 
        total: 0,
        message: 'No logs yet',
      });
    }

    // Lire les logs
    const fileContent = fs.readFileSync(LOG_FILE, 'utf-8');
    let logs = JSON.parse(fileContent);

    // Filtres
    const { level, category, startTime, endTime, limit = 100 } = req.query;

    if (level) {
      logs = logs.filter(log => log.level === level.toUpperCase());
    }

    if (category) {
      logs = logs.filter(log => log.category === category.toUpperCase());
    }

    if (startTime) {
      const start = new Date(startTime);
      logs = logs.filter(log => new Date(log.timestamp) >= start);
    }

    if (endTime) {
      const end = new Date(endTime);
      logs = logs.filter(log => new Date(log.timestamp) <= end);
    }

    const total = logs.length;

    // Limiter le nombre de résultats
    const limitNum = parseInt(limit, 10);
    if (limitNum > 0) {
      logs = logs.slice(-limitNum); // Prendre les N derniers logs
    }

    return res.status(200).json({ 
      ok: true, 
      logs,
      total,
      returned: logs.length,
    });

  } catch (error) {
    console.error('Error reading logs:', error);
    return res.status(500).json({ 
      ok: false, 
      error: 'Failed to read logs',
      details: error.message,
    });
  }
}
