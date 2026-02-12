// lib/log.js
/**
 * CAFCOOP Logging System
 * 
 * Module centralisé pour la journalisation de toutes les opérations de l'application.
 * Enregistre les logs en console ET dans un fichier JSON côté serveur.
 * 
 * Niveaux de log:
 * - DEBUG: Informations de développement détaillées
 * - INFO: Événements normaux de l'application
 * - WARN: Situations anormales mais gérables
 * - ERROR: Erreurs nécessitant attention
 * - CRITICAL: Erreurs critiques bloquantes
 */

// ========================================
// CONFIGURATION
// ========================================
const LOG_CONFIG = {
  enableConsole: true,
  enableFile: typeof window === 'undefined', // Seulement côté serveur
  levels: {
    DEBUG: { priority: 0, color: '#718096', emoji: '🔍' },
    INFO: { priority: 1, color: '#4299e1', emoji: 'ℹ️' },
    WARN: { priority: 2, color: '#ed8936', emoji: '⚠️' },
    ERROR: { priority: 3, color: '#f56565', emoji: '❌' },
    CRITICAL: { priority: 4, color: '#c53030', emoji: '🔥' },
  },
  minLevel: 'DEBUG', // Niveau minimum à logger
};

// ========================================
// UTILITAIRES
// ========================================

/**
 * Formatte un timestamp ISO en format lisible
 */
function formatTimestamp(date = new Date()) {
  return date.toISOString();
}

/**
 * Génère un ID unique pour chaque log
 */
function generateLogId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sérialise un objet en retirant les références circulaires
 */
function safeStringify(obj, indent = 2) {
  const cache = new Set();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          return '[Circular]';
        }
        cache.add(value);
      }
      return value;
    },
    indent
  );
}

/**
 * Extrait les infos de la stack trace
 */
function getCallerInfo() {
  try {
    const stack = new Error().stack;
    const lines = stack.split('\n');
    // Ligne 3 = appelant (0: Error, 1: getCallerInfo, 2: log function, 3: caller)
    const callerLine = lines[3] || '';
    const match = callerLine.match(/at (.+?) \((.+?):(\d+):(\d+)\)/);
    if (match) {
      return {
        function: match[1],
        file: match[2].split('/').pop(),
        line: parseInt(match[3]),
        column: parseInt(match[4]),
      };
    }
  } catch (e) {
    // Ignore errors in stack parsing
  }
  return { function: 'unknown', file: 'unknown', line: 0, column: 0 };
}

// ========================================
// GESTIONNAIRE DE LOGS
// ========================================

class Logger {
  constructor() {
    this.logs = [];
    this.sessionId = generateLogId();
    this.context = {};
  }

  /**
   * Définit un contexte global (user, session, etc.)
   */
  setContext(ctx) {
    this.context = { ...this.context, ...ctx };
  }

  /**
   * Enregistre un log
   */
  log(level, category, message, data = {}) {
    const levelConfig = LOG_CONFIG.levels[level];
    const minLevelPriority = LOG_CONFIG.levels[LOG_CONFIG.minLevel].priority;

    // Filtrer par niveau minimum
    if (levelConfig.priority < minLevelPriority) {
      return;
    }

    const caller = getCallerInfo();

    const logEntry = {
      id: generateLogId(),
      timestamp: formatTimestamp(),
      sessionId: this.sessionId,
      level,
      category,
      message,
      data,
      caller,
      context: this.context,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      url: typeof window !== 'undefined' ? window.location.href : 'server',
    };

    // Stocker en mémoire (limité à 1000 derniers logs)
    this.logs.push(logEntry);
    if (this.logs.length > 1000) {
      this.logs.shift();
    }

    // Log console
    if (LOG_CONFIG.enableConsole) {
      this._logToConsole(logEntry, levelConfig);
    }

    // Log fichier (côté serveur uniquement)
    if (LOG_CONFIG.enableFile) {
      this._logToFile(logEntry);
    }

    return logEntry;
  }

  /**
   * Affiche dans la console du navigateur
   */
  _logToConsole(entry, levelConfig) {
    const { emoji } = levelConfig;
    const prefix = `${emoji} [${entry.level}] [${entry.category}]`;
    const details = entry.data && Object.keys(entry.data).length > 0 
      ? entry.data 
      : '';

    switch (entry.level) {
      case 'DEBUG':
        console.debug(prefix, entry.message, details);
        break;
      case 'INFO':
        console.info(prefix, entry.message, details);
        break;
      case 'WARN':
        console.warn(prefix, entry.message, details);
        break;
      case 'ERROR':
      case 'CRITICAL':
        console.error(prefix, entry.message, details);
        if (entry.data?.error?.stack) {
          console.error('Stack trace:', entry.data.error.stack);
        }
        break;
      default:
        console.log(prefix, entry.message, details);
    }
  }

  /**
   * Enregistre dans un fichier JSON (côté serveur)
   */
  async _logToFile(entry) {
    try {
      // Appel à une API route pour écrire le log
      await fetch('/api/logs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: safeStringify({ log: entry }),
      }).catch(() => {
        // Ignore les erreurs d'écriture de log pour éviter la récursion
      });
    } catch (e) {
      // Silently fail
    }
  }

  /**
   * Récupère tous les logs en mémoire
   */
  getLogs(filters = {}) {
    let filtered = [...this.logs];

    if (filters.level) {
      filtered = filtered.filter(log => log.level === filters.level);
    }

    if (filters.category) {
      filtered = filtered.filter(log => log.category === filters.category);
    }

    if (filters.startTime) {
      filtered = filtered.filter(log => new Date(log.timestamp) >= new Date(filters.startTime));
    }

    if (filters.endTime) {
      filtered = filtered.filter(log => new Date(log.timestamp) <= new Date(filters.endTime));
    }

    return filtered;
  }

  /**
   * Exporte les logs en JSON
   */
  exportLogs() {
    return safeStringify(this.logs);
  }

  /**
   * Vide les logs en mémoire
   */
  clearLogs() {
    this.logs = [];
  }
}

// ========================================
// INSTANCE SINGLETON
// ========================================
const logger = new Logger();

// ========================================
// FONCTIONS PUBLIQUES PAR CATÉGORIE
// ========================================

/**
 * AUTH LOGGING
 */
export const AuthLog = {
  sessionStart: (userId, email) =>
    logger.log('INFO', 'AUTH', 'Session started', { userId, email }),

  loginAttempt: (email) =>
    logger.log('INFO', 'AUTH', 'Login attempt', { email }),

  loginSuccess: (userId, email, method) =>
    logger.log('INFO', 'AUTH', 'Login successful', { userId, email, method }),

  loginFailure: (email, error) =>
    logger.log('ERROR', 'AUTH', 'Login failed', { email, error: error.message }),

  signupAttempt: (email) =>
    logger.log('INFO', 'AUTH', 'Signup attempt', { email }),

  signupSuccess: (userId, email) =>
    logger.log('INFO', 'AUTH', 'Signup successful', { userId, email }),

  signupFailure: (email, error) =>
    logger.log('ERROR', 'AUTH', 'Signup failed', { email, error: error.message }),

  magicLinkRequest: (email) =>
    logger.log('INFO', 'AUTH', 'Magic link requested', { email }),

  magicLinkSent: (email) =>
    logger.log('INFO', 'AUTH', 'Magic link sent', { email }),

  logout: (userId) =>
    logger.log('INFO', 'AUTH', 'User logged out', { userId }),

  sessionExpired: (userId) =>
    logger.log('WARN', 'AUTH', 'Session expired', { userId }),

  authStateChange: (event, userId) =>
    logger.log('DEBUG', 'AUTH', `Auth state changed: ${event}`, { event, userId }),
};

/**
 * PROFILE LOGGING
 */
export const ProfileLog = {
  loadAttempt: (userId) =>
    logger.log('DEBUG', 'PROFILE', 'Loading profile', { userId }),

  loadSuccess: (userId, profileId, role) =>
    logger.log('INFO', 'PROFILE', 'Profile loaded', { userId, profileId, role }),

  loadFailure: (userId, error) =>
    logger.log('ERROR', 'PROFILE', 'Profile load failed', { userId, error: error.message }),

  createAttempt: (userId, email) =>
    logger.log('INFO', 'PROFILE', 'Creating profile', { userId, email }),

  createSuccess: (userId, profileId) =>
    logger.log('INFO', 'PROFILE', 'Profile created', { userId, profileId }),

  createFailure: (userId, error) =>
    logger.log('ERROR', 'PROFILE', 'Profile creation failed', { userId, error: error.message }),

  updateAttempt: (profileId, fields) =>
    logger.log('INFO', 'PROFILE', 'Updating profile', { profileId, fields: Object.keys(fields) }),

  updateSuccess: (profileId) =>
    logger.log('INFO', 'PROFILE', 'Profile updated', { profileId }),

  updateFailure: (profileId, error) =>
    logger.log('ERROR', 'PROFILE', 'Profile update failed', { profileId, error: error.message }),

  profileIncomplete: (profileId, missingFields) =>
    logger.log('WARN', 'PROFILE', 'Profile incomplete', { profileId, missingFields }),
};

/**
 * DATA LOADING LOGGING
 */
export const DataLog = {
  fetchStart: (resource, params) =>
    logger.log('DEBUG', 'DATA', `Fetching ${resource}`, { resource, params }),

  fetchSuccess: (resource, count) =>
    logger.log('INFO', 'DATA', `Fetched ${resource}`, { resource, count }),

  fetchFailure: (resource, error) =>
    logger.log('ERROR', 'DATA', `Failed to fetch ${resource}`, { resource, error: error.message }),

  cacheHit: (resource) =>
    logger.log('DEBUG', 'DATA', `Cache hit: ${resource}`, { resource }),

  cacheMiss: (resource) =>
    logger.log('DEBUG', 'DATA', `Cache miss: ${resource}`, { resource }),
};

/**
 * UI LOGGING
 */
export const UILog = {
  pageView: (page, userId) =>
    logger.log('INFO', 'UI', `Page viewed: ${page}`, { page, userId }),

  tabChange: (from, to, userId) =>
    logger.log('DEBUG', 'UI', `Tab changed: ${from} → ${to}`, { from, to, userId }),

  buttonClick: (buttonId, context) =>
    logger.log('DEBUG', 'UI', `Button clicked: ${buttonId}`, { buttonId, context }),

  modalOpen: (modalId) =>
    logger.log('DEBUG', 'UI', `Modal opened: ${modalId}`, { modalId }),

  modalClose: (modalId) =>
    logger.log('DEBUG', 'UI', `Modal closed: ${modalId}`, { modalId }),

  notificationShow: (message, type) =>
    logger.log('DEBUG', 'UI', `Notification: ${message}`, { message, type }),

  formSubmit: (formId, data) =>
    logger.log('INFO', 'UI', `Form submitted: ${formId}`, { formId, fields: Object.keys(data) }),

  formError: (formId, errors) =>
    logger.log('WARN', 'UI', `Form validation failed: ${formId}`, { formId, errors }),
};

/**
 * API LOGGING
 */
export const APILog = {
  requestStart: (endpoint, method, body) =>
    logger.log('DEBUG', 'API', `${method} ${endpoint}`, { endpoint, method, body }),

  requestSuccess: (endpoint, method, status, duration) =>
    logger.log('INFO', 'API', `${method} ${endpoint} → ${status}`, { endpoint, method, status, duration }),

  requestFailure: (endpoint, method, status, error) =>
    logger.log('ERROR', 'API', `${method} ${endpoint} failed`, { endpoint, method, status, error: error.message }),

  rateLimitHit: (endpoint) =>
    logger.log('WARN', 'API', `Rate limit hit: ${endpoint}`, { endpoint }),
};

/**
 * ERROR LOGGING
 */
export const ErrorLog = {
  handled: (error, context) =>
    logger.log('ERROR', 'ERROR', error.message || 'Handled error', { 
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      context,
    }),

  unhandled: (error, context) =>
    logger.log('CRITICAL', 'ERROR', error.message || 'Unhandled error', {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      context,
    }),

  network: (url, error) =>
    logger.log('ERROR', 'ERROR', `Network error: ${url}`, { url, error: error.message }),
};

/**
 * PERFORMANCE LOGGING
 */
export const PerfLog = {
  measureStart: (label) => {
    const startTime = performance.now();
    return {
      label,
      startTime,
      end: () => {
        const duration = performance.now() - startTime;
        logger.log('DEBUG', 'PERF', `${label} completed`, { label, duration: `${duration.toFixed(2)}ms` });
        return duration;
      },
    };
  },

  slowOperation: (operation, duration, threshold = 1000) => {
    if (duration > threshold) {
      logger.log('WARN', 'PERF', `Slow operation: ${operation}`, { operation, duration: `${duration}ms`, threshold: `${threshold}ms` });
    }
  },
};

// ========================================
// EXPORT LOGGER INSTANCE
// ========================================
export { logger };

// ========================================
// GLOBAL ERROR HANDLERS
// ========================================
if (typeof window !== 'undefined') {
  // Capture des erreurs non gérées
  window.addEventListener('error', (event) => {
    ErrorLog.unhandled(event.error || new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  // Capture des promesses rejetées
  window.addEventListener('unhandledrejection', (event) => {
    ErrorLog.unhandled(event.reason || new Error('Unhandled promise rejection'), {
      promise: 'Promise rejection',
    });
  });
}
