/**
 * Security.js — Module de sécurité
 * Validation webhook, anti-spam, rate limiting, vérifications DKIM/SPF.
 */

/**
 * Valide la clé webhook dans une requête entrante.
 * @param {Object} e - Événement doGet/doPost
 * @returns {boolean}
 */
function validateWebhookKey(e) {
  if (!CONFIG.WEBHOOK_KEY) return false;
  var key = e.parameter ? e.parameter.key : null;
  return key === CONFIG.WEBHOOK_KEY;
}

/**
 * Vérifie que le callback Telegram provient du bon chat.
 * @param {Object} update - Update Telegram
 * @returns {boolean}
 */
function isAuthorizedTelegramUser(update) {
  var chatId = null;

  if (update.message) {
    chatId = update.message.chat.id.toString();
  } else if (update.callback_query) {
    chatId = update.callback_query.message.chat.id.toString();
  }

  return chatId === CONFIG.TG_CHAT_ID;
}

/**
 * Vérifie les headers anti-spam d'un email.
 * @param {GmailMessage} message
 * @returns {Object} Résultat de l'analyse
 */
function analyzeEmailSecurity(message) {
  var result = {
    isSpam: false,
    spfPass: false,
    dkimPass: false,
    dmarcPass: false,
    warnings: []
  };

  try {
    // Vérifier les headers d'authentification
    var authResults = message.getHeader('Authentication-Results');
    if (authResults) {
      result.spfPass = authResults.indexOf('spf=pass') !== -1;
      result.dkimPass = authResults.indexOf('dkim=pass') !== -1;
      result.dmarcPass = authResults.indexOf('dmarc=pass') !== -1;

      if (!result.spfPass) result.warnings.push('SPF failed');
      if (!result.dkimPass) result.warnings.push('DKIM failed');
      if (!result.dmarcPass) result.warnings.push('DMARC failed');
    }

    // Vérifier X-Spam-Status
    var spamStatus = message.getHeader('X-Spam-Status');
    if (spamStatus && spamStatus.toLowerCase().indexOf('yes') === 0) {
      result.isSpam = true;
      result.warnings.push('Marked as spam by server');
    }

    // Vérifier sender suspect
    var sender = message.getFrom().toLowerCase();
    if (isSuspiciousSender_(sender)) {
      result.warnings.push('Suspicious sender pattern');
    }
  } catch (e) {
    result.warnings.push('Security check error: ' + e.message);
  }

  return result;
}

/**
 * Rate limiter simple pour les actions.
 * @param {string} action - Identifiant de l'action
 * @param {number} maxPerMinute - Limite par minute
 * @returns {boolean} true si autorisé
 */
function checkRateLimit(action, maxPerMinute) {
  var key = 'ratelimit_' + action;
  var now = Date.now();
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  var data = raw ? JSON.parse(raw) : { count: 0, resetAt: now + 60000 };

  if (now > data.resetAt) {
    data = { count: 0, resetAt: now + 60000 };
  }

  if (data.count >= maxPerMinute) {
    logEvent('RATE_LIMIT', 'Rate limit reached for: ' + action);
    return false;
  }

  data.count++;
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(data));
  return true;
}

/**
 * Valide une adresse email.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  var pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * Sanitize une chaîne pour éviter les injections dans les templates.
 * @param {string} input
 * @returns {string}
 */
function sanitizeInput(input) {
  if (!input) return '';
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

// --- Internals ---

function isSuspiciousSender_(sender) {
  var patterns = [
    /\d{5,}@/,           // Beaucoup de chiffres
    /@.*\.(xyz|top|click|loan|win)$/,  // TLDs suspects
    /paypal.*@(?!paypal)/i,  // Fake PayPal
    /support.*@(?!shopify|google|apple)/i  // Fake support
  ];

  return patterns.some(function (p) {
    return p.test(sender);
  });
}
