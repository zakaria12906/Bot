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

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();

  if (code === 429) {
    logEvent('SHOPIFY_RATE_LIMIT', 'Rate limited, waiting...');
    Utilities.sleep(2000);
    response = UrlFetchApp.fetch(url, options);
  }

  if (response.getResponseCode() !== 200) {
    throw new Error('Shopify API returned ' + response.getResponseCode());
  }

  return JSON.parse(response.getContentText());
}
