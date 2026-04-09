/**
 * EmailProvider.js — Smart Email Provider Switching (Phase 4)
 * Auto-detects quota limits and routes emails through Gmail or SendGrid.
 * Provides a unified API for both support and marketing emails.
 */

// ============================
// PROVIDER DETECTION & ROUTING
// ============================

/**
 * Returns the currently active email provider and its status.
 * @returns {Object} {name, mode, dailyLimit, usedToday, available}
 */
function getActiveProvider() {
  var mode = CONFIG.EMAIL_PROVIDER || 'auto';
  var stats = getTodayStats();
  var quotaUsed = stats.approved + (stats.campaignsSent * 50);

  if (mode === 'sendgrid' && CONFIG.SENDGRID_API_KEY) {
    return {
      name: 'sendgrid',
      mode: 'forced',
      dailyLimit: getSendGridDailyLimit_(),
      usedToday: quotaUsed,
      available: true
    };
  }

  if (mode === 'gmail' || !CONFIG.SENDGRID_API_KEY) {
    return {
      name: 'gmail',
      mode: CONFIG.SENDGRID_API_KEY ? 'forced' : 'only',
      dailyLimit: CONFIG.MAX_EMAILS_PER_DAY,
      usedToday: quotaUsed,
      available: true
    };
  }

  // Auto mode: check Gmail quota and switch if needed
  var gmailRemaining = CONFIG.MAX_EMAILS_PER_DAY - quotaUsed;
  if (gmailRemaining < 50 && CONFIG.SENDGRID_API_KEY) {
    return {
      name: 'sendgrid',
      mode: 'auto-fallback',
      dailyLimit: getSendGridDailyLimit_(),
      usedToday: quotaUsed,
      available: true,
      reason: 'Gmail quota low (' + gmailRemaining + ' remaining)'
    };
  }

  return {
    name: 'gmail',
    mode: 'auto',
    dailyLimit: CONFIG.MAX_EMAILS_PER_DAY,
    usedToday: quotaUsed,
    available: true
  };
}

/**
 * Sends a marketing email through the active provider.
 * Handles the routing logic transparently.
 * @param {Object} contact - Contact from marketing database
 * @param {Object} campaign - Campaign data
 * @returns {boolean} Success
 */
function sendCampaignEmail(contact, campaign) {
  var unsubscribeUrl = getWebAppUrl() + '?action=unsubscribe&token=' + contact.unsubscribe_token;
  var provider = getActiveProvider();

  if (provider.name === 'sendgrid') {
    var result = sendMarketingViaSendGrid(contact, campaign, unsubscribeUrl);
    if (result.success) return true;

    // Fallback to Gmail if SendGrid fails and Gmail is still available
    if (provider.mode === 'auto-fallback') {
      logEvent('PROVIDER_FALLBACK', 'SendGrid failed, trying Gmail for ' + contact.email);
    } else {
      return false;
    }
  }

  // Gmail path
  sendMarketingViaGmail_(contact, campaign, unsubscribeUrl);
  return true;
}

/**
 * Sends a support reply through the active provider.
 * For support, Gmail is preferred (in-thread replies). SendGrid only for quota overflow.
 * @param {GmailMessage} message - Original Gmail message
 * @param {string} replyText - Reply text
 * @param {string} [htmlReply] - HTML version (optional)
 * @returns {boolean} Success
 */
function sendSupportReply(message, replyText, htmlReply) {
  var provider = getActiveProvider();

  // For support, prefer Gmail to keep thread context
  var stats = getTodayStats();
  var gmailAvailable = (stats.approved < CONFIG.MAX_EMAILS_PER_DAY);

  if (gmailAvailable) {
    if (htmlReply) {
      message.reply(replyText, { htmlBody: htmlReply });
    } else {
      message.reply(replyText);
    }
    return true;
  }

  // Gmail quota exhausted — use SendGrid as standalone email
  if (CONFIG.SENDGRID_API_KEY) {
    var sender = message.getFrom();
    var senderEmail = sender.match(/<([^>]+)>/) ? sender.match(/<([^>]+)>/)[1] : sender.trim();
    var subject = 'Re: ' + message.getSubject();

    var result = sendViaSendGrid({
      to: senderEmail,
      subject: subject,
      textBody: replyText,
      htmlBody: htmlReply || '',
      replyTo: CONFIG.SUPPORT_EMAIL
    });

    if (result.success) {
      logEvent('PROVIDER_SENDGRID', 'Support reply sent via SendGrid to ' + senderEmail);
      return true;
    }
  }

  logEvent('PROVIDER_ERROR', 'All providers exhausted, cannot send reply');
  return false;
}

// ============================
// INTERNAL HELPERS
// ============================

function sendMarketingViaGmail_(contact, campaign, unsubscribeUrl) {
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

  GmailApp.sendEmail(contact.email, campaign.title, campaign.message, {
    htmlBody: htmlBody,
    name: CONFIG.SUPPORT_EMAIL ? CONFIG.SUPPORT_EMAIL.split('@')[0] : 'Digital Products',
    noReply: false
  });
}

function getSendGridDailyLimit_() {
  var limits = {
    'free': 100,
    'essentials': 50000,
    'pro': 100000,
    'premier': 300000
  };
  return limits[CONFIG.SENDGRID_PLAN] || 100;
}
