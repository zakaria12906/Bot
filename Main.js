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

  // Status check
  if (action === 'status' && validateWebhookKey(e)) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      config: validateConfig().length === 0 ? 'complete' : 'incomplete'
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

  // --- Support email actions ---
  if (data.indexOf('approve_') === 0) {
    var emailId = data.replace('approve_', '');
    var success = sendApprovedReply(emailId);
    if (success) {
      updateTelegramMessage(messageId, '\u2705 Réponse envoyée avec succès');
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
      updateTelegramMessage(messageId, '\u270F\uFE0F Brouillon créé dans Gmail');
      incrementStat('drafted');
    } else {
      updateTelegramMessage(messageId, '\u274C Erreur lors de la création du brouillon');
      incrementStat('errors');
    }
    incrementStat('processed');
  }

  else if (data.indexOf('ignore_') === 0) {
    var emailId = data.replace('ignore_', '');
    ignoreEmail(emailId);
    updateTelegramMessage(messageId, '\uD83D\uDDD1 Email ignoré');
    incrementStat('ignored');
    incrementStat('processed');
  }

  else if (data.indexOf('edit_') === 0) {
    var emailId = data.replace('edit_', '');
    var pending = getPendingReply(emailId);
    if (pending) {
      updateTelegramMessage(messageId,
        '\u270F\uFE0F <b>Mode édition</b>\n\n'
        + 'Un brouillon a été créé dans Gmail. Modifiez-le directement depuis Gmail puis envoyez-le manuellement.\n\n'
        + 'De: ' + escapeHtml(pending.sender)
      );
      createDraftReply(emailId);
      incrementStat('drafted');
    }
    incrementStat('processed');
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

  logEvent('SETUP', 'All triggers configured (6 total)');
  sendTelegramMessage(
    '\u2705 <b>Bot configuré</b>\n\n'
    + 'Triggers installés:\n'
    + '- Scan inbox: toutes les 1 min\n'
    + '- Rapport quotidien: 9h\n'
    + '- Rapport hebdo: lundi 9h\n'
    + '- Backup: dimanche 2h\n'
    + '- Nettoyage logs: 3h\n'
    + '- Intégrité: 1er du mois 4h'
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
