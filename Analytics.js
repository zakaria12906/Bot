/**
 * Analytics.js — Campaign Analytics & Tracking (Phase 4)
 * Tracking pixel (opens), redirect links (clicks), campaign stats reporting.
 */

// ============================
// TRACKING ENDPOINTS
// ============================

/**
 * Generates a tracking pixel URL for email open detection.
 * To be embedded as <img> in marketing emails.
 * @param {string} campaignId
 * @param {string} contactEmail
 * @returns {string} Tracking pixel URL
 */
function getTrackingPixelUrl(campaignId, contactEmail) {
  var token = Utilities.base64Encode(contactEmail);
  return getWebAppUrl()
    + '?action=track_open&cid=' + encodeURIComponent(campaignId)
    + '&t=' + encodeURIComponent(token);
}

/**
 * Generates a tracked redirect URL for click tracking.
 * @param {string} campaignId
 * @param {string} contactEmail
 * @param {string} destinationUrl - The actual URL the user should reach
 * @returns {string} Redirect URL
 */
function getTrackedLinkUrl(campaignId, contactEmail, destinationUrl) {
  var token = Utilities.base64Encode(contactEmail);
  return getWebAppUrl()
    + '?action=track_click&cid=' + encodeURIComponent(campaignId)
    + '&t=' + encodeURIComponent(token)
    + '&url=' + encodeURIComponent(destinationUrl);
}

/**
 * Handles tracking pixel requests (called from doGet).
 * Returns a 1x1 transparent GIF.
 * @param {string} campaignId
 * @param {string} token - Base64-encoded email
 */
function handleTrackOpen(campaignId, token) {
  try {
    var email = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    recordAnalyticsEvent_(campaignId, email, 'open');
  } catch (e) {
    logEvent('ANALYTICS_ERROR', 'Track open failed: ' + e.message);
  }

  // Apps Script cannot serve binary; return minimal valid response.
  // The tracking event is already recorded above on request.
  return HtmlService.createHtmlOutput('');
}

/**
 * Handles tracked link click requests (called from doGet).
 * Records the click then redirects to the actual destination.
 * @param {string} campaignId
 * @param {string} token - Base64-encoded email
 * @param {string} destinationUrl - Where to redirect
 * @returns {HtmlOutput} Redirect page
 */
function handleTrackClick(campaignId, token, destinationUrl) {
  try {
    var email = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    recordAnalyticsEvent_(campaignId, email, 'click');
  } catch (e) {
    logEvent('ANALYTICS_ERROR', 'Track click failed: ' + e.message);
  }

  var safeUrl = sanitizeUrl_(destinationUrl);
  return HtmlService.createHtmlOutput(
    '<html><head><meta http-equiv="refresh" content="0;url=' + safeUrl + '">'
    + '</head><body>Redirecting...</body></html>'
  );
}

// ============================
// ANALYTICS DATA STORAGE
// ============================

/**
 * Records an analytics event (open or click) in the Google Sheet.
 * @param {string} campaignId
 * @param {string} email
 * @param {string} eventType - 'open' or 'click'
 */
function recordAnalyticsEvent_(campaignId, email, eventType) {
  if (!CONFIG.MARKETING_SHEET_ID) return;

  try {
    var ss = SpreadsheetApp.openById(CONFIG.MARKETING_SHEET_ID);
    var sheet = ss.getSheetByName('Analytics');

    if (!sheet) {
      sheet = ss.insertSheet('Analytics');
      sheet.getRange(1, 1, 1, 5).setValues([['timestamp', 'campaign_id', 'email', 'event', 'details']]);
      var headerRange = sheet.getRange(1, 1, 1, 5);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#27ae60');
      headerRange.setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date().toISOString(),
      campaignId,
      email,
      eventType,
      ''
    ]);

    // Cap at 10000 rows
    var totalRows = sheet.getLastRow();
    if (totalRows > 10100) {
      sheet.deleteRows(2, totalRows - 10000);
    }
  } catch (e) {
    // Silent fail to avoid blocking tracking pixel response
  }
}

/**
 * Gets analytics summary for a specific campaign.
 * @param {string} campaignId
 * @returns {Object} {opens, uniqueOpens, clicks, uniqueClicks, openRate, clickRate}
 */
function getCampaignAnalytics(campaignId) {
  var result = {
    opens: 0,
    uniqueOpens: 0,
    clicks: 0,
    uniqueClicks: 0,
    openRate: 0,
    clickRate: 0,
    totalSent: 0
  };

  if (!CONFIG.MARKETING_SHEET_ID) return result;

  try {
    var ss = SpreadsheetApp.openById(CONFIG.MARKETING_SHEET_ID);
    var analyticsSheet = ss.getSheetByName('Analytics');
    if (!analyticsSheet || analyticsSheet.getLastRow() <= 1) return result;

    var data = analyticsSheet.getDataRange().getValues();
    var openEmails = {};
    var clickEmails = {};

    for (var i = 1; i < data.length; i++) {
      if (data[i][1] !== campaignId) continue;

      var email = data[i][2];
      var event = data[i][3];

      if (event === 'open') {
        result.opens++;
        openEmails[email] = true;
      } else if (event === 'click') {
        result.clicks++;
        clickEmails[email] = true;
      }
    }

    result.uniqueOpens = Object.keys(openEmails).length;
    result.uniqueClicks = Object.keys(clickEmails).length;

    // Get total sent from campaign data
    var campaignsSheet = ss.getSheetByName('Campagnes');
    if (campaignsSheet) {
      var campData = campaignsSheet.getDataRange().getValues();
      for (var j = 1; j < campData.length; j++) {
        if (campData[j][0] === campaignId) {
          result.totalSent = campData[j][3] || 0;
          break;
        }
      }
    }

    if (result.totalSent > 0) {
      result.openRate = Math.round(result.uniqueOpens / result.totalSent * 100);
      result.clickRate = Math.round(result.uniqueClicks / result.totalSent * 100);
    }

    return result;
  } catch (e) {
    logEvent('ANALYTICS_ERROR', 'getCampaignAnalytics failed: ' + e.message);
    return result;
  }
}

/**
 * Formats campaign analytics for Telegram display.
 * @param {string} campaignId
 * @returns {string} Formatted text
 */
function formatCampaignAnalytics(campaignId) {
  var stats = getCampaignAnalytics(campaignId);

  return '<b>\uD83D\uDCCA Analytics campagne</b>\n'
    + 'ID: <code>' + campaignId + '</code>\n\n'
    + '\uD83D\uDCE8 Envoyés: ' + stats.totalSent + '\n'
    + '\uD83D\uDC41 Ouvertures: ' + stats.uniqueOpens + ' (' + stats.openRate + '%)\n'
    + '\uD83D\uDD17 Clics: ' + stats.uniqueClicks + ' (' + stats.clickRate + '%)\n'
    + '\uD83D\uDD01 Total ouvertures: ' + stats.opens + '\n'
    + '\uD83D\uDD01 Total clics: ' + stats.clicks;
}

// ============================
// UTILITIES
// ============================

function sanitizeUrl_(url) {
  if (!url) return '#';
  // Only allow http(s) URLs
  if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
    return '#';
  }
  return url.replace(/[<>"']/g, '');
}
