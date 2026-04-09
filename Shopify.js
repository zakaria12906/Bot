/**
 * Shopify.js — Module d'intégration Shopify Admin API
 * Lookup commandes, vérification statut, fulfillment produits digitaux.
 */

/**
 * Recherche une commande par numéro.
 * @param {string} orderNumber - Numéro de commande
 * @returns {Object|null} Données de la commande
 */
function lookupOrder(orderNumber) {
  if (!CONFIG.SHOPIFY_STORE || !CONFIG.SHOPIFY_TOKEN) {
    logEvent('SHOPIFY_WARN', 'Shopify not configured');
    return null;
  }

  try {
    var url = 'https://' + CONFIG.SHOPIFY_STORE + '/admin/api/'
      + CONFIG.SHOPIFY_API_VERSION + '/orders.json?name=%23' + orderNumber + '&status=any';

    var response = shopifyRequest_(url);
    if (!response || !response.orders || response.orders.length === 0) {
      logEvent('SHOPIFY_INFO', 'Order #' + orderNumber + ' not found');
      return null;
    }

    var order = response.orders[0];
    return parseOrder_(order);
  } catch (e) {
    logEvent('SHOPIFY_ERROR', 'Order lookup failed: ' + e.message);
    return null;
  }
}

/**
 * Recherche une commande par email client.
 * @param {string} email
 * @returns {Object[]|null} Liste des commandes récentes
 */
function lookupOrdersByEmail(email) {
  if (!CONFIG.SHOPIFY_STORE || !CONFIG.SHOPIFY_TOKEN) return null;

  try {
    var cleanEmail = email.match(/<([^>]+)>/);
    var emailAddr = cleanEmail ? cleanEmail[1] : email.trim();

    var url = 'https://' + CONFIG.SHOPIFY_STORE + '/admin/api/'
      + CONFIG.SHOPIFY_API_VERSION + '/orders.json?email=' + encodeURIComponent(emailAddr)
      + '&status=any&limit=5';

    var response = shopifyRequest_(url);
    if (!response || !response.orders) return null;

    return response.orders.map(parseOrder_);
  } catch (e) {
    logEvent('SHOPIFY_ERROR', 'Email lookup failed: ' + e.message);
    return null;
  }
}

/**
 * Vérifie le fulfillment d'une commande spécifique.
 * @param {string} orderId - Shopify order ID
 * @returns {Object|null} Données de fulfillment
 */
function checkFulfillment(orderId) {
  if (!CONFIG.SHOPIFY_STORE || !CONFIG.SHOPIFY_TOKEN) return null;

  try {
    var url = 'https://' + CONFIG.SHOPIFY_STORE + '/admin/api/'
      + CONFIG.SHOPIFY_API_VERSION + '/orders/' + orderId + '/fulfillments.json';

    var response = shopifyRequest_(url);
    if (!response || !response.fulfillments) return null;

    return response.fulfillments.map(function (f) {
      return {
        id: f.id,
        status: f.status,
        trackingNumber: f.tracking_number,
        trackingUrl: f.tracking_url,
        createdAt: f.created_at
      };
    });
  } catch (e) {
    logEvent('SHOPIFY_ERROR', 'Fulfillment check failed: ' + e.message);
    return null;
  }
}

/**
 * Vérifie si une commande contient des produits digitaux.
 * @param {Object} orderData - Données parsées de la commande
 * @returns {boolean}
 */
function isDigitalOrder(orderData) {
  if (!orderData || !orderData.lineItems) return false;
  return orderData.lineItems.some(function (item) {
    return item.requiresShipping === false;
  });
}

/**
 * Génère un résumé Shopify pour Telegram.
 * @param {string} orderNumber
 * @returns {string} Résumé formaté
 */
function getShopifyOrderSummary(orderNumber) {
  var order = lookupOrder(orderNumber);
  if (!order) return 'Commande #' + orderNumber + ' non trouvée dans Shopify.';

  var summary = '\uD83D\uDED2 <b>Commande #' + order.name + '</b>\n'
    + 'Client: ' + escapeHtml(order.customerName) + '\n'
    + 'Email: ' + escapeHtml(order.customerEmail) + '\n'
    + 'Statut: ' + order.status + '\n'
    + 'Fulfillment: ' + order.fulfillmentStatus + '\n'
    + 'Total: ' + order.totalPrice + ' ' + order.currency + '\n'
    + 'Date: ' + order.createdAt + '\n';

  if (order.lineItems.length > 0) {
    summary += '\nProduits:\n';
    order.lineItems.forEach(function (item) {
      summary += '  - ' + escapeHtml(item.title) + ' x' + item.quantity;
      if (!item.requiresShipping) summary += ' [DIGITAL]';
      summary += '\n';
    });
  }

  return summary;
}

// ============================
// SYNC CLIENTS → BASE MARKETING
// ============================

/**
 * Synchronise les emails des acheteurs Shopify récents dans la base marketing.
 * @param {number} [daysBack] - Nombre de jours en arrière (défaut: 30)
 * @returns {Object} {imported, skipped, total}
 */
function syncShopifyCustomers(daysBack) {
  if (!CONFIG.SHOPIFY_STORE || !CONFIG.SHOPIFY_TOKEN) {
    sendTelegramMessage('\u26A0\uFE0F Shopify non configuré. Ajoutez SHOPIFY_STORE et SHOPIFY_TOKEN.');
    return { imported: 0, skipped: 0, total: 0 };
  }

  daysBack = daysBack || 30;
  var sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);
  var sinceIso = sinceDate.toISOString();

  var imported = 0;
  var skipped = 0;
  var total = 0;
  var seenEmails = {};

  sendTelegramMessage('\uD83D\uDD04 Synchronisation Shopify en cours (' + daysBack + ' derniers jours)...');

  try {
    var url = 'https://' + CONFIG.SHOPIFY_STORE + '/admin/api/'
      + CONFIG.SHOPIFY_API_VERSION + '/orders.json?status=any&limit=250'
      + '&created_at_min=' + encodeURIComponent(sinceIso);

    var response = shopifyRequest_(url);
    if (!response || !response.orders) {
      sendTelegramMessage('\u26A0\uFE0F Aucune commande trouvée sur Shopify.');
      return { imported: 0, skipped: 0, total: 0 };
    }

    response.orders.forEach(function (order) {
      if (!order.customer || !order.customer.email) return;

      var email = order.customer.email.toLowerCase().trim();
      if (seenEmails[email]) return;
      seenEmails[email] = true;
      total++;

      if (!isValidEmail(email)) {
        skipped++;
        return;
      }

      try {
        addMarketingContact({
          email: email,
          prenom: order.customer.first_name || '',
          consent: true,
          last_purchase: order.created_at,
          segment: classifyCustomerSegment_(order)
        });
        imported++;
      } catch (e) {
        skipped++;
      }
    });

    sendTelegramMessage(
      '\u2705 <b>Sync Shopify termin\u00e9e</b>\n\n'
      + '\uD83D\uDCE6 Commandes analys\u00e9es: ' + response.orders.length + '\n'
      + '\uD83D\uDC64 Clients uniques: ' + total + '\n'
      + '\u2705 Import\u00e9s/mis \u00e0 jour: ' + imported + '\n'
      + '\u23ED Ignor\u00e9s (doublons/invalides): ' + skipped
    );

    logEvent('SHOPIFY_SYNC', 'Imported: ' + imported + ', Skipped: ' + skipped + ', Total: ' + total);
    return { imported: imported, skipped: skipped, total: total };
  } catch (e) {
    logEvent('SHOPIFY_SYNC_ERROR', e.message);
    sendTelegramMessage('\u274C Erreur sync Shopify: ' + e.message);
    return { imported: imported, skipped: skipped, total: total };
  }
}

/**
 * Détermine le segment d'un client basé sur sa commande.
 */
function classifyCustomerSegment_(order) {
  var total = parseFloat(order.total_price) || 0;
  var ordersCount = (order.customer && order.customer.orders_count) || 1;
  if (total >= 200 || ordersCount >= 5) return 'vip';
  if (ordersCount >= 2) return 'active';
  return 'new';
}

// --- Internals ---

function parseOrder_(order) {
  var fulfillmentStatus = order.fulfillment_status || 'unfulfilled';
  var trackingUrl = '';

  if (order.fulfillments && order.fulfillments.length > 0) {
    var lastFulfillment = order.fulfillments[order.fulfillments.length - 1];
    trackingUrl = lastFulfillment.tracking_url || '';
  }

  return {
    id: order.id,
    name: order.name,
    status: order.financial_status,
    fulfillmentStatus: fulfillmentStatus,
    totalPrice: order.total_price,
    currency: order.currency,
    customerName: order.customer ? (order.customer.first_name + ' ' + order.customer.last_name) : 'N/A',
    customerEmail: order.customer ? order.customer.email : 'N/A',
    createdAt: order.created_at,
    trackingUrl: trackingUrl,
    lineItems: (order.line_items || []).map(function (item) {
      return {
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        requiresShipping: item.requires_shipping
      };
    })
  };
}

function shopifyRequest_(url) {
  var options = {
    method: 'get',
    headers: {
      'X-Shopify-Access-Token': CONFIG.SHOPIFY_TOKEN,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };

  return resilientFetch(url, options);
}
