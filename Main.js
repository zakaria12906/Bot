/**
 * Main.js — Orchestrateur principal
 * Point d'entrée Web App, traitement webhook Telegram, triggers.
 */

// ============================
// WEB APP ENDPOINTS
// ============================

/**
 * Gère les requêtes GET (désinscription, status check).
 */
function doGet(e) {
  var action = e.parameter.action;

  // Endpoint désinscription
  if (action === 'unsubscribe' && e.parameter.token) {
    var html = handleUnsubscribe(e.parameter.token);
    return HtmlService.createHtmlOutput(html)
      .setTitle('Désinscription');
  }

  // Tracking pixel (email open)
  if (action === 'track_open' && e.parameter.cid && e.parameter.t) {
    return handleTrackOpen(e.parameter.cid, e.parameter.t);
  }

  // Tracked link click
  if (action === 'track_click' && e.parameter.cid && e.parameter.t && e.parameter.url) {
    return handleTrackClick(e.parameter.cid, e.parameter.t, e.parameter.url);
  }

  // Status check
  if (action === 'status' && validateWebhookKey(e)) {
    var provider = getActiveProvider();
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      config: validateConfig().length === 0 ? 'complete' : 'incomplete',
      provider: provider.name,
      providerMode: provider.mode
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService.createHtmlOutput('<p>Bot Support Digital actif.</p>');
}

/**
 * Gère les requêtes POST (webhook Telegram).
 */
function doPost(e) {
  try {
    // Vérifier la clé webhook
    if (!validateWebhookKey(e)) {
      logEvent('SECURITY', 'Invalid webhook key');
      return ContentService.createTextOutput('Unauthorized');
    }

    var update = JSON.parse(e.postData.contents);

    // Vérifier que l'utilisateur est autorisé
    if (!isAuthorizedTelegramUser(update)) {
      logEvent('SECURITY', 'Unauthorized Telegram user');
      return ContentService.createTextOutput('OK');
    }

    // Traiter les commandes texte
    if (update.message && update.message.text) {
      handleTelegramCommand(update.message);
    }

    // Traiter les documents (upload PDF)
    if (update.message && update.message.document) {
      handleDocumentUpload(update.message);
    }

    // Traiter les callbacks (boutons)
    if (update.callback_query) {
      handleCallbackQuery_(update.callback_query);
    }

    return ContentService.createTextOutput('OK');
  } catch (e) {
    logEvent('WEBHOOK_ERROR', 'doPost failed: ' + e.message);
    return ContentService.createTextOutput('Error');
  }
}

// ============================
// CALLBACK HANDLERS
// ============================

function handleCallbackQuery_(callbackQuery) {
  var data = callbackQuery.data;
  var messageId = callbackQuery.message.message_id;

  answerCallbackQuery(callbackQuery.id);

  // --- Approve + PDF (doit être testé AVANT approve_ simple) ---
  if (data.indexOf('approve_pdf_') === 0) {
    var emailId = data.replace('approve_pdf_', '');
    var pending = getPendingReply(emailId);
    if (!pending) {
      updateTelegramMessage(messageId, '\u274C Email non trouv\u00e9 ou d\u00e9j\u00e0 trait\u00e9');
      return;
    }

    var pdfs = listProductPDFs();
    if (pdfs.length === 0) {
      updateTelegramMessage(messageId, '\u26A0\uFE0F Aucun PDF dans le dossier produits.\nEnvoyez un PDF ici pour l\'ajouter.');
      return;
    }

    storePDFSelection(emailId, pdfs);
    updateTelegramMessage(messageId,
      '\uD83D\uDCCE S\u00e9lection du PDF pour: ' + escapeHtml(pending.sender));
    sendPDFSelectionButtons(emailId, pdfs);
  }

  // --- Support email actions ---
  else if (data.indexOf('approve_') === 0) {
    var emailId = data.replace('approve_', '');
    var success = sendApprovedReply(emailId);
    if (success) {
      updateTelegramMessage(messageId, '\u2705 R\u00e9ponse envoy\u00e9e avec succ\u00e8s');
      incrementStat('approved');
    } else {
      updateTelegramMessage(messageId, '\u274C Erreur lors de l\'envoi');
      incrementStat('errors');
    }
    incrementStat('processed');
  }

  else if (data.indexOf('draft_') === 0) {
    var emailId = data.replace('draft_', '');
    var success = createDraftReply(emailId);
    if (success) {
      updateTelegramMessage(messageId, '\u270F\uFE0F Brouillon cr\u00e9\u00e9 dans Gmail');
      incrementStat('drafted');
    } else {
      updateTelegramMessage(messageId, '\u274C Erreur lors de la cr\u00e9ation du brouillon');
      incrementStat('errors');
    }
    incrementStat('processed');
  }

  else if (data.indexOf('ignore_') === 0) {
    var emailId = data.replace('ignore_', '');
    ignoreEmail(emailId);
    updateTelegramMessage(messageId, '\uD83D\uDDD1 Email ignor\u00e9');
    incrementStat('ignored');
    incrementStat('processed');
  }

  else if (data.indexOf('edit_') === 0) {
    var emailId = data.replace('edit_', '');
    var pending = getPendingReply(emailId);
    if (pending) {
      updateTelegramMessage(messageId,
        '\u270F\uFE0F <b>Mode \u00e9dition</b>\n\n'
        + 'Un brouillon a \u00e9t\u00e9 cr\u00e9\u00e9 dans Gmail. Modifiez-le directement depuis Gmail puis envoyez-le manuellement.\n\n'
        + 'De: ' + escapeHtml(pending.sender)
      );
      createDraftReply(emailId);
      incrementStat('drafted');
    }
    incrementStat('processed');
  }

  // --- Envoi r\u00e9ponse + PDF s\u00e9lectionn\u00e9 ---
  else if (data.indexOf('send_pdf_') === 0) {
    var parts = data.replace('send_pdf_', '').split('_');
    var pdfIndex = parseInt(parts[0]);
    var emailId = parts.slice(1).join('_');

    var pdfList = getPDFSelection(emailId);
    if (!pdfList || pdfIndex >= pdfList.length) {
      updateTelegramMessage(messageId, '\u274C S\u00e9lection PDF expir\u00e9e. R\u00e9essayez.');
      return;
    }

    var selectedPdf = pdfList[pdfIndex];
    updateTelegramMessage(messageId, '\uD83D\uDE80 Envoi avec PDF "' + escapeHtml(selectedPdf.name) + '"...');

    var success = sendApprovedReplyWithPDF(emailId, selectedPdf.id);
    if (success) {
      updateTelegramMessage(messageId,
        '\u2705 R\u00e9ponse envoy\u00e9e avec \uD83D\uDCC4 ' + escapeHtml(selectedPdf.name));
      incrementStat('approved');
    } else {
      updateTelegramMessage(messageId, '\u274C Erreur lors de l\'envoi avec PDF');
      incrementStat('errors');
    }
    removePDFSelection(emailId);
    incrementStat('processed');
  }

  // --- Annulation sélection PDF ---
  else if (data.indexOf('cancel_pdf_') === 0) {
    var emailId = data.replace('cancel_pdf_', '');
    removePDFSelection(emailId);
    updateTelegramMessage(messageId, '\u274C S\u00e9lection PDF annul\u00e9e. L\'email reste en attente.');
  }

  // --- Campaign actions ---
  else if (data.indexOf('campaign_send_') === 0) {
    var campaignId = data.replace('campaign_send_', '');
    updateTelegramMessage(messageId, '\uD83D\uDE80 Lancement de la campagne...');
    executeCampaign(campaignId);
    incrementStat('campaignsSent');
  }

  else if (data.indexOf('campaign_cancel_') === 0) {
    var campaignId = data.replace('campaign_cancel_', '');
    cancelCampaign(campaignId);
    updateTelegramMessage(messageId, '\u274C Campagne annulée');
  }

  // --- Dashboard actions ---
  else if (data.indexOf('dash_') === 0) {
    handleDashboardCallback(data, messageId);
  }
}

// ============================
// TRIGGERS SETUP
// ============================

/**
 * Configure tous les triggers nécessaires.
 * À exécuter une seule fois manuellement.
 */
function setupTriggers() {
  // Supprimer les triggers existants
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
  });

  // Scan inbox toutes les 1 minute
  ScriptApp.newTrigger('scanInbox')
    .timeBased()
    .everyMinutes(1)
    .create();

  // Rapport quotidien à 9h
  ScriptApp.newTrigger('sendDailyReport')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();

  // Rapport hebdomadaire le lundi à 9h
  ScriptApp.newTrigger('sendWeeklyReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  // Backup hebdomadaire le dimanche à 2h
  ScriptApp.newTrigger('backupMarketingData')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(2)
    .create();

  // Sync Shopify clients tous les jours à 6h
  ScriptApp.newTrigger('syncShopifyCustomers')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();

  // Nettoyage quotidien des logs à 3h du matin
  ScriptApp.newTrigger('cleanupOldLogs')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .create();

  // Vérification intégrité mensuelle (1er du mois à 4h)
  ScriptApp.newTrigger('autoFixIntegrity')
    .timeBased()
    .onMonthDay(1)
    .atHour(4)
    .create();

  logEvent('SETUP', 'All triggers configured (7 total)');
  sendTelegramMessage(
    '\u2705 <b>Bot configur\u00e9</b>\n\n'
    + 'Triggers install\u00e9s:\n'
    + '- Scan inbox: toutes les 1 min\n'
    + '- Rapport quotidien: 9h\n'
    + '- Rapport hebdo: lundi 9h\n'
    + '- Sync Shopify: 6h quotidien\n'
    + '- Backup: dimanche 2h\n'
    + '- Nettoyage logs: 3h\n'
    + '- Int\u00e9grit\u00e9: 1er du mois 4h'
  );
}

/**
 * Initialisation complète du bot.
 * À exécuter une fois après déploiement.
 */
function initialize() {
  // Valider la configuration
  var missing = validateConfig();
  if (missing.length > 0) {
    console.log('Missing config: ' + missing.join(', '));
    throw new Error('Configuration incomplète. Propriétés manquantes: ' + missing.join(', '));
  }

  // Créer les labels Gmail
  ensureLabelsExist_();

  // Configurer les triggers
  setupTriggers();

  // Configurer le webhook Telegram
  var webhookUrl = getWebAppUrl() + '?key=' + CONFIG.WEBHOOK_KEY;
  var setWebhookUrl = CONFIG.TG_API() + '/setWebhook?url=' + encodeURIComponent(webhookUrl);
  var response = UrlFetchApp.fetch(setWebhookUrl);
  var result = JSON.parse(response.getContentText());

  if (result.ok) {
    logEvent('SETUP', 'Telegram webhook configured: ' + webhookUrl);
    sendTelegramMessage(
      '\uD83E\uDD16 <b>Bot Support Digital initialisé !</b>\n\n'
      + '\u2705 Configuration validée\n'
      + '\u2705 Labels Gmail créés\n'
      + '\u2705 Triggers installés\n'
      + '\u2705 Webhook Telegram configuré\n\n'
      + 'Tapez /help pour les commandes disponibles.'
    );
  } else {
    throw new Error('Webhook setup failed: ' + result.description);
  }
}

// ============================
// UTILITAIRES DE TEST
// ============================

/**
 * Test rapide pour vérifier que le bot fonctionne.
 */
function testBot() {
  sendTelegramMessage('\uD83E\uDD16 Test: Le bot fonctionne correctement !');
}

/**
 * Test du scan inbox (dry run).
 */
function testScan() {
  var threads = GmailApp.search('is:inbox newer_than:1d', 0, 5);
  sendTelegramMessage(
    '\uD83D\uDD0D <b>Test Scan</b>\n\n'
    + 'Emails trouvés: ' + threads.length + '\n'
    + (threads.length > 0 ? 'Premier: ' + escapeHtml(threads[0].getFirstMessageSubject()) : 'Aucun email récent')
  );
}
