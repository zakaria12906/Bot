/**
 * Dashboard.js — Module de reporting et tableau de bord Telegram
 * Rapports quotidiens, métriques temps réel, alertes.
 */

/**
 * Envoie le rapport quotidien sur Telegram.
 * À configurer avec un trigger quotidien (ex: 9h00).
 */
function sendDailyReport() {
  var stats = getTodayStats();
  var marketingStats = getMarketingStats();
  var yesterday = getYesterdayStats_();

  var report = '\uD83D\uDCCA <b>Rapport quotidien</b>\n'
    + '\uD83D\uDCC5 ' + new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) + '\n\n'
    // Support
    + '<b>📨 Support</b>\n'
    + '  Emails traités: ' + stats.processed + trend_(stats.processed, yesterday.processed) + '\n'
    + '  Approuvés: ' + stats.approved + '\n'
    + '  Brouillons: ' + stats.drafted + '\n'
    + '  Ignorés: ' + stats.ignored + '\n'
    + '  Erreurs: ' + stats.errors + '\n\n'
    // Marketing
    + '<b>📢 Marketing</b>\n'
    + '  Contacts totaux: ' + marketingStats.total + '\n'
    + '  Consentement actif: ' + marketingStats.consented + '\n'
    + '  Désinscrits: ' + marketingStats.unsubscribed + '\n'
    + '  Campagnes envoyées: ' + stats.campaignsSent + '\n\n'
    // Santé système
    + '<b>🔧 Système</b>\n'
    + '  Statut: ' + getSystemHealth_() + '\n'
    + '  Quota Gmail restant: ~' + estimateRemainingQuota_() + '\n';

  // Alertes
  var alerts = checkAlerts_();
  if (alerts.length > 0) {
    report += '\n<b>⚠️ Alertes</b>\n';
    alerts.forEach(function (alert) {
      report += '  ' + alert + '\n';
    });
  }

  sendTelegramMessage(report);
  logEvent('REPORT', 'Daily report sent');
}

/**
 * Envoie le rapport hebdomadaire sur Telegram.
 * À configurer avec un trigger hebdomadaire (ex: lundi 9h00).
 */
function sendWeeklyReport() {
  var weekStats = getWeekStats_();
  var marketingStats = getMarketingStats();

  var report = '\uD83D\uDCCA <b>Rapport hebdomadaire</b>\n'
    + '\uD83D\uDCC5 Semaine du ' + getWeekRange_() + '\n\n'
    + '<b>📨 Support (7 jours)</b>\n'
    + '  Total traités: ' + weekStats.processed + '\n'
    + '  Approuvés: ' + weekStats.approved + '\n'
    + '  Brouillons: ' + weekStats.drafted + '\n'
    + '  Ignorés: ' + weekStats.ignored + '\n'
    + '  Erreurs: ' + weekStats.errors + '\n'
    + '  Taux d\'approbation auto: ' + calcApprovalRate_(weekStats) + '%\n\n'
    + '<b>📢 Marketing</b>\n'
    + '  Base contacts: ' + marketingStats.total + '\n'
    + '  Taux consentement: ' + calcConsentRate_(marketingStats) + '%\n'
    + '  Campagnes envoyées: ' + weekStats.campaignsSent + '\n\n'
    + '<b>📊 Top catégories support</b>\n'
    + getTopCategories_();

  sendTelegramMessage(report);
  logEvent('REPORT', 'Weekly report sent');
}

/**
 * Envoie un résumé rapide en temps réel.
 * Utilisé par la commande /stats.
 */
function sendRealtimeStats() {
  var stats = getTodayStats();
  var pendingCount = countPendingReplies_();

  var text = '\uD83D\uDCCA <b>Stats temps réel</b>\n\n'
    + '⏰ ' + new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' }) + '\n\n'
    + 'En attente: ' + pendingCount + '\n'
    + 'Traités aujourd\'hui: ' + stats.processed + '\n'
    + 'Approbations: ' + stats.approved + '\n'
    + 'Erreurs: ' + stats.errors;

  sendTelegramMessage(text);
}

/**
 * Envoie une alerte si le taux d'erreur est élevé.
 * À appeler depuis scanInbox si erreurs détectées.
 */
function checkAndAlertErrors() {
  var stats = getTodayStats();
  if (stats.errors > 5 && stats.processed > 0) {
    var errorRate = Math.round(stats.errors / stats.processed * 100);
    if (errorRate > 20) {
      sendTelegramMessage(
        '\uD83D\uDEA8 <b>ALERTE: Taux d\'erreur élevé</b>\n\n'
        + 'Taux: ' + errorRate + '%\n'
        + 'Erreurs: ' + stats.errors + '/' + stats.processed + '\n\n'
        + 'Vérifiez les logs immédiatement.'
      );
    }
  }
}

/**
 * Dashboard interactif Telegram avec boutons.
 */
function sendDashboard() {
  var stats = getTodayStats();
  var marketingStats = getMarketingStats();

  var text = '\uD83C\uDFE0 <b>Dashboard</b>\n\n'
    + '📨 Support: ' + stats.processed + ' emails | ✅ ' + stats.approved + ' | ❌ ' + stats.errors + '\n'
    + '📢 Marketing: ' + marketingStats.consented + '/' + marketingStats.total + ' contacts actifs\n'
    + '🔧 Système: ' + getSystemHealth_();

  var buttons = [
    [
      { text: '\uD83D\uDCCA Stats détaillées', callback_data: 'dash_stats' },
      { text: '\uD83D\uDCCB Contacts', callback_data: 'dash_contacts' }
    ],
    [
      { text: '\uD83D\uDCC4 Logs récents', callback_data: 'dash_logs' },
      { text: '\uD83D\uDD04 Rafraîchir', callback_data: 'dash_refresh' }
    ]
  ];

  var url = CONFIG.TG_API() + '/sendMessage';
  var payload = {
    chat_id: CONFIG.TG_CHAT_ID,
    text: text,
    parse_mode: 'HTML',
    reply_markup: JSON.stringify({ inline_keyboard: buttons })
  };
  telegramRequest_(url, payload);
}

/**
 * Gère les callbacks du dashboard.
 * @param {string} action - L'action du callback (dash_stats, dash_contacts, etc.)
 * @param {string} messageId - ID du message Telegram
 */
function handleDashboardCallback(action, messageId) {
  if (action === 'dash_stats') {
    sendRealtimeStats();
  } else if (action === 'dash_contacts') {
    handleContactsCommand_();
  } else if (action === 'dash_logs') {
    sendRecentLogsToTelegram_();
  } else if (action === 'dash_refresh') {
    sendDashboard();
  }
}

// ============================
// UTILITAIRES INTERNES
// ============================

function getYesterdayStats_() {
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var key = 'stats_' + yesterday.toISOString().split('T')[0];
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  return raw ? JSON.parse(raw) : { processed: 0, approved: 0, drafted: 0, ignored: 0, errors: 0, campaignsSent: 0 };
}

function getWeekStats_() {
  var result = { processed: 0, approved: 0, drafted: 0, ignored: 0, errors: 0, campaignsSent: 0 };

  for (var i = 0; i < 7; i++) {
    var date = new Date();
    date.setDate(date.getDate() - i);
    var key = 'stats_' + date.toISOString().split('T')[0];
    var raw = PropertiesService.getScriptProperties().getProperty(key);
    if (raw) {
      var day = JSON.parse(raw);
      Object.keys(result).forEach(function (k) {
        result[k] += (day[k] || 0);
      });
    }
  }

  return result;
}

function trend_(current, previous) {
  if (previous === 0) return '';
  var diff = current - previous;
  if (diff > 0) return ' (↑' + diff + ')';
  if (diff < 0) return ' (↓' + Math.abs(diff) + ')';
  return ' (=)';
}

function getSystemHealth_() {
  var missing = validateConfig();
  if (missing.length > 0) return '⚠️ Config incomplète';

  var stats = getTodayStats();
  if (stats.errors > 10) return '🔴 Erreurs critiques';
  if (stats.errors > 3) return '🟡 Quelques erreurs';
  return '🟢 OK';
}

function estimateRemainingQuota_() {
  var stats = getTodayStats();
  var used = stats.approved + (stats.campaignsSent * 50); // estimation
  var quota = CONFIG.MAX_EMAILS_PER_DAY;
  var remaining = Math.max(0, quota - used);
  return remaining + '/' + quota;
}

function checkAlerts_() {
  var alerts = [];
  var stats = getTodayStats();

  if (stats.errors > 5) alerts.push('⚠️ ' + stats.errors + ' erreurs aujourd\'hui');
  if (stats.processed > 100) alerts.push('📈 Volume élevé: ' + stats.processed + ' emails');

  var remaining = CONFIG.MAX_EMAILS_PER_DAY - stats.approved;
  if (remaining < 50) alerts.push('⚠️ Quota Gmail presque épuisé: ' + remaining + ' restants');

  return alerts;
}

function calcApprovalRate_(stats) {
  if (stats.processed === 0) return 0;
  return Math.round(stats.approved / stats.processed * 100);
}

function calcConsentRate_(stats) {
  if (stats.total === 0) return 0;
  return Math.round(stats.consented / stats.total * 100);
}

function countPendingReplies_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var count = 0;
  Object.keys(props).forEach(function (key) {
    if (key.indexOf('pending_') === 0) count++;
  });
  return count;
}

function getWeekRange_() {
  var end = new Date();
  var start = new Date();
  start.setDate(start.getDate() - 6);
  return start.toLocaleDateString('fr-FR') + ' au ' + end.toLocaleDateString('fr-FR');
}

function getTopCategories_() {
  var logs = getRecentLogs(200);
  var categories = {};

  logs.forEach(function (log) {
    if (log.type === 'PROCESSED' && log.message) {
      var match = log.message.match(/category: (\w+)/);
      if (match) {
        categories[match[1]] = (categories[match[1]] || 0) + 1;
      }
    }
  });

  var sorted = Object.keys(categories).sort(function (a, b) {
    return categories[b] - categories[a];
  });

  if (sorted.length === 0) return '  Pas assez de données\n';

  var text = '';
  sorted.slice(0, 5).forEach(function (cat, i) {
    text += '  ' + (i + 1) + '. ' + cat + ': ' + categories[cat] + '\n';
  });
  return text;
}

function sendRecentLogsToTelegram_() {
  var logs = getRecentLogs(10);
  if (logs.length === 0) {
    sendTelegramMessage('📄 Aucun log récent.');
    return;
  }

  var text = '\uD83D\uDCC4 <b>Logs récents</b>\n\n';
  logs.reverse().forEach(function (log) {
    var time = log.timestamp ? log.timestamp.split('T')[1].substring(0, 8) : '??:??';
    text += '<code>' + time + '</code> [' + log.type + '] ' + escapeHtml(log.message || '').substring(0, 60) + '\n';
  });

  sendTelegramMessage(text);
}
