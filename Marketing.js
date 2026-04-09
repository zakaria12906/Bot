/**
 * Marketing.js — Module Emailing Marketing
 * Gestion base contacts, campagnes, consentement RGPD, désinscription.
 */

// ============================
// BASE CONTACTS (Google Sheet)
// ============================

/**
 * Récupère tous les contacts marketing consentants d'un segment.
 * @param {string} segment - 'all', 'new', 'vip', 'inactive'
 * @returns {Object[]} Liste de contacts
 */
function getMarketingContacts(segment) {
  var sheet = getMarketingSheet_();
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var contacts = [];

  for (var i = 1; i < data.length; i++) {
    var row = rowToObject_(headers, data[i]);
    if (row.consent !== true && row.consent !== 'TRUE' && row.consent !== 'true') continue;

    if (segment === 'all' || !segment) {
      contacts.push(row);
    } else if (row.segment === segment) {
      contacts.push(row);
    }
  }

  return contacts;
}

/**
 * Ajoute un contact à la base marketing.
 * @param {Object} contact - {email, prenom, consent, segment}
 */
function addMarketingContact(contact) {
  var sheet = getMarketingSheet_();
  if (!sheet) return;

  // Vérifier doublon
  var existing = findContactByEmail_(sheet, contact.email);
  if (existing) {
    updateContact_(sheet, existing.row, contact);
    return;
  }

  var token = generateUnsubscribeToken_();
  var now = new Date().toISOString();

  sheet.appendRow([
    contact.email,
    contact.prenom || '',
    contact.consent === true || contact.consent === 'true' ? true : false,
    contact.last_purchase || '',
    contact.segment || 'new',
    token,
    now,
    now
  ]);
}

/**
 * Statistiques de la base marketing.
 * @returns {Object}
 */
function getMarketingStats() {
  var sheet = getMarketingSheet_();
  if (!sheet) {
    return { total: 0, consented: 0, unsubscribed: 0, segments: 'N/A' };
  }

  var data = sheet.getDataRange().getValues();
  var total = data.length - 1;
  var consented = 0;
  var segments = {};

  for (var i = 1; i < data.length; i++) {
    if (data[i][2] === true || data[i][2] === 'TRUE') consented++;
    var seg = data[i][4] || 'none';
    segments[seg] = (segments[seg] || 0) + 1;
  }

  var segStr = Object.keys(segments).map(function (k) {
    return k + ': ' + segments[k];
  }).join(', ');

  return {
    total: total,
    consented: consented,
    unsubscribed: total - consented,
    segments: segStr
  };
}

// ============================
// CAMPAGNES EMAIL
// ============================

/**
 * Initie une campagne marketing (demande confirmation Telegram).
 * @param {string} title
 * @param {string} message
 * @param {string} segment
 */
function initiateCampaign(title, message, segment) {
  var contacts = getMarketingContacts(segment);

  if (contacts.length === 0) {
    sendTelegramMessage('\u26A0\uFE0F Aucun contact trouvé pour le segment "' + segment + '"');
    return;
  }

  // Stocker la campagne en attente
  var campaignId = 'c_' + Date.now();
  var campaignData = {
    id: campaignId,
    title: title,
    message: message,
    segment: segment,
    targetCount: contacts.length,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  PropertiesService.getScriptProperties().setProperty(
    'campaign_' + campaignId,
    JSON.stringify(campaignData)
  );

  sendCampaignConfirmation(title, contacts.length, segment, campaignId);
}

/**
 * Exécute l'envoi d'une campagne confirmée.
 * @param {string} campaignId
 */
function executeCampaign(campaignId) {
  var raw = PropertiesService.getScriptProperties().getProperty('campaign_' + campaignId);
  if (!raw) {
    sendTelegramMessage('\u274C Campagne introuvable');
    return;
  }

  var campaign = JSON.parse(raw);
  if (campaign.status !== 'pending') {
    sendTelegramMessage('\u26A0\uFE0F Campagne déjà traitée');
    return;
  }

  campaign.status = 'sending';
  PropertiesService.getScriptProperties().setProperty(
    'campaign_' + campaignId,
    JSON.stringify(campaign)
  );

  var contacts = getMarketingContacts(campaign.segment);
  var sent = 0;
  var errors = 0;
  var batchSize = CONFIG.EMAILS_PER_MINUTE;

  sendTelegramMessage('\uD83D\uDE80 Envoi en cours... ' + contacts.length + ' emails');

  var provider = getActiveProvider();
  var dailyLimit = provider.dailyLimit;

  for (var i = 0; i < contacts.length; i++) {
    if (!checkRateLimit('campaign_send', batchSize)) {
      logEvent('CAMPAIGN_THROTTLED', 'Rate limit hit, pausing...');
      Utilities.sleep(60000);
    }

    try {
      sendCampaignEmail(contacts[i], campaign);
      sent++;
    } catch (e) {
      errors++;
      logEvent('CAMPAIGN_ERROR', 'Failed to send to ' + contacts[i].email + ': ' + e.message);

      if (errors > 10) {
        logEvent('CAMPAIGN_ABORT', 'Too many errors, stopping campaign');
        sendTelegramMessage('\u26A0\uFE0F Campagne arrêtée: trop d\'erreurs (' + errors + ')');
        break;
      }
    }

    // Rate limiting: pause every batchSize emails
    if ((i + 1) % batchSize === 0 && i + 1 < contacts.length) {
      var pauseMs = provider.name === 'sendgrid' ? 10000 : 60000;
      Utilities.sleep(pauseMs);
    }

    if (sent >= dailyLimit) {
      sendTelegramMessage('\u26A0\uFE0F Limite quotidienne ' + provider.name + ' atteinte (' + dailyLimit + ' emails)');
      break;
    }
  }

  campaign.status = 'completed';
  campaign.sent = sent;
  campaign.errors = errors;
  campaign.completedAt = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty(
    'campaign_' + campaignId,
    JSON.stringify(campaign)
  );

  sendTelegramMessage(
    '\u2705 <b>Campagne terminée</b>\n\n'
    + 'Titre: ' + escapeHtml(campaign.title) + '\n'
    + 'Envoyés: ' + sent + '\n'
    + 'Erreurs: ' + errors
  );

  logEvent('CAMPAIGN_DONE', 'Campaign ' + campaignId + ': ' + sent + ' sent, ' + errors + ' errors');

  // Logger dans le Google Sheet
  logCampaignToSheet(campaign);
}

/**
 * Annule une campagne en attente.
 * @param {string} campaignId
 */
function cancelCampaign(campaignId) {
  PropertiesService.getScriptProperties().deleteProperty('campaign_' + campaignId);
  logEvent('CAMPAIGN_CANCELLED', campaignId);
}

// ============================
// DÉSINSCRIPTION (RGPD)
// ============================

/**
 * Traite une demande de désinscription.
 * @param {string} token - Token de désinscription
 * @returns {string} HTML de confirmation
 */
function handleUnsubscribe(token) {
  var sheet = getMarketingSheet_();
  if (!sheet) return buildUnsubscribePage_('error');

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][5] === token) {
      sheet.getRange(i + 1, 3).setValue(false); // consent = false
      sheet.getRange(i + 1, 8).setValue(new Date().toISOString()); // updated_at
      logEvent('UNSUBSCRIBE', data[i][0]);
      return buildUnsubscribePage_('success');
    }
  }

  return buildUnsubscribePage_('not_found');
}

function buildUnsubscribePage_(status) {
  var messages = {
    success: {
      title: 'Désinscription confirmée',
      body: 'Vous avez été retiré de notre liste de diffusion. Vous ne recevrez plus d\'emails marketing.'
    },
    error: {
      title: 'Erreur',
      body: 'Une erreur est survenue. Veuillez réessayer ou nous contacter directement.'
    },
    not_found: {
      title: 'Lien invalide',
      body: 'Ce lien de désinscription n\'est pas valide ou a déjà été utilisé.'
    }
  };

  var msg = messages[status] || messages.error;

  return '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + msg.title + '</title>'
    + '<style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;'
    + 'align-items:center;min-height:100vh;margin:0;background:#f5f5f5;}'
    + '.card{background:white;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);'
    + 'text-align:center;max-width:400px;}</style></head>'
    + '<body><div class="card"><h1>' + msg.title + '</h1>'
    + '<p>' + msg.body + '</p></div></body></html>';
}

// ============================
// UTILITAIRES INTERNES
// ============================

function rowToObject_(headers, row) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = row[i];
  }
  return obj;
}

function getMarketingSheet_() {
  if (!CONFIG.MARKETING_SHEET_ID) return null;
  try {
    var ss = SpreadsheetApp.openById(CONFIG.MARKETING_SHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.MARKETING_SHEET_NAME);
    if (!sheet) {
      sheet = ss.getSheets()[0];
    }
    return sheet;
  } catch (e) {
    logEvent('SHEET_ERROR', 'Cannot open marketing sheet: ' + e.message);
    return null;
  }
}

function findContactByEmail_(sheet, email) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      return { row: i + 1, data: data[i] };
    }
  }
  return null;
}

function updateContact_(sheet, rowNum, contact) {
  if (contact.prenom) sheet.getRange(rowNum, 2).setValue(contact.prenom);
  if (contact.consent !== undefined) sheet.getRange(rowNum, 3).setValue(contact.consent);
  if (contact.last_purchase) sheet.getRange(rowNum, 4).setValue(contact.last_purchase);
  if (contact.segment) sheet.getRange(rowNum, 5).setValue(contact.segment);
  sheet.getRange(rowNum, 8).setValue(new Date().toISOString());
}

function generateUnsubscribeToken_() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var token = '';
  for (var i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
