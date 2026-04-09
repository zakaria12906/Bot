/**
 * EmailTemplates.js — Templates HTML pour campagnes marketing
 * Templates responsive, personnalisables, conformes RGPD.
 */

/**
 * Génère un email HTML marketing complet.
 * @param {Object} options
 * @param {string} options.title - Titre de la campagne
 * @param {string} options.preheader - Texte de prévisualisation
 * @param {string} options.heroImage - URL image bannière (optionnel)
 * @param {string} options.body - Corps du message (supporte HTML)
 * @param {string} options.ctaText - Texte du bouton CTA (optionnel)
 * @param {string} options.ctaUrl - URL du bouton CTA (optionnel)
 * @param {string} options.recipientName - Prénom du destinataire
 * @param {string} options.unsubscribeUrl - Lien de désinscription
 * @param {string} options.companyName - Nom de l'entreprise
 * @param {string} [options.template] - Type de template: 'standard', 'promo', 'announcement', 'minimal'
 * @returns {string} HTML complet
 */
function buildMarketingEmail(options) {
  var templateType = options.template || 'standard';
  var colors = getTemplateColors_(templateType);

  return '<!DOCTYPE html>'
    + '<html lang="fr"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    + '<meta http-equiv="X-UA-Compatible" content="IE=edge">'
    + '<title>' + escapeHtml(options.title) + '</title>'
    + '<!--[if mso]><style>table{border-collapse:collapse;}td{font-family:Arial,sans-serif;}</style><![endif]-->'
    + '<style>'
    + getBaseStyles_(colors)
    + '</style></head>'
    + '<body style="margin:0;padding:0;background-color:' + colors.bg + ';">'
    // Preheader invisible
    + '<div style="display:none;max-height:0;overflow:hidden;">'
    + escapeHtml(options.preheader || options.title)
    + '</div>'
    // Container principal
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:' + colors.bg + ';">'
    + '<tr><td align="center" style="padding:20px 10px;">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    // Header
    + buildHeader_(options, colors)
    // Hero image
    + (options.heroImage ? buildHeroImage_(options.heroImage) : '')
    // Body
    + buildBody_(options, colors)
    // CTA Button
    + (options.ctaText && options.ctaUrl ? buildCTA_(options, colors) : '')
    // Footer
    + buildFooter_(options, colors)
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';
}

/**
 * Templates pré-construits pour cas d'usage courants.
 */
var EMAIL_TEMPLATES = {
  /**
   * Template: Promotion / Offre spéciale
   */
  promo: function (vars) {
    return buildMarketingEmail({
      template: 'promo',
      title: vars.title || 'Offre Spéciale',
      preheader: vars.preheader || 'Ne manquez pas cette offre !',
      heroImage: vars.heroImage || '',
      body: '<h2 style="color:#e74c3c;text-align:center;">' + escapeHtml(vars.discount || '-50%') + '</h2>'
        + '<p style="text-align:center;font-size:18px;">' + escapeHtml(vars.message || '') + '</p>'
        + (vars.validUntil ? '<p style="text-align:center;color:#999;font-size:14px;">Valable jusqu\'au ' + escapeHtml(vars.validUntil) + '</p>' : ''),
      ctaText: vars.ctaText || 'En profiter maintenant',
      ctaUrl: vars.ctaUrl || '',
      recipientName: vars.recipientName || '',
      unsubscribeUrl: vars.unsubscribeUrl || '',
      companyName: vars.companyName || ''
    });
  },

  /**
   * Template: Annonce / Nouveauté
   */
  announcement: function (vars) {
    return buildMarketingEmail({
      template: 'announcement',
      title: vars.title || 'Nouveauté',
      preheader: vars.preheader || '',
      heroImage: vars.heroImage || '',
      body: '<p>' + (vars.message || '').replace(/\n/g, '<br>') + '</p>',
      ctaText: vars.ctaText || 'Découvrir',
      ctaUrl: vars.ctaUrl || '',
      recipientName: vars.recipientName || '',
      unsubscribeUrl: vars.unsubscribeUrl || '',
      companyName: vars.companyName || ''
    });
  },

  /**
   * Template: Newsletter simple
   */
  newsletter: function (vars) {
    var articlesHtml = '';
    if (vars.articles && vars.articles.length > 0) {
      vars.articles.forEach(function (article) {
        articlesHtml += '<div style="padding:15px 0;border-bottom:1px solid #eee;">'
          + '<h3 style="margin:0 0 8px 0;color:#333;">' + escapeHtml(article.title) + '</h3>'
          + '<p style="margin:0;color:#666;font-size:14px;">' + escapeHtml(article.summary) + '</p>'
          + (article.url ? '<a href="' + article.url + '" style="color:#3498db;font-size:14px;">Lire la suite →</a>' : '')
          + '</div>';
      });
    }

    return buildMarketingEmail({
      template: 'standard',
      title: vars.title || 'Newsletter',
      preheader: vars.preheader || '',
      body: (vars.intro ? '<p>' + escapeHtml(vars.intro) + '</p>' : '') + articlesHtml,
      recipientName: vars.recipientName || '',
      unsubscribeUrl: vars.unsubscribeUrl || '',
      companyName: vars.companyName || ''
    });
  },

  /**
   * Template: Bienvenue
   */
  welcome: function (vars) {
    return buildMarketingEmail({
      template: 'standard',
      title: 'Bienvenue !',
      preheader: 'Merci de nous avoir rejoint',
      body: '<h2 style="text-align:center;">Bienvenue ' + escapeHtml(vars.recipientName || '') + ' !</h2>'
        + '<p style="text-align:center;font-size:16px;">Merci de nous avoir rejoint. '
        + 'Nous sommes ravis de vous compter parmi nous.</p>'
        + (vars.message ? '<p>' + (vars.message).replace(/\n/g, '<br>') + '</p>' : ''),
      ctaText: vars.ctaText || 'Découvrir nos produits',
      ctaUrl: vars.ctaUrl || '',
      recipientName: vars.recipientName || '',
      unsubscribeUrl: vars.unsubscribeUrl || '',
      companyName: vars.companyName || ''
    });
  },

  /**
   * Template: Relance / Panier abandonné
   */
  cart_reminder: function (vars) {
    return buildMarketingEmail({
      template: 'standard',
      title: 'Vous avez oublié quelque chose ?',
      preheader: 'Votre panier vous attend',
      body: '<h2 style="text-align:center;">Votre panier vous attend</h2>'
        + '<p>Bonjour ' + escapeHtml(vars.recipientName || '') + ',</p>'
        + '<p>Vous avez laissé des articles dans votre panier. '
        + 'Finalisez votre commande avant qu\'ils ne soient plus disponibles !</p>'
        + (vars.items ? buildCartItems_(vars.items) : ''),
      ctaText: 'Finaliser ma commande',
      ctaUrl: vars.ctaUrl || '',
      recipientName: vars.recipientName || '',
      unsubscribeUrl: vars.unsubscribeUrl || '',
      companyName: vars.companyName || ''
    });
  }
};

// ============================
// BUILDERS INTERNES
// ============================

function buildHeader_(options, colors) {
  return '<tr><td style="background-color:' + colors.primary + ';padding:25px 30px;text-align:center;">'
    + '<h1 style="margin:0;color:#ffffff;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;">'
    + escapeHtml(options.companyName || 'Digital Products')
    + '</h1>'
    + '</td></tr>';
}

function buildHeroImage_(imageUrl) {
  return '<tr><td style="padding:0;">'
    + '<img src="' + imageUrl + '" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;">'
    + '</td></tr>';
}

function buildBody_(options, colors) {
  var greeting = options.recipientName
    ? '<p style="font-size:16px;">Bonjour ' + escapeHtml(options.recipientName) + ',</p>'
    : '';

  return '<tr><td style="padding:30px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#333333;">'
    + greeting
    + options.body
    + '</td></tr>';
}

function buildCTA_(options, colors) {
  return '<tr><td style="padding:0 30px 30px;text-align:center;">'
    + '<a href="' + options.ctaUrl + '" style="display:inline-block;padding:14px 30px;'
    + 'background-color:' + colors.cta + ';color:#ffffff;text-decoration:none;'
    + 'font-family:Arial,sans-serif;font-size:16px;font-weight:bold;border-radius:6px;">'
    + escapeHtml(options.ctaText)
    + '</a>'
    + '</td></tr>';
}

function buildFooter_(options, colors) {
  var trackingPixel = '';
  if (options.campaignId && options.recipientEmail) {
    var pixelUrl = getTrackingPixelUrl(options.campaignId, options.recipientEmail);
    trackingPixel = '<img src="' + pixelUrl + '" width="1" height="1" alt="" style="display:none;" />';
  }

  return '<tr><td style="background-color:#f8f8f8;padding:20px 30px;text-align:center;'
    + 'font-family:Arial,sans-serif;font-size:12px;color:#999999;border-top:1px solid #eeeeee;">'
    + '<p style="margin:0 0 10px 0;">' + escapeHtml(options.companyName || 'Digital Products') + '</p>'
    + '<p style="margin:0 0 10px 0;">Vous recevez cet email car vous avez donné votre consentement.</p>'
    + '<p style="margin:0;">'
    + '<a href="' + (options.unsubscribeUrl || '#') + '" style="color:#999999;text-decoration:underline;">Se désinscrire</a>'
    + '</p>'
    + trackingPixel
    + '</td></tr>';
}

function buildCartItems_(items) {
  var html = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:15px 0;">';
  items.forEach(function (item) {
    html += '<tr><td style="padding:10px 0;border-bottom:1px solid #eee;">'
      + '<strong>' + escapeHtml(item.name) + '</strong>'
      + '<span style="float:right;color:#333;">' + escapeHtml(item.price) + '</span>'
      + '</td></tr>';
  });
  html += '</table>';
  return html;
}

// ============================
// STYLES & COULEURS
// ============================

function getTemplateColors_(templateType) {
  var colorSchemes = {
    standard: { primary: '#2c3e50', cta: '#3498db', bg: '#f4f4f4', text: '#333333' },
    promo: { primary: '#e74c3c', cta: '#e74c3c', bg: '#fff5f5', text: '#333333' },
    announcement: { primary: '#8e44ad', cta: '#8e44ad', bg: '#f9f5fc', text: '#333333' },
    minimal: { primary: '#333333', cta: '#333333', bg: '#ffffff', text: '#333333' }
  };
  return colorSchemes[templateType] || colorSchemes.standard;
}

function getBaseStyles_(colors) {
  return 'body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}'
    + 'table{border-spacing:0;}'
    + 'td{padding:0;}'
    + 'img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}'
    + '@media only screen and (max-width:620px){'
    + 'table[role="presentation"]{width:100%!important;}'
    + 'td{padding:10px!important;}'
    + 'h1{font-size:20px!important;}'
    + 'h2{font-size:18px!important;}'
    + '}';
}
