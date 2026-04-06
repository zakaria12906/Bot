/**
 * Rules.js — Moteur de règles métier Shopify (Phase 2)
 * Gère automatiquement les cas support selon le contexte commande.
 */

/**
 * Analyse un email et applique les règles métier Shopify.
 * Retourne une action recommandée et un contexte enrichi.
 * @param {string} sender - Expéditeur
 * @param {string} subject - Objet
 * @param {string} body - Corps du message
 * @param {string} lang - Langue détectée
 * @returns {Object} {action, context, enrichedReply}
 */
function applyBusinessRules(sender, subject, body, lang) {
  var text = (subject + ' ' + body).toLowerCase();
  var orderNumber = extractOrderNumber(subject + ' ' + body);
  var result = {
    action: 'manual_review',
    context: {},
    enrichedReply: null,
    shopifyData: null,
    ruleApplied: 'none'
  };

  // Règle 0: Spam détecté → flag et skip
  if (isSpamEmail_(text)) {
    result.action = 'flag_spam';
    result.ruleApplied = 'spam_detection';
    result.context = { reason: 'Spam patterns detected' };
    return result;
  }

  // Règle 1: Pas de numéro de commande → demander info
  if (!orderNumber && needsOrderNumber_(text)) {
    result.action = 'request_order_number';
    result.ruleApplied = 'missing_order_number';
    result.enrichedReply = getBusinessTemplate_('request_order_number', lang, {});
    return result;
  }

  // Règle 2: Numéro de commande trouvé → lookup Shopify
  if (orderNumber && CONFIG.SHOPIFY_TOKEN) {
    var order = lookupOrder(orderNumber);

    if (!order) {
      // Commande introuvable → essayer par email
      var emailOrders = lookupOrdersByEmail(sender);
      if (emailOrders && emailOrders.length > 0) {
        result.action = 'order_mismatch';
        result.ruleApplied = 'order_not_found_but_email_matched';
        result.context = {
          requestedOrder: orderNumber,
          foundOrders: emailOrders.map(function (o) { return o.name; })
        };
        result.enrichedReply = getBusinessTemplate_('order_not_found_suggest', lang, {
          orderNumber: orderNumber,
          suggestedOrders: emailOrders.map(function (o) { return o.name; }).join(', ')
        });
        return result;
      }

      // Commande vraiment introuvable
      result.action = 'order_not_found';
      result.ruleApplied = 'order_not_found';
      result.enrichedReply = getBusinessTemplate_('order_not_found', lang, { orderNumber: orderNumber });
      return result;
    }

    result.shopifyData = order;

    // Règle 3: Produit digital → vérifier fulfillment
    if (isDigitalOrder(order)) {
      return applyDigitalRules_(order, text, lang, result);
    }

    // Règle 4: Commande physique → vérifier statut livraison
    return applyPhysicalRules_(order, text, lang, result);
  }

  // Règle 5: Email sans contexte commande → réponse générique
  result.action = 'generic_support';
  result.ruleApplied = 'no_order_context';
  return result;
}

// ============================
// RÈGLES PRODUITS DIGITAUX
// ============================

function applyDigitalRules_(order, text, lang, result) {
  // Cas: Lien non reçu
  if (hasKeywords_(text, ['lien', 'link', 'download', 'téléchargement', 'accès', 'access', 'pas reçu', 'not received'])) {
    if (order.fulfillmentStatus === 'fulfilled') {
      result.action = 'resend_digital_link';
      result.ruleApplied = 'digital_fulfilled_link_issue';
      result.enrichedReply = getBusinessTemplate_('digital_resend_link', lang, {
        orderNumber: order.name,
        customerName: order.customerName
      });
    } else {
      result.action = 'digital_not_fulfilled';
      result.ruleApplied = 'digital_not_fulfilled';
      result.enrichedReply = getBusinessTemplate_('digital_processing', lang, {
        orderNumber: order.name,
        customerName: order.customerName
      });
    }
    return result;
  }

  // Cas: Mauvais email
  if (hasKeywords_(text, ['mauvais email', 'wrong email', 'erreur email', 'email incorrect', 'pas le bon email'])) {
    result.action = 'wrong_email_digital';
    result.ruleApplied = 'digital_wrong_email';
    result.enrichedReply = getBusinessTemplate_('digital_wrong_email', lang, {
      orderNumber: order.name,
      customerEmail: order.customerEmail
    });
    return result;
  }

  // Cas: Remboursement produit digital
  if (hasKeywords_(text, ['remboursement', 'refund', 'rembourser', 'money back'])) {
    result.action = 'refund_digital';
    result.ruleApplied = 'digital_refund_request';
    result.enrichedReply = getBusinessTemplate_('digital_refund_policy', lang, {
      orderNumber: order.name,
      totalPrice: order.totalPrice + ' ' + order.currency
    });
    return result;
  }

  // Cas par défaut digital
  result.action = 'digital_general';
  result.ruleApplied = 'digital_general';
  result.enrichedReply = getBusinessTemplate_('digital_status', lang, {
    orderNumber: order.name,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus
  });
  return result;
}

// ============================
// RÈGLES PRODUITS PHYSIQUES
// ============================

function applyPhysicalRules_(order, text, lang, result) {
  // Cas: Suivi de livraison
  if (hasKeywords_(text, ['suivi', 'tracking', 'livraison', 'delivery', 'colis', 'package', 'expédié', 'shipped'])) {
    if (order.fulfillmentStatus === 'fulfilled' && order.trackingUrl) {
      result.action = 'provide_tracking';
      result.ruleApplied = 'physical_tracking_available';
      result.enrichedReply = getBusinessTemplate_('physical_tracking', lang, {
        orderNumber: order.name,
        trackingUrl: order.trackingUrl
      });
    } else if (order.fulfillmentStatus === 'unfulfilled') {
      result.action = 'order_processing';
      result.ruleApplied = 'physical_not_shipped';
      result.enrichedReply = getBusinessTemplate_('physical_processing', lang, {
        orderNumber: order.name
      });
    } else {
      result.action = 'partial_fulfillment';
      result.ruleApplied = 'physical_partial';
      result.enrichedReply = getBusinessTemplate_('physical_partial', lang, {
        orderNumber: order.name,
        fulfillmentStatus: order.fulfillmentStatus
      });
    }
    return result;
  }

  // Cas: Statut commande général
  result.action = 'order_status';
  result.ruleApplied = 'physical_status';
  result.enrichedReply = getBusinessTemplate_('order_status_detail', lang, {
    orderNumber: order.name,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    totalPrice: order.totalPrice + ' ' + order.currency
  });
  return result;
}

// ============================
// DÉTECTION SPAM
// ============================

function isSpamEmail_(text) {
  var spamPatterns = [
    /you('ve| have) won/i,
    /lottery/i,
    /nigerian prince/i,
    /wire transfer/i,
    /bitcoin.*invest/i,
    /crypto.*profit/i,
    /click here.*claim/i,
    /urgent.*transfer/i,
    /million.*dollar/i,
    /inheritance.*fund/i
  ];
  return spamPatterns.some(function (p) { return p.test(text); });
}

function needsOrderNumber_(text) {
  return hasKeywords_(text, [
    'commande', 'order', 'achat', 'purchase', 'livraison', 'delivery',
    'produit', 'product', 'reçu', 'received', 'lien', 'link', 'download'
  ]);
}

// ============================
// TEMPLATES MÉTIER
// ============================

function getBusinessTemplate_(key, lang, vars) {
  var templates = {
    // --- Demande numéro commande ---
    request_order_number_fr:
      'Bonjour {customerName},\n\n'
      + 'Merci de nous avoir contactés.\n\n'
      + 'Pour pouvoir traiter votre demande, pourriez-vous nous communiquer '
      + 'votre numéro de commande ? Vous le trouverez dans l\'email de confirmation '
      + 'd\'achat.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    request_order_number_en:
      'Hi {customerName},\n\n'
      + 'Thank you for reaching out.\n\n'
      + 'To process your request, could you please provide your order number? '
      + 'You can find it in your purchase confirmation email.\n\n'
      + 'Best regards,\nSupport Team',

    // --- Commande introuvable ---
    order_not_found_fr:
      'Bonjour,\n\n'
      + 'Nous n\'avons pas trouvé la commande #{orderNumber} dans notre système.\n\n'
      + 'Pourriez-vous vérifier le numéro et nous le renvoyer ? '
      + 'Il se trouve dans votre email de confirmation d\'achat.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    order_not_found_en:
      'Hi,\n\n'
      + 'We couldn\'t find order #{orderNumber} in our system.\n\n'
      + 'Could you double-check the number and send it again? '
      + 'You\'ll find it in your purchase confirmation email.\n\n'
      + 'Best regards,\nSupport Team',

    // --- Commande introuvable mais email matché ---
    order_not_found_suggest_fr:
      'Bonjour,\n\n'
      + 'Nous n\'avons pas trouvé la commande #{orderNumber}.\n\n'
      + 'Cependant, nous avons trouvé les commandes suivantes associées à votre adresse email : '
      + '{suggestedOrders}\n\n'
      + 'S\'agit-il de l\'une d\'entre elles ?\n\n'
      + 'Cordialement,\nL\'équipe Support',

    order_not_found_suggest_en:
      'Hi,\n\n'
      + 'We couldn\'t find order #{orderNumber}.\n\n'
      + 'However, we found the following orders associated with your email: '
      + '{suggestedOrders}\n\n'
      + 'Is it one of these?\n\n'
      + 'Best regards,\nSupport Team',

    // --- Digital: Renvoi lien ---
    digital_resend_link_fr:
      'Bonjour {customerName},\n\n'
      + 'Votre commande #{orderNumber} a bien été traitée.\n\n'
      + 'Nous allons vous renvoyer le lien de téléchargement dans un email séparé. '
      + 'Pensez à vérifier vos spams si vous ne le recevez pas dans les prochaines minutes.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    digital_resend_link_en:
      'Hi {customerName},\n\n'
      + 'Your order #{orderNumber} has been processed.\n\n'
      + 'We\'re resending your download link in a separate email. '
      + 'Please check your spam folder if you don\'t receive it within the next few minutes.\n\n'
      + 'Best regards,\nSupport Team',

    // --- Digital: En cours de traitement ---
    digital_processing_fr:
      'Bonjour {customerName},\n\n'
      + 'Votre commande #{orderNumber} est en cours de traitement.\n\n'
      + 'Le lien de téléchargement vous sera envoyé dès que la commande sera finalisée. '
      + 'Cela ne devrait pas prendre plus de quelques heures.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    digital_processing_en:
      'Hi {customerName},\n\n'
      + 'Your order #{orderNumber} is being processed.\n\n'
      + 'The download link will be sent as soon as the order is finalized. '
      + 'This shouldn\'t take more than a few hours.\n\n'
      + 'Best regards,\nSupport Team',

    // --- Digital: Mauvais email ---
    digital_wrong_email_fr:
      'Bonjour,\n\n'
      + 'Pour votre commande #{orderNumber}, le lien a été envoyé à l\'adresse : {customerEmail}\n\n'
      + 'Si ce n\'est pas la bonne adresse, veuillez nous indiquer l\'email correct '
      + 'et nous renverrons le lien immédiatement.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    digital_wrong_email_en:
      'Hi,\n\n'
      + 'For your order #{orderNumber}, the link was sent to: {customerEmail}\n\n'
      + 'If that\'s not the right address, please provide the correct email '
      + 'and we\'ll resend the link right away.\n\n'
      + 'Best regards,\nSupport Team',

    // --- Digital: Politique remboursement ---
    digital_refund_policy_fr:
      'Bonjour,\n\n'
      + 'Nous avons bien reçu votre demande de remboursement pour la commande #{orderNumber} '
      + '({totalPrice}).\n\n'
      + 'Conformément à notre politique pour les produits digitaux, nous allons examiner '
      + 'votre demande dans un délai de 48h.\n\n'
      + 'Veuillez noter que les produits digitaux déjà téléchargés peuvent être soumis '
      + 'à des conditions spécifiques de remboursement.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    digital_refund_policy_en:
      'Hi,\n\n'
      + 'We\'ve received your refund request for order #{orderNumber} ({totalPrice}).\n\n'
      + 'Per our digital products policy, we\'ll review your request within 48 hours.\n\n'
      + 'Please note that already downloaded digital products may be subject '
      + 'to specific refund conditions.\n\n'
      + 'Best regards,\nSupport Team',

    // --- Digital: Statut ---
    digital_status_fr:
      'Bonjour,\n\n'
      + 'Voici le statut de votre commande #{orderNumber} :\n'
      + '- Paiement : {status}\n'
      + '- Livraison digitale : {fulfillmentStatus}\n\n'
      + 'N\'hésitez pas si vous avez besoin d\'autre chose.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    digital_status_en:
      'Hi,\n\n'
      + 'Here\'s the status of your order #{orderNumber}:\n'
      + '- Payment: {status}\n'
      + '- Digital delivery: {fulfillmentStatus}\n\n'
      + 'Let us know if you need anything else.\n\n'
      + 'Best regards,\nSupport Team',

    // --- Physique: Tracking disponible ---
    physical_tracking_fr:
      'Bonjour,\n\n'
      + 'Votre commande #{orderNumber} a été expédiée !\n\n'
      + 'Vous pouvez suivre votre colis ici : {trackingUrl}\n\n'
      + 'Cordialement,\nL\'équipe Support',

    physical_tracking_en:
      'Hi,\n\n'
      + 'Your order #{orderNumber} has been shipped!\n\n'
      + 'You can track your package here: {trackingUrl}\n\n'
      + 'Best regards,\nSupport Team',

    // --- Physique: En préparation ---
    physical_processing_fr:
      'Bonjour,\n\n'
      + 'Votre commande #{orderNumber} est en cours de préparation.\n\n'
      + 'Vous recevrez un email avec le numéro de suivi dès qu\'elle sera expédiée.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    physical_processing_en:
      'Hi,\n\n'
      + 'Your order #{orderNumber} is being prepared.\n\n'
      + 'You\'ll receive a tracking email as soon as it ships.\n\n'
      + 'Best regards,\nSupport Team',

    // --- Physique: Partiellement expédié ---
    physical_partial_fr:
      'Bonjour,\n\n'
      + 'Votre commande #{orderNumber} a été partiellement expédiée.\n'
      + 'Statut actuel : {fulfillmentStatus}\n\n'
      + 'Le reste de votre commande sera expédié prochainement.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    physical_partial_en:
      'Hi,\n\n'
      + 'Your order #{orderNumber} has been partially shipped.\n'
      + 'Current status: {fulfillmentStatus}\n\n'
      + 'The rest of your order will be shipped soon.\n\n'
      + 'Best regards,\nSupport Team',

    // --- Statut commande détaillé ---
    order_status_detail_fr:
      'Bonjour,\n\n'
      + 'Voici les détails de votre commande #{orderNumber} :\n'
      + '- Paiement : {status}\n'
      + '- Expédition : {fulfillmentStatus}\n'
      + '- Montant : {totalPrice}\n\n'
      + 'N\'hésitez pas si vous avez d\'autres questions.\n\n'
      + 'Cordialement,\nL\'équipe Support',

    order_status_detail_en:
      'Hi,\n\n'
      + 'Here are the details for your order #{orderNumber}:\n'
      + '- Payment: {status}\n'
      + '- Shipping: {fulfillmentStatus}\n'
      + '- Total: {totalPrice}\n\n'
      + 'Feel free to reach out if you have more questions.\n\n'
      + 'Best regards,\nSupport Team'
  };

  var templateKey = key + '_' + lang;
  var template = templates[templateKey] || templates[key + '_fr'] || '';

  // Remplacer les variables
  Object.keys(vars).forEach(function (v) {
    template = template.replace(new RegExp('\\{' + v + '\\}', 'g'), vars[v] || '');
  });

  return template;
}
