/**
 * SendGrid.js — Module d'intégration SendGrid (Phase 4)
 * Provider email scalable pour dépasser les limites Gmail.
 * Supporte l'envoi transactionnel et marketing via l'API v3.
 */

// ============================
// ENVOI VIA SENDGRID
// ============================

/**
 * Envoie un email via SendGrid API v3.
 * @param {Object} options
 * @param {string} options.to - Destinataire
 * @param {string} options.toName - Nom du destinataire (optionnel)
 * @param {string} options.subject - Objet
 * @param {string} options.textBody - Corps texte
 * @param {string} options.htmlBody - Corps HTML (optionnel)
 * @param {string} [options.from] - Expéditeur (défaut: CONFIG.SENDGRID_FROM ou SUPPORT_EMAIL)
 * @param {string} [options.fromName] - Nom expéditeur
 * @param {string} [options.replyTo] - Reply-to
 * @param {Object} [options.headers] - Headers personnalisés
 * @param {Object} [options.trackingSettings] - Paramètres de tracking
 * @returns {Object} {success: boolean, statusCode: number, messageId: string}
 */
function sendViaSendGrid(options) {
  if (!CONFIG.SENDGRID_API_KEY) {
    throw new Error('SendGrid API key not configured');
  }

  var fromEmail = options.from || CONFIG.SENDGRID_FROM || CONFIG.SUPPORT_EMAIL;
  var fromName = options.fromName || CONFIG.SENDGRID_FROM_NAME || fromEmail.split('@')[0];

  var payload = {
    personalizations: [{
      to: [{ email: options.to, name: options.toName || '' }]
    }],
    from: { email: fromEmail, name: fromName },
    subject: options.subject,
    content: []
  };

  if (options.textBody) {
    payload.content.push({ type: 'text/plain', value: options.textBody });
  }
  if (options.htmlBody) {
    payload.content.push({ type: 'text/html', value: options.htmlBody });
  }

  if (options.replyTo) {
    payload.reply_to = { email: options.replyTo };
  }

  if (options.headers) {
    payload.headers = options.headers;
  }

  // Tracking settings
  payload.tracking_settings = options.trackingSettings || {
    click_tracking: { enable: true },
    open_tracking: { enable: true }
  };

  // Unsubscribe group (if marketing)
  if (options.unsubscribeGroupId) {
    payload.asm = { group_id: parseInt(options.unsubscribeGroupId) };
  }

  var url = 'https://api.sendgrid.com/v3/mail/send';
  var fetchOptions = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.SENDGRID_API_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, fetchOptions);
    var statusCode = response.getResponseCode();

    if (statusCode === 202) {
      var messageId = response.getHeaders()['X-Message-Id'] || '';
      logEvent('SENDGRID_SENT', 'Email sent to ' + options.to + ' (ID: ' + messageId + ')');
      return { success: true, statusCode: 202, messageId: messageId };
    }

    if (statusCode === 429) {
      logEvent('SENDGRID_RATE_LIMIT', 'Rate limited, waiting...');
      Utilities.sleep(2000);
      response = UrlFetchApp.fetch(url, fetchOptions);
      statusCode = response.getResponseCode();
      if (statusCode === 202) {
        return { success: true, statusCode: 202, messageId: response.getHeaders()['X-Message-Id'] || '' };
      }
    }

    var errorBody = response.getContentText();
    logEvent('SENDGRID_ERROR', 'Status ' + statusCode + ': ' + errorBody);
    return { success: false, statusCode: statusCode, error: errorBody };
  } catch (e) {
    logEvent('SENDGRID_ERROR', 'Request failed: ' + e.message);
    return { success: false, statusCode: 0, error: e.message };
  }
}

/**
 * Envoie un email marketing via SendGrid avec template HTML.
 * @param {Object} contact - Contact de la base marketing
 * @param {Object} campaign - Données de la campagne
 * @param {string} unsubscribeUrl - Lien de désinscription
 * @returns {Object} Résultat de l'envoi
 */
function sendMarketingViaSendGrid(contact, campaign, unsubscribeUrl) {
  var ctaUrl = campaign.ctaUrl || '';
  if (ctaUrl && campaign.id) {
    ctaUrl = getTrackedLinkUrl(campaign.id, contact.email, ctaUrl);
  }

  var htmlBody = buildMarketingEmail({
    template: campaign.templateType || 'standard',
    title: campaign.title,
    preheader: campaign.preheader || campaign.title,
    heroImage: campaign.heroImage || '',
    body: '<p>' + campaign.message.replace(/\n/g, '<br>') + '</p>',
    ctaText: campaign.ctaText || '',
    ctaUrl: ctaUrl,
    recipientName: contact.prenom || '',
    recipientEmail: contact.email,
    campaignId: campaign.id || '',
    unsubscribeUrl: unsubscribeUrl,
    companyName: CONFIG.SUPPORT_EMAIL ? CONFIG.SUPPORT_EMAIL.split('@')[0] : 'Digital Products'
  });

  return sendViaSendGrid({
    to: contact.email,
    toName: contact.prenom || '',
    subject: campaign.title,
    textBody: campaign.message,
    htmlBody: htmlBody,
    headers: {
      'List-Unsubscribe': '<' + unsubscribeUrl + '>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    },
    trackingSettings: {
      click_tracking: { enable: true },
      open_tracking: { enable: true }
    }
  });
}

// ============================
// SENDGRID STATS & MONITORING
// ============================

/**
 * Récupère les statistiques globales SendGrid.
 * @param {string} [startDate] - Date de début (YYYY-MM-DD), défaut: aujourd'hui
 * @returns {Object|null} Stats SendGrid
 */
function getSendGridStats(startDate) {
  if (!CONFIG.SENDGRID_API_KEY) return null;

  var today = startDate || new Date().toISOString().split('T')[0];

  var url = 'https://api.sendgrid.com/v3/stats?start_date=' + today;
  var options = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.SENDGRID_API_KEY
    },
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) return null;

    var data = JSON.parse(response.getContentText());
    if (!data || data.length === 0) return null;

    var metrics = data[0].stats[0].metrics;
    return {
      requests: metrics.requests || 0,
      delivered: metrics.delivered || 0,
      opens: metrics.opens || 0,
      clicks: metrics.clicks || 0,
      bounces: metrics.bounces || 0,
      spam_reports: metrics.spam_reports || 0,
      blocks: metrics.blocks || 0,
      openRate: metrics.delivered > 0 ? Math.round(metrics.opens / metrics.delivered * 100) : 0,
      clickRate: metrics.delivered > 0 ? Math.round(metrics.clicks / metrics.delivered * 100) : 0
    };
  } catch (e) {
    logEvent('SENDGRID_ERROR', 'Stats fetch failed: ' + e.message);
    return null;
  }
}

/**
 * Vérifie le statut du compte SendGrid (bounces, spam reports).
 * @returns {Object} Santé du compte
 */
function checkSendGridHealth() {
  var stats = getSendGridStats();
  if (!stats) return { status: 'unknown', message: 'Cannot fetch stats' };

  var health = { status: 'ok', warnings: [] };

  if (stats.spam_reports > 0) {
    health.warnings.push(stats.spam_reports + ' spam reports');
  }

  var bounceRate = stats.requests > 0 ? stats.bounces / stats.requests * 100 : 0;
  if (bounceRate > 5) {
    health.warnings.push('High bounce rate: ' + Math.round(bounceRate) + '%');
  }

  if (health.warnings.length > 0) {
    health.status = 'warning';
  }

  health.stats = stats;
  return health;
}
