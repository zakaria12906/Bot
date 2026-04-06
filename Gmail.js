/**
 * Gmail.js — Module de gestion Gmail
 * Scan inbox, gestion des labels, filtrage et envoi de réponses.
 */

/**
 * Scanne la boîte de réception pour les nouveaux emails de support.
 * Appelé par un trigger toutes les 1 minute.
 */
function scanInbox() {
  try {
    ensureLabelsExist_();

    var query = 'is:inbox -label:' + CONFIG.LABELS.PENDING
      + ' -label:' + CONFIG.LABELS.DONE
      + ' -label:' + CONFIG.LABELS.ERROR
      + ' newer_than:1d';

    var threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_SCAN);

    if (threads.length === 0) return;

    logEvent('SCAN', 'Found ' + threads.length + ' new thread(s)');

    var pendingLabel = GmailApp.getUserLabelByName(CONFIG.LABELS.PENDING);

    threads.forEach(function (thread) {
      try {
        var message = thread.getMessages()[thread.getMessageCount() - 1];
        processIncomingEmail_(message, thread, pendingLabel);
      } catch (e) {
        logEvent('SCAN_ERROR', 'Thread processing failed: ' + e.message);
        applyLabel_(thread, CONFIG.LABELS.ERROR);
      }
    });
  } catch (e) {
    logEvent('SCAN_CRITICAL', 'Inbox scan failed: ' + e.message);
    sendTelegramMessage('\u26A0\uFE0F <b>Erreur scan inbox</b>\n' + e.message);
  }
}

/**
 * Traite un email entrant.
 */
function processIncomingEmail_(message, thread, pendingLabel) {
  var sender = message.getFrom();
  var subject = message.getSubject();
  var body = message.getPlainBody();
  var emailId = message.getId();

  // Filtres de sécurité
  if (isIgnoredSender_(sender)) {
    logEvent('FILTERED', 'Ignored sender: ' + sender);
    applyLabel_(thread, CONFIG.LABELS.DONE);
    return;
  }

  if (isAutoReply_(message)) {
    logEvent('FILTERED', 'Auto-reply detected: ' + sender);
    applyLabel_(thread, CONFIG.LABELS.DONE);
    return;
  }

  // Détecter la langue
  var lang = detectLanguage(body);

  // Générer réponse proposée
  var replyData = generateReply(sender, subject, body, lang);

  // Stocker la réponse en attente
  storePendingReply(emailId, {
    sender: sender,
    subject: subject,
    body: body,
    reply: replyData.text,
    lang: lang,
    category: replyData.category,
    threadId: thread.getId(),
    timestamp: new Date().toISOString()
  });

  // Envoyer sur Telegram pour validation
  var telegramText = '<b>\uD83D\uDCE8 Nouveau email support</b>\n\n'
    + '<b>De:</b> ' + escapeHtml(sender) + '\n'
    + '<b>Objet:</b> ' + escapeHtml(subject) + '\n'
    + '<b>Langue:</b> ' + lang + '\n'
    + '<b>Catégorie:</b> ' + replyData.category + '\n\n'
    + '<b>--- Message (extrait) ---</b>\n'
    + escapeHtml(body.substring(0, 300)) + (body.length > 300 ? '...' : '') + '\n\n'
    + '<b>--- Réponse proposée ---</b>\n'
    + escapeHtml(replyData.text);

  sendApprovalRequest(telegramText, emailId);

  // Marquer comme en cours
  thread.addLabel(pendingLabel);

  logEvent('PROCESSED', 'Email from ' + sender + ' — category: ' + replyData.category);
}

/**
 * Envoie la réponse approuvée.
 * @param {string} emailId - ID du message Gmail
 * @returns {boolean} Succès
 */
function sendApprovedReply(emailId) {
  try {
    var pending = getPendingReply(emailId);
    if (!pending) {
      logEvent('SEND_ERROR', 'No pending reply for: ' + emailId);
      return false;
    }

    var message = GmailApp.getMessageById(emailId);
    if (!message) {
      logEvent('SEND_ERROR', 'Message not found: ' + emailId);
      return false;
    }

    message.reply(pending.reply);

    var thread = GmailApp.getThreadById(pending.threadId);
    removeLabel_(thread, CONFIG.LABELS.PENDING);
    applyLabel_(thread, CONFIG.LABELS.DONE);

    removePendingReply(emailId);
    logEvent('SENT', 'Reply sent to ' + pending.sender);
    return true;
  } catch (e) {
    logEvent('SEND_ERROR', 'Failed to send reply: ' + e.message);
    return false;
  }
}

/**
 * Crée un brouillon au lieu d'envoyer directement.
 * @param {string} emailId
 * @returns {boolean} Succès
 */
function createDraftReply(emailId) {
  try {
    var pending = getPendingReply(emailId);
    if (!pending) return false;

    var message = GmailApp.getMessageById(emailId);
    if (!message) return false;

    message.createDraftReply(pending.reply);

    var thread = GmailApp.getThreadById(pending.threadId);
    removeLabel_(thread, CONFIG.LABELS.PENDING);
    applyLabel_(thread, CONFIG.LABELS.DONE);

    removePendingReply(emailId);
    logEvent('DRAFTED', 'Draft created for ' + pending.sender);
    return true;
  } catch (e) {
    logEvent('DRAFT_ERROR', 'Failed to create draft: ' + e.message);
    return false;
  }
}

/**
 * Ignore un email (le marque comme traité sans répondre).
 * @param {string} emailId
 */
function ignoreEmail(emailId) {
  var pending = getPendingReply(emailId);
  if (!pending) return;

  try {
    var thread = GmailApp.getThreadById(pending.threadId);
    removeLabel_(thread, CONFIG.LABELS.PENDING);
    applyLabel_(thread, CONFIG.LABELS.DONE);
  } catch (e) {
    logEvent('IGNORE_ERROR', e.message);
  }

  removePendingReply(emailId);
  logEvent('IGNORED', 'Email from ' + pending.sender + ' ignored');
}

// --- Labels ---

function ensureLabelsExist_() {
  var labelNames = Object.values(CONFIG.LABELS);
  labelNames.forEach(function (name) {
    if (!GmailApp.getUserLabelByName(name)) {
      GmailApp.createLabel(name);
      logEvent('LABEL_CREATED', name);
    }
  });
}

function applyLabel_(thread, labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (label) thread.addLabel(label);
}

function removeLabel_(thread, labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (label) thread.removeLabel(label);
}

// --- Filtres de sécurité ---

function isIgnoredSender_(sender) {
  var senderLower = sender.toLowerCase();
  return CONFIG.IGNORED_SENDERS.some(function (pattern) {
    return senderLower.indexOf(pattern) !== -1;
  });
}

function isAutoReply_(message) {
  var headers = message.getHeader('Auto-Submitted');
  if (headers && headers !== 'no') return true;

  var precedence = message.getHeader('Precedence');
  if (precedence && (precedence === 'bulk' || precedence === 'junk' || precedence === 'auto_reply')) return true;

  return false;
}

// --- Stockage temporaire (Script Properties) ---

function storePendingReply(emailId, data) {
  var store = PropertiesService.getScriptProperties();
  store.setProperty('pending_' + emailId, JSON.stringify(data));
}

function getPendingReply(emailId) {
  var store = PropertiesService.getScriptProperties();
  var raw = store.getProperty('pending_' + emailId);
  return raw ? JSON.parse(raw) : null;
}

function removePendingReply(emailId) {
  var store = PropertiesService.getScriptProperties();
  store.deleteProperty('pending_' + emailId);
}
