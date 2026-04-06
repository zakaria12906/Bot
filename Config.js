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
  SHOPIFY_API_VERSION: '2024-01',

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
 * Retourne l'URL de base du webhook déployé.
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}
