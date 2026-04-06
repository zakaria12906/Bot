/**
 * Telegram.js — Module Telegram Bot
 * Gère l'envoi de messages, boutons inline et traitement des callbacks.
 */

/**
 * Envoie un message texte simple sur Telegram.
 * @param {string} text - Le message à envoyer
 * @param {string} [chatId] - Chat ID (défaut : CONFIG.TG_CHAT_ID)
 * @returns {Object} Réponse de l'API Telegram
 */
function sendTelegramMessage(text, chatId) {
  var url = CONFIG.TG_API() + '/sendMessage';
  var payload = {
    chat_id: chatId || CONFIG.TG_CHAT_ID,
    text: text,
    parse_mode: 'HTML'
  };
  return telegramRequest_(url, payload);
}

/**
 * Envoie un message avec boutons inline pour validation support.
 * @param {string} text - Le message
 * @param {string} emailId - L'ID du message Gmail
 * @param {Object} [options] - Options supplémentaires
 * @returns {Object} Réponse de l'API Telegram
 */
function sendApprovalRequest(text, emailId, options) {
  var buttons = [
    [
      { text: '\u2705 Approve & Send', callback_data: 'approve_' + emailId },
      { text: '\u270F\uFE0F Draft', callback_data: 'draft_' + emailId }
    ],
    [
      { text: '\uD83D\uDDD1 Ignore', callback_data: 'ignore_' + emailId },
      { text: '\u270F\uFE0F Edit', callback_data: 'edit_' + emailId }
    ]
  ];

  var url = CONFIG.TG_API() + '/sendMessage';
  var payload = {
    chat_id: CONFIG.TG_CHAT_ID,
    text: text,
    parse_mode: 'HTML',
    reply_markup: JSON.stringify({ inline_keyboard: buttons })
  };
  return telegramRequest_(url, payload);
}

/**
 * Met à jour un message existant (après action sur un bouton).
 * @param {string} messageId - ID du message Telegram
 * @param {string} newText - Nouveau texte
 */
function updateTelegramMessage(messageId, newText) {
  var url = CONFIG.TG_API() + '/editMessageText';
  var payload = {
    chat_id: CONFIG.TG_CHAT_ID,
    message_id: messageId,
    text: newText,
    parse_mode: 'HTML'
  };
  telegramRequest_(url, payload);
}

/**
 * Répond à un callback query (supprime le spinner sur le bouton).
 * @param {string} callbackQueryId
 * @param {string} [text] - Texte de notification
 */
function answerCallbackQuery(callbackQueryId, text) {
  var url = CONFIG.TG_API() + '/answerCallbackQuery';
  var payload = {
    callback_query_id: callbackQueryId,
    text: text || 'Action effectuée'
  };
  telegramRequest_(url, payload);
}

/**
 * Envoie une notification de campagne marketing.
 * @param {string} title - Titre de la campagne
 * @param {number} targetCount - Nombre d'emails ciblés
 * @param {string} segment - Segment ciblé
 * @param {string} campaignId - ID unique de la campagne
 */
function sendCampaignConfirmation(title, targetCount, segment, campaignId) {
  var text = '<b>\uD83D\uDCE2 Nouvelle Campagne</b>\n\n'
    + '<b>Titre:</b> ' + escapeHtml(title) + '\n'
    + '<b>Segment:</b> ' + escapeHtml(segment) + '\n'
    + '<b>Cibles:</b> ' + targetCount + ' emails\n\n'
    + 'Confirmer l\'envoi ?';

  var buttons = [
    [
      { text: '\u2705 Envoyer', callback_data: 'campaign_send_' + campaignId },
      { text: '\u274C Annuler', callback_data: 'campaign_cancel_' + campaignId }
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
 * Traite les commandes Telegram (/campaign, /stats, /status).
 * @param {Object} message - Objet message Telegram
 */
function handleTelegramCommand(message) {
  var text = message.text || '';
  var chatId = message.chat.id.toString();

  if (chatId !== CONFIG.TG_CHAT_ID) {
    sendTelegramMessage('\u26D4 Accès non autorisé.', chatId);
    return;
  }

  if (text.indexOf('/start') === 0) {
    sendTelegramMessage(
      '<b>\uD83E\uDD16 Bot Support Digital</b>\n\n'
      + '<b>Support</b>\n'
      + '/status - État du bot\n'
      + '/stats - Statistiques du jour\n'
      + '/dashboard - Tableau de bord interactif\n'
      + '/report - Rapport quotidien\n\n'
      + '<b>Marketing</b>\n'
      + '/campaign - Lancer une campagne\n'
      + '/contacts - Stats base marketing\n\n'
      + '<b>Système</b>\n'
      + '/backup - Sauvegarder la base\n'
      + '/integrity - Vérifier l\'intégrité\n'
      + '/logs - Logs récents\n'
      + '/help - Aide'
    );
  } else if (text.indexOf('/status') === 0) {
    handleStatusCommand_();
  } else if (text.indexOf('/stats') === 0) {
    handleStatsCommand_();
  } else if (text.indexOf('/dashboard') === 0) {
    sendDashboard();
  } else if (text.indexOf('/report') === 0) {
    sendDailyReport();
  } else if (text.indexOf('/campaign') === 0) {
    handleCampaignCommand_(text);
  } else if (text.indexOf('/contacts') === 0) {
    handleContactsCommand_();
  } else if (text.indexOf('/backup') === 0) {
    backupMarketingData();
  } else if (text.indexOf('/integrity') === 0) {
    handleIntegrityCommand_();
  } else if (text.indexOf('/logs') === 0) {
    sendRecentLogsToTelegram_();
  } else if (text.indexOf('/help') === 0) {
    sendTelegramMessage(
      '<b>\u2753 Aide</b>\n\n'
      + '<b>Support:</b>\n'
      + '/status - Vérifier que le bot fonctionne\n'
      + '/stats - Emails traités aujourd\'hui\n'
      + '/dashboard - Dashboard interactif avec boutons\n'
      + '/report - Envoyer le rapport quotidien\n\n'
      + '<b>Marketing:</b>\n'
      + '/campaign Titre | Message | Segment - Créer campagne\n'
      + '/contacts - Infos base marketing\n\n'
      + '<b>Système:</b>\n'
      + '/backup - Sauvegarder la base contacts\n'
      + '/integrity - Vérifier et corriger les données\n'
      + '/logs - Voir les 10 derniers logs\n\n'
      + 'Le bot scanne Gmail toutes les minutes et envoie les propositions de réponse ici.'
    );
  } else {
    sendTelegramMessage('\u2753 Commande inconnue. Tapez /help pour la liste.');
  }
}

// --- Commandes internes ---

function handleStatusCommand_() {
  var missing = validateConfig();
  var status = missing.length === 0 ? '\u2705 Opérationnel' : '\u26A0\uFE0F Config manquante: ' + missing.join(', ');
  sendTelegramMessage(
    '<b>\uD83D\uDCCA Statut Bot</b>\n\n'
    + 'État: ' + status + '\n'
    + 'Heure: ' + new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
  );
}

function handleStatsCommand_() {
  var stats = getTodayStats();
  sendTelegramMessage(
    '<b>\uD83D\uDCCA Stats du jour</b>\n\n'
    + '\uD83D\uDCE8 Emails traités: ' + stats.processed + '\n'
    + '\u2705 Approuvés: ' + stats.approved + '\n'
    + '\u270F\uFE0F Drafts: ' + stats.drafted + '\n'
    + '\uD83D\uDDD1 Ignorés: ' + stats.ignored + '\n'
    + '\u274C Erreurs: ' + stats.errors
  );
}

function handleCampaignCommand_(text) {
  // Format: /campaign Titre | Message | Segment
  var parts = text.replace('/campaign', '').trim().split('|').map(function (s) { return s.trim(); });
  if (parts.length < 3 || !parts[0]) {
    sendTelegramMessage(
      '\u2753 Format: /campaign Titre | Message | Segment\n\n'
      + 'Segments: all, new, vip, inactive\n'
      + 'Exemple: /campaign Promo été | -50% sur tout ! | all'
    );
    return;
  }
  initiateCampaign(parts[0], parts[1], parts[2]);
}

function handleContactsCommand_() {
  var info = getMarketingStats();
  sendTelegramMessage(
    '<b>\uD83D\uDCCB Base Marketing</b>\n\n'
    + 'Total contacts: ' + info.total + '\n'
    + 'Consentement actif: ' + info.consented + '\n'
    + 'Désinscrits: ' + info.unsubscribed + '\n'
    + 'Segments: ' + info.segments
  );
}

function handleIntegrityCommand_() {
  var report = checkDataIntegrity();
  var text = '<b>\uD83D\uDD0D Vérification intégrité</b>\n\n'
    + 'Statut: ' + (report.status === 'ok' ? '\u2705 OK' : '\u26A0\uFE0F Problèmes détectés') + '\n'
    + 'Total lignes: ' + report.totalRows + '\n'
    + 'Doublons: ' + report.duplicates.length + '\n'
    + 'Emails invalides: ' + report.invalidEmails.length + '\n'
    + 'Tokens manquants: ' + report.missingTokens.length + '\n';

  if (report.issues > 0) {
    text += '\nTotal problèmes: ' + report.issues + '\n'
      + 'Utilisez /integrity_fix pour corriger automatiquement.';
  }

  sendTelegramMessage(text);
}

// --- Utilitaires ---

function telegramRequest_(url, payload) {
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());
    if (!result.ok) {
      logEvent('TELEGRAM_ERROR', 'API error: ' + result.description);
    }
    return result;
  } catch (e) {
    logEvent('TELEGRAM_ERROR', 'Request failed: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
