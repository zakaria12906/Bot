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

  if (CONFIG.PRODUCTS_FOLDER_ID) {
    buttons.push([
      { text: '\uD83D\uDCCE Approve + PDF', callback_data: 'approve_pdf_' + emailId }
    ]);
  }

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
      + '/contacts - Stats base marketing\n'
      + '/sync_shopify - Importer emails Shopify\n'
      + '/analytics - Stats campagne (ouvertures/clics)\n'
      + '/provider - Statut provider email\n\n'
      + '<b>Produits PDF</b>\n'
      + '/list_pdfs - Lister les PDFs produits\n'
      + '\uD83D\uDCCE Envoyer un PDF ici pour l\'ajouter\n\n'
      + '<b>RGPD</b>\n'
      + '/export - Exporter les contacts consentants\n'
      + '/delete_contact email - Supprimer un contact\n\n'
      + '<b>Syst\u00e8me</b>\n'
      + '/backup - Sauvegarder la base\n'
      + '/integrity - V\u00e9rifier l\'int\u00e9grit\u00e9\n'
      + '/integrity_fix - Corriger automatiquement\n'
      + '/logs - Logs r\u00e9cents\n'
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
  } else if (text.indexOf('/integrity_fix') === 0) {
    handleIntegrityFixCommand_();
  } else if (text.indexOf('/integrity') === 0) {
    handleIntegrityCommand_();
  } else if (text.indexOf('/logs') === 0) {
    sendRecentLogsToTelegram_();
  } else if (text.indexOf('/analytics') === 0) {
    handleAnalyticsCommand_(text);
  } else if (text.indexOf('/provider') === 0) {
    handleProviderCommand_();
  } else if (text.indexOf('/sync_shopify') === 0) {
    handleSyncShopifyCommand_(text);
  } else if (text.indexOf('/list_pdfs') === 0) {
    handleListPDFsCommand_();
  } else if (text.indexOf('/export') === 0) {
    handleExportCommand_();
  } else if (text.indexOf('/delete_contact') === 0) {
    handleDeleteContactCommand_(text);
  } else if (text.indexOf('/help') === 0) {
    sendTelegramMessage(
      '<b>\u2753 Aide</b>\n\n'
      + '<b>Support:</b>\n'
      + '/status - Vérifier que le bot fonctionne\n'
      + '/stats - Emails traités aujourd\'hui\n'
      + '/dashboard - Dashboard interactif avec boutons\n'
      + '/report - Envoyer le rapport quotidien\n\n'
      + '<b>Marketing:</b>\n'
      + '/campaign Titre | Message | Segment - Cr\u00e9er campagne\n'
      + '/contacts - Infos base marketing\n'
      + '/sync_shopify [jours] - Importer clients Shopify (d\u00e9faut: 30j)\n'
      + '/analytics campaign_id - Stats campagne\n'
      + '/provider - Statut provider email actif\n\n'
      + '<b>Produits PDF:</b>\n'
      + '/list_pdfs - Lister les PDFs dans le dossier produits\n'
      + '\uD83D\uDCCE Envoyez un PDF directement ici pour l\'ajouter au dossier\n\n'
      + '<b>RGPD:</b>\n'
      + '/export - Exporter les contacts consentants\n'
      + '/delete_contact email@ex.com - Supprimer un contact\n\n'
      + '<b>Syst\u00e8me:</b>\n'
      + '/backup - Sauvegarder la base contacts\n'
      + '/integrity - V\u00e9rifier les donn\u00e9es\n'
      + '/integrity_fix - Corriger automatiquement\n'
      + '/logs - Voir les 10 derniers logs\n\n'
      + 'Le bot scanne Gmail toutes les minutes et envoie les propositions de r\u00e9ponse ici.\n'
      + '\uD83D\uDCCE Le bouton "Approve + PDF" appara\u00eet si un dossier Drive est configur\u00e9.'
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

function handleIntegrityFixCommand_() {
  sendTelegramMessage('\uD83D\uDD27 Correction automatique en cours...');
  autoFixIntegrity();
}

function handleProviderCommand_() {
  var provider = getActiveProvider();
  var stats = getTodayStats();
  var quotaUsed = stats.approved + (stats.campaignsSent * 50);

  var text = '<b>\uD83D\uDCE7 Provider Email</b>\n\n'
    + '<b>Actif:</b> ' + provider.name + '\n'
    + '<b>Mode:</b> ' + provider.mode + '\n'
    + '<b>Quota jour:</b> ' + quotaUsed + '/' + provider.dailyLimit + '\n';

  if (provider.name === 'sendgrid') {
    text += '<b>Plan:</b> ' + (CONFIG.SENDGRID_PLAN || 'free') + '\n';
  }

  text += '\n<b>Providers disponibles:</b>\n'
    + '- gmail: ' + (CONFIG.SUPPORT_EMAIL ? '\u2705 Configuré' : '\u274C Non configuré') + '\n'
    + '- sendgrid: ' + (CONFIG.SENDGRID_API_KEY ? '\u2705 Configuré' : '\u274C Non configuré') + '\n';

  sendTelegramMessage(text);
}

function handleExportCommand_() {
  var data = exportContacts();
  if (data.length <= 1) {
    sendTelegramMessage('\u26A0\uFE0F Aucun contact consentant à exporter.');
    return;
  }

  sendTelegramMessage(
    '\u2705 <b>Export RGPD</b>\n\n'
    + 'Contacts consentants exportés: ' + (data.length - 1) + '\n'
    + 'Les données sont disponibles via la fonction exportContacts() dans Apps Script.'
  );
  logEvent('GDPR_EXPORT', 'Exported ' + (data.length - 1) + ' contacts');
}

function handleAnalyticsCommand_(text) {
  var campaignId = text.replace('/analytics', '').trim();
  if (!campaignId) {
    sendTelegramMessage(
      '\u2753 Format: /analytics campaign_id\n\n'
      + 'Exemple: /analytics c_1712345678'
    );
    return;
  }
  sendTelegramMessage(formatCampaignAnalytics(campaignId));
}

function handleSyncShopifyCommand_(text) {
  var parts = text.replace('/sync_shopify', '').trim();
  var days = parseInt(parts) || 30;
  syncShopifyCustomers(days);
}

function handleListPDFsCommand_() {
  if (!CONFIG.PRODUCTS_FOLDER_ID) {
    sendTelegramMessage(
      '\u26A0\uFE0F <b>Dossier produits non configur\u00e9</b>\n\n'
      + 'Ajoutez la propri\u00e9t\u00e9 PRODUCTS_FOLDER_ID avec l\'ID du dossier Google Drive contenant vos PDFs.'
    );
    return;
  }

  var pdfs = listProductPDFs();
  if (pdfs.length === 0) {
    sendTelegramMessage('\uD83D\uDCC2 Aucun PDF trouv\u00e9 dans le dossier produits.\n\nEnvoyez un fichier PDF ici pour l\'ajouter.');
    return;
  }

  var text = '\uD83D\uDCDA <b>PDFs produits disponibles</b> (' + pdfs.length + ')\n\n';
  pdfs.forEach(function (pdf, i) {
    text += (i + 1) + '. \uD83D\uDCC4 ' + escapeHtml(pdf.name) + ' (' + pdf.size + ' Ko)\n';
  });
  text += '\nCes fichiers sont propos\u00e9s lors de "Approve + PDF" sur un email support.';

  sendTelegramMessage(text);
}

/**
 * Envoie les boutons de sélection PDF pour un email donné.
 * @param {string} emailId
 * @param {Object[]} pdfs - Liste des PDFs [{id, name, size}]
 */
function sendPDFSelectionButtons(emailId, pdfs) {
  var buttons = [];
  var maxPDFs = Math.min(pdfs.length, 20);

  for (var i = 0; i < maxPDFs; i++) {
    var label = '\uD83D\uDCC4 ' + pdfs[i].name;
    if (label.length > 40) label = label.substring(0, 37) + '...';
    buttons.push([{ text: label, callback_data: 'send_pdf_' + i + '_' + emailId }]);
  }

  buttons.push([{ text: '\u274C Annuler', callback_data: 'cancel_pdf_' + emailId }]);

  var text = '\uD83D\uDCCE <b>Choisissez le PDF \u00e0 joindre</b>\n\n'
    + 'S\u00e9lectionnez le fichier produit \u00e0 envoyer avec la r\u00e9ponse :';

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
 * Gère l'upload d'un document PDF envoyé dans le chat Telegram.
 * @param {Object} message - Message Telegram contenant un document
 */
function handleDocumentUpload(message) {
  var chatId = message.chat.id.toString();
  if (chatId !== CONFIG.TG_CHAT_ID) return;

  var doc = message.document;
  if (!doc || doc.mime_type !== 'application/pdf') {
    sendTelegramMessage('\u26A0\uFE0F Seuls les fichiers PDF sont accept\u00e9s pour les produits.');
    return;
  }

  if (!CONFIG.PRODUCTS_FOLDER_ID) {
    sendTelegramMessage(
      '\u26A0\uFE0F <b>PRODUCTS_FOLDER_ID non configur\u00e9</b>\n\n'
      + 'Ajoutez l\'ID du dossier Google Drive dans les Script Properties pour stocker les PDFs.'
    );
    return;
  }

  try {
    var fileInfo = getTelegramFile_(doc.file_id);
    var fileUrl = 'https://api.telegram.org/file/bot' + CONFIG.TG_TOKEN + '/' + fileInfo.file_path;
    var response = UrlFetchApp.fetch(fileUrl);
    var blob = response.getBlob().setName(doc.file_name || 'product.pdf');

    var folder = DriveApp.getFolderById(CONFIG.PRODUCTS_FOLDER_ID);
    var file = folder.createFile(blob);

    sendTelegramMessage(
      '\u2705 <b>PDF ajout\u00e9 au dossier produits</b>\n\n'
      + '\uD83D\uDCC4 Nom: ' + escapeHtml(file.getName()) + '\n'
      + '\uD83D\uDCBE Taille: ' + Math.round(file.getSize() / 1024) + ' Ko\n'
      + '\uD83D\uDD17 <a href="' + file.getUrl() + '">Voir sur Drive</a>\n\n'
      + 'Ce fichier sera propos\u00e9 lors de "Approve + PDF" sur les emails support.'
    );

    logEvent('PDF_UPLOADED', 'File: ' + file.getName() + ' (via Telegram)');
  } catch (e) {
    logEvent('PDF_UPLOAD_ERROR', e.message);
    sendTelegramMessage('\u274C Erreur upload PDF: ' + e.message);
  }
}

/**
 * Récupère les infos d'un fichier Telegram pour le télécharger.
 */
function getTelegramFile_(fileId) {
  var url = CONFIG.TG_API() + '/getFile?file_id=' + fileId;
  var response = UrlFetchApp.fetch(url);
  var result = JSON.parse(response.getContentText());
  if (!result.ok) throw new Error('Cannot get file: ' + (result.description || 'Unknown'));
  return result.result;
}

function handleDeleteContactCommand_(text) {
  var email = text.replace('/delete_contact', '').trim();
  if (!email || !isValidEmail(email)) {
    sendTelegramMessage('\u2753 Format: /delete_contact email@exemple.com');
    return;
  }

  var success = deleteContact(email);
  if (success) {
    sendTelegramMessage('\u2705 Contact <b>' + escapeHtml(email) + '</b> supprimé (RGPD).');
  } else {
    sendTelegramMessage('\u274C Contact <b>' + escapeHtml(email) + '</b> non trouvé.');
  }
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
    var result = resilientFetch(url, options);
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
