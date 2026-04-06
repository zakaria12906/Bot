/**
 * Backup.js — Module de sauvegarde et résilience
 * Backup base contacts, gestion erreurs API, retry logic.
 */

// ============================
// BACKUP BASE CONTACTS
// ============================

/**
 * Crée une copie de sauvegarde de la base marketing.
 * À exécuter via trigger hebdomadaire.
 */
function backupMarketingData() {
  if (!CONFIG.MARKETING_SHEET_ID) {
    logEvent('BACKUP_SKIP', 'No marketing sheet configured');
    return;
  }

  try {
    var source = SpreadsheetApp.openById(CONFIG.MARKETING_SHEET_ID);
    var backupName = 'DD_Bot_Backup_' + Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');

    // Copier le spreadsheet entier
    var backup = source.copy(backupName);
    var backupId = backup.getId();

    // Stocker la référence
    storeBackupReference_(backupId, backupName);

    // Nettoyer les anciens backups (garder les 4 derniers)
    cleanupOldBackups_(4);

    logEvent('BACKUP_OK', 'Backup created: ' + backupName + ' (ID: ' + backupId + ')');
    sendTelegramMessage(
      '\u2705 <b>Backup créé</b>\n\n'
      + 'Nom: ' + backupName + '\n'
      + 'ID: <code>' + backupId + '</code>'
    );
  } catch (e) {
    logEvent('BACKUP_ERROR', 'Backup failed: ' + e.message);
    sendTelegramMessage('\u274C <b>Erreur backup</b>\n' + e.message);
  }
}

/**
 * Restaure la base marketing depuis un backup.
 * @param {string} backupId - ID du Google Sheet de backup
 */
function restoreFromBackup(backupId) {
  try {
    var backup = SpreadsheetApp.openById(backupId);
    var backupSheet = backup.getSheetByName('Contacts');
    if (!backupSheet) {
      sendTelegramMessage('\u274C Backup invalide: onglet Contacts introuvable');
      return;
    }

    var target = SpreadsheetApp.openById(CONFIG.MARKETING_SHEET_ID);
    var targetSheet = target.getSheetByName('Contacts');

    // Sauvegarder l'état actuel avant restauration
    var emergencyBackup = target.copy('DD_Bot_PreRestore_' + Date.now());

    // Effacer les données actuelles (garder headers)
    if (targetSheet.getLastRow() > 1) {
      targetSheet.deleteRows(2, targetSheet.getLastRow() - 1);
    }

    // Copier les données du backup
    var data = backupSheet.getDataRange().getValues();
    if (data.length > 1) {
      targetSheet.getRange(2, 1, data.length - 1, data[0].length).setValues(data.slice(1));
    }

    logEvent('RESTORE_OK', 'Restored from backup: ' + backupId);
    sendTelegramMessage(
      '\u2705 <b>Restauration réussie</b>\n\n'
      + 'Source: <code>' + backupId + '</code>\n'
      + 'Contacts restaurés: ' + (data.length - 1) + '\n'
      + 'Backup pré-restauration: <code>' + emergencyBackup.getId() + '</code>'
    );
  } catch (e) {
    logEvent('RESTORE_ERROR', 'Restore failed: ' + e.message);
    sendTelegramMessage('\u274C <b>Erreur restauration</b>\n' + e.message);
  }
}

// ============================
// BACKUP CONFIGURATION
// ============================

/**
 * Sauvegarde toute la configuration (Script Properties) dans un Sheet.
 */
function backupConfiguration() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var safeProps = {};

  // Exclure les tokens/secrets de la sauvegarde
  var sensitiveKeys = ['TG_TOKEN', 'SHOPIFY_TOKEN', 'WEBHOOK_KEY'];

  Object.keys(props).forEach(function (key) {
    if (sensitiveKeys.indexOf(key) === -1) {
      safeProps[key] = props[key];
    } else {
      safeProps[key] = '***REDACTED***';
    }
  });

  var backupStr = JSON.stringify(safeProps, null, 2);
  PropertiesService.getScriptProperties().setProperty(
    'config_backup_' + new Date().toISOString().split('T')[0],
    backupStr
  );

  logEvent('CONFIG_BACKUP', 'Configuration backed up');
}

// ============================
// RETRY LOGIC & RÉSILIENCE
// ============================

/**
 * Exécute une fonction avec retry et backoff exponentiel.
 * @param {Function} fn - Fonction à exécuter
 * @param {number} maxRetries - Nombre max de tentatives
 * @param {number} baseDelay - Délai initial en ms
 * @returns {*} Résultat de la fonction
 */
function withRetry(fn, maxRetries, baseDelay) {
  maxRetries = maxRetries || 3;
  baseDelay = baseDelay || 1000;

  var lastError;

  for (var attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (e) {
      lastError = e;
      logEvent('RETRY', 'Attempt ' + attempt + '/' + maxRetries + ' failed: ' + e.message);

      if (attempt < maxRetries) {
        var delay = baseDelay * Math.pow(2, attempt - 1);
        Utilities.sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Wrapper résilient pour les appels API externes.
 * @param {string} url
 * @param {Object} options - Options UrlFetchApp
 * @returns {Object} Réponse parsée
 */
function resilientFetch(url, options) {
  return withRetry(function () {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();

    // Rate limiting
    if (code === 429) {
      var retryAfter = response.getHeaders()['Retry-After'] || 5;
      Utilities.sleep(parseInt(retryAfter) * 1000);
      throw new Error('Rate limited, retrying...');
    }

    // Erreurs serveur (retry possible)
    if (code >= 500) {
      throw new Error('Server error: ' + code);
    }

    // Erreurs client (pas de retry)
    if (code >= 400) {
      var error = new Error('Client error: ' + code + ' - ' + response.getContentText());
      error.noRetry = true;
      throw error;
    }

    return JSON.parse(response.getContentText());
  }, 3, 2000);
}

// ============================
// VÉRIFICATION D'INTÉGRITÉ
// ============================

/**
 * Vérifie l'intégrité de la base marketing.
 * Détecte les doublons, emails invalides, données corrompues.
 * @returns {Object} Rapport d'intégrité
 */
function checkDataIntegrity() {
  var sheet = getMarketingSheet_();
  if (!sheet) return { status: 'error', message: 'Sheet not found' };

  var data = sheet.getDataRange().getValues();
  var report = {
    status: 'ok',
    totalRows: data.length - 1,
    duplicates: [],
    invalidEmails: [],
    missingTokens: [],
    issues: 0
  };

  var emailSet = {};

  for (var i = 1; i < data.length; i++) {
    var email = (data[i][0] || '').toString().toLowerCase();
    var token = data[i][5];

    // Doublons
    if (emailSet[email]) {
      report.duplicates.push({ row: i + 1, email: email });
      report.issues++;
    }
    emailSet[email] = true;

    // Emails invalides
    if (!isValidEmail(email)) {
      report.invalidEmails.push({ row: i + 1, email: email });
      report.issues++;
    }

    // Tokens manquants
    if (!token) {
      report.missingTokens.push({ row: i + 1, email: email });
      report.issues++;
    }
  }

  if (report.issues > 0) {
    report.status = 'warning';
  }

  return report;
}

/**
 * Corrige automatiquement les problèmes d'intégrité.
 */
function autoFixIntegrity() {
  var sheet = getMarketingSheet_();
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var emailsSeen = {};
  var rowsToDelete = [];
  var fixed = 0;

  for (var i = 1; i < data.length; i++) {
    var email = (data[i][0] || '').toString().toLowerCase().trim();

    // Corriger email en minuscules
    if (data[i][0] !== email) {
      sheet.getRange(i + 1, 1).setValue(email);
      fixed++;
    }

    // Supprimer doublons (garder la première occurrence)
    if (emailsSeen[email]) {
      rowsToDelete.push(i + 1);
    }
    emailsSeen[email] = true;

    // Générer tokens manquants
    if (!data[i][5]) {
      sheet.getRange(i + 1, 6).setValue(generateUnsubscribeToken_());
      fixed++;
    }
  }

  // Supprimer les doublons (du bas vers le haut)
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
    fixed++;
  }

  logEvent('INTEGRITY_FIX', 'Fixed ' + fixed + ' issues, removed ' + rowsToDelete.length + ' duplicates');
  sendTelegramMessage(
    '\u2705 <b>Intégrité vérifiée</b>\n\n'
    + 'Corrections: ' + fixed + '\n'
    + 'Doublons supprimés: ' + rowsToDelete.length
  );
}

// ============================
// UTILITAIRES INTERNES
// ============================

function storeBackupReference_(backupId, name) {
  var raw = PropertiesService.getScriptProperties().getProperty('backup_history');
  var history = raw ? JSON.parse(raw) : [];

  history.push({
    id: backupId,
    name: name,
    date: new Date().toISOString()
  });

  PropertiesService.getScriptProperties().setProperty('backup_history', JSON.stringify(history));
}

function cleanupOldBackups_(keepCount) {
  var raw = PropertiesService.getScriptProperties().getProperty('backup_history');
  if (!raw) return;

  var history = JSON.parse(raw);

  while (history.length > keepCount) {
    var oldest = history.shift();
    try {
      var file = DriveApp.getFileById(oldest.id);
      file.setTrashed(true);
      logEvent('BACKUP_CLEANUP', 'Removed old backup: ' + oldest.name);
    } catch (e) {
      // Fichier déjà supprimé ou inaccessible
    }
  }

  PropertiesService.getScriptProperties().setProperty('backup_history', JSON.stringify(history));
}
