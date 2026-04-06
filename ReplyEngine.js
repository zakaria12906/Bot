/**
 * ReplyEngine.js — Moteur de réponses automatiques
 * Détection de langue, catégorisation, templates dynamiques.
 */

// --- Détection de langue ---

/**
 * Détecte si un texte est en français ou anglais.
 * @param {string} text
 * @returns {string} 'fr' ou 'en'
 */
function detectLanguage(text) {
  var frenchWords = [
    'bonjour', 'merci', 'commande', 'reçu', 'livraison', 'produit',
    'problème', 'aide', 'svp', 'cordialement', 'madame', 'monsieur',
    'je', 'nous', 'vous', 'est', 'pas', 'pour', 'avec', 'dans',
    'lien', 'téléchargement', 'achat', 'paiement', 'facture',
    'remboursement', 'réclamation', 'délai', 'erreur'
  ];

  var textLower = text.toLowerCase();
  var frenchCount = 0;

  frenchWords.forEach(function (word) {
    if (textLower.indexOf(word) !== -1) {
      frenchCount++;
    }
  });

  return frenchCount >= 3 ? 'fr' : 'en';
}

// --- Catégorisation ---

/**
 * Catégorise un email de support.
 * @param {string} subject
 * @param {string} body
 * @returns {string} Catégorie
 */
function categorizeEmail(subject, body) {
  var text = (subject + ' ' + body).toLowerCase();

  // Ordre de priorité des catégories
  if (hasKeywords_(text, ['spam', 'lottery', 'winner', 'prince', 'bitcoin', 'crypto', 'urgent wire'])) {
    return 'spam';
  }
  if (hasKeywords_(text, ['remboursement', 'refund', 'rembourser', 'money back', 'annuler commande', 'cancel order'])) {
    return 'refund';
  }
  if (hasKeywords_(text, ['lien', 'link', 'téléchargement', 'download', 'accès', 'access', 'fichier', 'file', 'pdf', 'ebook'])) {
    return 'download_link';
  }
  if (hasKeywords_(text, ['mauvais email', 'wrong email', 'erreur email', 'email incorrect', 'pas le bon'])) {
    return 'wrong_email';
  }
  if (hasKeywords_(text, ['commande', 'order', 'numéro', 'number', '#', 'statut', 'status', 'suivi', 'tracking'])) {
    return 'order_status';
  }
  if (hasKeywords_(text, ['reçu', 'received', 'pas reçu', 'not received', 'jamais reçu', 'never got'])) {
    return 'not_received';
  }
  if (hasKeywords_(text, ['facture', 'invoice', 'receipt', 'preuve', 'proof'])) {
    return 'invoice';
  }

  return 'general';
}

function hasKeywords_(text, keywords) {
  return keywords.some(function (kw) {
    return text.indexOf(kw) !== -1;
  });
}

// --- Extraction numéro de commande ---

/**
 * Extrait un numéro de commande depuis le texte.
 * @param {string} text
 * @returns {string|null}
 */
function extractOrderNumber(text) {
  // Patterns: #1234, order 1234, commande 1234, N°1234
  var patterns = [
    /#(\d{3,10})/,
    /order\s*[#:]?\s*(\d{3,10})/i,
    /commande\s*[#:]?\s*(\d{3,10})/i,
    /n°\s*(\d{3,10})/i,
    /numéro\s*[#:]?\s*(\d{3,10})/i
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = text.match(patterns[i]);
    if (match) return match[1];
  }
  return null;
}

// --- Génération de réponse ---

/**
 * Génère une réponse automatique basée sur la catégorie.
 * @param {string} sender
 * @param {string} subject
 * @param {string} body
 * @param {string} lang - 'fr' ou 'en'
 * @returns {Object} {text: string, category: string}
 */
function generateReply(sender, subject, body, lang) {
  var category = categorizeEmail(subject, body);
  var orderNumber = extractOrderNumber(subject + ' ' + body);
  var senderName = extractSenderName_(sender);

  // Lookup Shopify si numéro de commande trouvé
  var shopifyData = null;
  if (orderNumber && CONFIG.SHOPIFY_TOKEN) {
    shopifyData = lookupOrder(orderNumber);
  }

  var template = getTemplate_(category, lang, {
    name: senderName,
    orderNumber: orderNumber,
    shopifyData: shopifyData
  });

  return {
    text: template,
    category: category
  };
}

// --- Templates ---

function getTemplate_(category, lang, data) {
  var templates = getTemplates_();
  var key = category + '_' + lang;

  if (!templates[key]) {
    key = 'general_' + lang;
  }

  var template = templates[key];

  // Remplacement des variables
  template = template.replace(/\{name\}/g, data.name || (lang === 'fr' ? 'Client' : 'Customer'));
  template = template.replace(/\{orderNumber\}/g, data.orderNumber || '(non fourni)');

  if (data.shopifyData) {
    template = template.replace(/\{orderStatus\}/g, data.shopifyData.status || 'inconnu');
    template = template.replace(/\{fulfillmentStatus\}/g, data.shopifyData.fulfillmentStatus || 'en cours');
    template = template.replace(/\{trackingUrl\}/g, data.shopifyData.trackingUrl || '');
  }

  return template;
}

function getTemplates_() {
  return {
    // --- Français ---
    download_link_fr:
      'Bonjour {name},\n\n'
      + 'Merci pour votre achat !\n\n'
      + 'Nous avons bien reçu votre demande concernant le lien de téléchargement. '
      + 'Nous allons vérifier votre commande et vous renvoyer le lien dans les plus brefs délais.\n\n'
      + 'Si vous ne l\'avez pas reçu, pensez à vérifier vos spams.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    wrong_email_fr:
      'Bonjour {name},\n\n'
      + 'Nous comprenons que l\'email utilisé lors de l\'achat n\'est pas le bon.\n\n'
      + 'Pourriez-vous nous confirmer l\'adresse email correcte afin que nous puissions '
      + 'renvoyer votre produit digital ?\n\n'
      + 'Cordialement,\nL\'équipe Support',

    not_received_fr:
      'Bonjour {name},\n\n'
      + 'Nous sommes désolés d\'apprendre que vous n\'avez pas reçu votre produit.\n\n'
      + 'Nous vérifions votre commande #{orderNumber} immédiatement et nous vous recontactons '
      + 'très rapidement avec une solution.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    order_status_fr:
      'Bonjour {name},\n\n'
      + 'Concernant votre commande #{orderNumber} :\n'
      + '- Statut : {orderStatus}\n'
      + '- Livraison : {fulfillmentStatus}\n\n'
      + 'N\'hésitez pas si vous avez d\'autres questions.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    refund_fr:
      'Bonjour {name},\n\n'
      + 'Nous avons bien reçu votre demande de remboursement.\n\n'
      + 'Conformément à notre politique, nous allons examiner votre dossier dans un délai de 48h '
      + 'et vous informer de la décision.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    invoice_fr:
      'Bonjour {name},\n\n'
      + 'Votre demande de facture a bien été reçue.\n\n'
      + 'Nous allons vous l\'envoyer dans les meilleurs délais.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    spam_fr:
      '[SPAM DÉTECTÉ] Cet email semble être du spam. Vérification recommandée avant toute action.',

    general_fr:
      'Bonjour {name},\n\n'
      + 'Merci pour votre message. Nous l\'avons bien reçu et nous allons '
      + 'le traiter dans les plus brefs délais.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    // --- English ---
    download_link_en:
      'Hi {name},\n\n'
      + 'Thank you for your purchase!\n\n'
      + 'We received your request about the download link. '
      + 'We\'re checking your order and will resend the link shortly.\n\n'
      + 'Please also check your spam folder.\n\n'
      + 'Best regards,\nSupport Team',

    wrong_email_en:
      'Hi {name},\n\n'
      + 'We understand the email used during purchase was incorrect.\n\n'
      + 'Could you please confirm the correct email address so we can '
      + 'resend your digital product?\n\n'
      + 'Best regards,\nSupport Team',

    not_received_en:
      'Hi {name},\n\n'
      + 'We\'re sorry to hear you haven\'t received your product.\n\n'
      + 'We\'re checking your order #{orderNumber} right away and will get back to you '
      + 'with a solution very soon.\n\n'
      + 'Best regards,\nSupport Team',

    order_status_en:
      'Hi {name},\n\n'
      + 'Regarding your order #{orderNumber}:\n'
      + '- Status: {orderStatus}\n'
      + '- Fulfillment: {fulfillmentStatus}\n\n'
      + 'Feel free to reach out if you have any other questions.\n\n'
      + 'Best regards,\nSupport Team',

    refund_en:
      'Hi {name},\n\n'
      + 'We\'ve received your refund request.\n\n'
      + 'Per our policy, we will review your case within 48 hours '
      + 'and inform you of the decision.\n\n'
      + 'Best regards,\nSupport Team',

    invoice_en:
      'Hi {name},\n\n'
      + 'Your invoice request has been received.\n\n'
      + 'We will send it to you as soon as possible.\n\n'
      + 'Best regards,\nSupport Team',

    spam_en:
      '[SPAM DETECTED] This email appears to be spam. Verification recommended before any action.',

    general_en:
      'Hi {name},\n\n'
      + 'Thank you for your message. We\'ve received it and will '
      + 'get back to you as soon as possible.\n\n'
      + 'Best regards,\nSupport Team'
  };
}

// --- Utilitaires ---

function extractSenderName_(sender) {
  // "John Doe <john@example.com>" → "John"
  var match = sender.match(/^"?([^"<]+)/);
  if (match) {
    var fullName = match[1].trim();
    return fullName.split(' ')[0];
  }
  return '';
}
