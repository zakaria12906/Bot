/**
 * Logger.js — Module de logging et monitoring
 * Journal d'activité, statistiques, alertes.
 */

/**
 * Enregistre un événement dans le log.
 * @param {string} type - Type d'événement (SCAN, SENT, ERROR, etc.)
 * @param {string} message - Description
 */
function logEvent(type, message) {
  var timestamp = new Date().toISOString();
  var logEntry = {
    timestamp: timestamp,
    type: type,
    message: message
  };

  // Log dans la console Apps Script
  console.log('[' + type + '] ' + message);

  // Stocker dans les propriétés (journal rotatif)
  appendToLog_(logEntry);
}

/**
 * Récupère les statistiques du jour.
 * @returns {Object} Stats
 */
function getTodayStats() {
  var today = new Date().toISOString().split('T')[0];
  var statsKey = 'stats_' + today;
  var raw = PropertiesService.getScriptProperties().getProperty(statsKey);

  if (raw) {
    return JSON.parse(raw);
  }

  return {
    date: today,
    processed: 0,
    approved: 0,
    drafted: 0,
    ignored: 0,
    errors: 0,
    campaignsSent: 0
  };
}

/**
 * Incrémente un compteur dans les stats du jour.
 * @param {string} field - Nom du champ (processed, approved, etc.)
 * @param {number} [amount] - Quantité (défaut: 1)
 */
function incrementStat(field, amount) {
  var stats = getTodayStats();
  stats[field] = (stats[field] || 0) + (amount || 1);

  var today = new Date().toISOString().split('T')[0];
  PropertiesService.getScriptProperties().setProperty(
    'stats_' + today,
    JSON.stringify(stats)
  );
}

/**
 * Récupère les logs récents.
 * @param {number} [limit] - Nombre d'entrées (défaut: 50)
 * @returns {Object[]} Entrées de log
 */
function getRecentLogs(limit) {
  limit = limit || 50;
  var raw = PropertiesService.getScriptProperties().getProperty('activity_log');
  if (!raw) return [];

  var logs = JSON.parse(raw);
  return logs.slice(-limit);
}

/**
 * Nettoie les logs anciens (plus de 7 jours).
 * À exécuter via trigger quotidien.
 */
function cleanupOldLogs() {
  var raw = PropertiesService.getScriptProperties().getProperty('activity_log');
  if (!raw) return;

  var logs = JSON.parse(raw);
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  var cutoffStr = cutoff.toISOString();

  var filtered = logs.filter(function (entry) {
    return entry.timestamp >= cutoffStr;
  });

  PropertiesService.getScriptProperties().setProperty(
    'activity_log',
    JSON.stringify(filtered)
  );

  // Nettoyer aussi les anciennes stats
  cleanupOldStats_();

  logEvent('CLEANUP', 'Removed ' + (logs.length - filtered.length) + ' old log entries');
}

// --- Internals ---

function appendToLog_(entry) {
  var raw = PropertiesService.getScriptProperties().getProperty('activity_log');
  var logs = raw ? JSON.parse(raw) : [];

  logs.push(entry);

  // Garder les 500 dernières entrées max (limite taille Script Properties)
  if (logs.length > 500) {
    logs = logs.slice(-500);
  }

  PropertiesService.getScriptProperties().setProperty(
    'activity_log',
    JSON.stringify(logs)
  );
}

function cleanupOldStats_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  Object.keys(props).forEach(function (key) {
    if (key.indexOf('stats_') === 0) {
      var dateStr = key.replace('stats_', '');
      if (dateStr < cutoff.toISOString().split('T')[0]) {
        PropertiesService.getScriptProperties().deleteProperty(key);
      }
    }
  });
}
