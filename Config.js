/**
 * Config.js — Configuration centralisée
 * Charge les Script Properties et expose les constantes du projet.
 */

const CONFIG = {
  // --- Telegram ---
  TG_TOKEN: PropertiesService.getScriptProperties().getProperty('TG_TOKEN'),
  TG_CHAT_ID: PropertiesService.getScriptProperties().getProperty('TG_CHAT_ID'),
  TG_API: function () {
    return 'https://api.telegram.org/bot' + this.TG_TOKEN;
  },

  // --- Webhook ---
  WEBHOOK_KEY: PropertiesService.getScriptProperties().getProperty('WEBHOOK_KEY'),

  // --- Shopify ---
  SHOPIFY_STORE: PropertiesService.getScriptProperties().getProperty('SHOPIFY_STORE'),
  SHOPIFY_TOKEN: PropertiesService.getScriptProperties().getProperty('SHOPIFY_TOKEN'),
  SHOPIFY_API_VERSION: '2025-01',

  // --- Gmail ---
  SUPPORT_EMAIL: PropertiesService.getScriptProperties().getProperty('SUPPORT_EMAIL'),
  SCAN_INTERVAL_MS: 60000, // 1 minute
  MAX_THREADS_PER_SCAN: 10,

  // --- Labels ---
  LABELS: {
    PENDING: 'DD_BOT_PENDING',
    DONE: 'DD_BOT_DONE',
    ERROR: 'DD_BOT_ERROR',
    MARKETING: 'DD_BOT_MARKETING'
  },

  // --- Marketing ---
  MARKETING_SHEET_ID: PropertiesService.getScriptProperties().getProperty('MARKETING_SHEET_ID'),
  MARKETING_SHEET_NAME: 'Contacts',
  EMAILS_PER_MINUTE: 40,
  MAX_EMAILS_PER_DAY: 450, // marge de sécurité sous la limite de 500

  // --- Produits digitaux (Google Drive) ---
  PRODUCTS_FOLDER_ID: PropertiesService.getScriptProperties().getProperty('PRODUCTS_FOLDER_ID'),

  // --- SendGrid (Phase 4 — Scalabilité) ---
  SENDGRID_API_KEY: PropertiesService.getScriptProperties().getProperty('SENDGRID_API_KEY'),
  SENDGRID_FROM: PropertiesService.getScriptProperties().getProperty('SENDGRID_FROM'),
  SENDGRID_FROM_NAME: PropertiesService.getScriptProperties().getProperty('SENDGRID_FROM_NAME'),
  SENDGRID_PLAN: PropertiesService.getScriptProperties().getProperty('SENDGRID_PLAN') || 'free',

  // Provider mode: 'gmail', 'sendgrid', or 'auto' (auto-switch when Gmail quota is low)
  EMAIL_PROVIDER: PropertiesService.getScriptProperties().getProperty('EMAIL_PROVIDER') || 'auto',

  // --- Sécurité ---
  IGNORED_SENDERS: [
    'noreply@',
    'no-reply@',
    'mailer-daemon@',
    'postmaster@',
    'notifications@',
    'notification@'
  ],
  AUTO_REPLY_HEADERS: [
    'X-Autoreply',
    'X-Autorespond',
    'Auto-Submitted'
  ]
};

/**
 * Valide que toutes les propriétés requises sont configurées.
 * @returns {string[]} Liste des propriétés manquantes
 */
function validateConfig() {
  var required = ['TG_TOKEN', 'TG_CHAT_ID', 'WEBHOOK_KEY'];
  var missing = [];
  required.forEach(function (key) {
    if (!CONFIG[key]) {
      missing.push(key);
    }
  });
  return missing;
}

/**
 * Returns the full configuration status including optional providers.
 * @returns {Object} {core, shopify, sendgrid, marketing}
 */
function getConfigStatus() {
  return {
    core: validateConfig().length === 0,
    shopify: !!(CONFIG.SHOPIFY_STORE && CONFIG.SHOPIFY_TOKEN),
    sendgrid: !!CONFIG.SENDGRID_API_KEY,
    marketing: !!CONFIG.MARKETING_SHEET_ID
  };
}

/**
 * Retourne l'URL de base du webhook déployé.
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}
