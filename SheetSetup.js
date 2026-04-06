/**
 * SheetSetup.js — Module de configuration automatique Google Sheet
 * Crée et configure la base de données marketing.
 */

/**
 * Crée un nouveau Google Sheet pour la base marketing.
 * Configure les headers, validations et formatage.
 * @returns {string} ID du nouveau Google Sheet
 */
function createMarketingSheet() {
  var ss = SpreadsheetApp.create('DD_Bot_Marketing_DB');
  var sheet = ss.getActiveSheet();
  sheet.setName('Contacts');

  // Headers
  var headers = ['email', 'prenom', 'consent', 'last_purchase', 'segment', 'unsubscribe_token', 'created_at', 'updated_at'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Formatage headers
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#2c3e50');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');

  // Largeurs de colonnes
  sheet.setColumnWidth(1, 250); // email
  sheet.setColumnWidth(2, 120); // prenom
  sheet.setColumnWidth(3, 80);  // consent
  sheet.setColumnWidth(4, 140); // last_purchase
  sheet.setColumnWidth(5, 100); // segment
  sheet.setColumnWidth(6, 280); // unsubscribe_token
  sheet.setColumnWidth(7, 180); // created_at
  sheet.setColumnWidth(8, 180); // updated_at

  // Validation : consent (checkbox)
  var consentRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();
  sheet.getRange(2, 3, 998, 1).setDataValidation(consentRule);

  // Validation : segment (dropdown)
  var segmentRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['new', 'active', 'vip', 'inactive', 'churned'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 5, 998, 1).setDataValidation(segmentRule);

  // Figer la première ligne
  sheet.setFrozenRows(1);

  // Créer onglet Campagnes
  var campaignsSheet = ss.insertSheet('Campagnes');
  var campaignHeaders = ['campaign_id', 'title', 'segment', 'total_sent', 'errors', 'status', 'created_at', 'completed_at'];
  campaignsSheet.getRange(1, 1, 1, campaignHeaders.length).setValues([campaignHeaders]);
  var campaignHeaderRange = campaignsSheet.getRange(1, 1, 1, campaignHeaders.length);
  campaignHeaderRange.setFontWeight('bold');
  campaignHeaderRange.setBackground('#2c3e50');
  campaignHeaderRange.setFontColor('#ffffff');
  campaignsSheet.setFrozenRows(1);

  // Créer onglet Logs
  var logsSheet = ss.insertSheet('Logs');
  var logHeaders = ['timestamp', 'type', 'email', 'action', 'result', 'details'];
  logsSheet.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
  var logHeaderRange = logsSheet.getRange(1, 1, 1, logHeaders.length);
  logHeaderRange.setFontWeight('bold');
  logHeaderRange.setBackground('#e74c3c');
  logHeaderRange.setFontColor('#ffffff');
  logsSheet.setFrozenRows(1);

  // Créer onglet Stats
  var statsSheet = ss.insertSheet('Stats');
  setupStatsSheet_(statsSheet);

  // Sauvegarder l'ID dans les propriétés
  var sheetId = ss.getId();
  PropertiesService.getScriptProperties().setProperty('MARKETING_SHEET_ID', sheetId);

  logEvent('SETUP', 'Marketing sheet created: ' + sheetId);
  sendTelegramMessage(
    '\u2705 <b>Base marketing créée</b>\n\n'
    + 'Google Sheet ID: <code>' + sheetId + '</code>\n'
    + 'URL: ' + ss.getUrl() + '\n\n'
    + 'Onglets:\n'
    + '- Contacts (base principale)\n'
    + '- Campagnes (historique)\n'
    + '- Logs (journal)\n'
    + '- Stats (tableau de bord)'
  );

  return sheetId;
}

/**
 * Configure l'onglet Stats avec des formules de suivi.
 */
function setupStatsSheet_(sheet) {
  // Titre
  sheet.getRange('A1').setValue('TABLEAU DE BORD').setFontSize(16).setFontWeight('bold');
  sheet.getRange('A1:D1').merge().setBackground('#2c3e50').setFontColor('#ffffff').setHorizontalAlignment('center');

  // Métriques principales
  var metrics = [
    ['Métrique', 'Valeur', 'Formule source'],
    ['Total contacts', '=COUNTA(Contacts!A:A)-1', ''],
    ['Consentement actif', '=COUNTIF(Contacts!C:C,TRUE)', ''],
    ['Taux consentement', '=IF(B3>0,B4/B3*100&"%","N/A")', ''],
    ['Nouveaux (new)', '=COUNTIF(Contacts!E:E,"new")', ''],
    ['Actifs (active)', '=COUNTIF(Contacts!E:E,"active")', ''],
    ['VIP', '=COUNTIF(Contacts!E:E,"vip")', ''],
    ['Inactifs', '=COUNTIF(Contacts!E:E,"inactive")', ''],
    ['Churned', '=COUNTIF(Contacts!E:E,"churned")', ''],
    ['', '', ''],
    ['Campagnes envoyées', '=COUNTA(Campagnes!A:A)-1', ''],
    ['Total emails envoyés', '=SUM(Campagnes!D:D)', ''],
    ['Total erreurs', '=SUM(Campagnes!E:E)', '']
  ];

  sheet.getRange(2, 1, metrics.length, 3).setValues(metrics);

  // Formatage
  sheet.getRange(2, 1, 1, 3).setFontWeight('bold').setBackground('#ecf0f1');
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 200);
}

/**
 * Importe des contacts depuis un CSV ou une liste.
 * @param {string[][]} contacts - Tableau [email, prenom, segment]
 * @returns {Object} {imported: number, skipped: number, errors: number}
 */
function importContacts(contacts) {
  var result = { imported: 0, skipped: 0, errors: 0 };

  contacts.forEach(function (row) {
    try {
      var email = (row[0] || '').trim().toLowerCase();
      if (!isValidEmail(email)) {
        result.skipped++;
        return;
      }

      addMarketingContact({
        email: email,
        prenom: row[1] || '',
        consent: true,
        segment: row[2] || 'new'
      });
      result.imported++;
    } catch (e) {
      result.errors++;
      logEvent('IMPORT_ERROR', 'Failed to import ' + row[0] + ': ' + e.message);
    }
  });

  logEvent('IMPORT', 'Imported: ' + result.imported + ', Skipped: ' + result.skipped + ', Errors: ' + result.errors);
  return result;
}

/**
 * Exporte les contacts consentants (conformité RGPD - droit à la portabilité).
 * @returns {string[][]} Données au format CSV
 */
function exportContacts() {
  var sheet = getMarketingSheet_();
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var exported = [data[0]]; // headers

  for (var i = 1; i < data.length; i++) {
    if (data[i][2] === true || data[i][2] === 'TRUE') {
      exported.push(data[i]);
    }
  }

  return exported;
}

/**
 * Supprime un contact (conformité RGPD - droit à l'effacement).
 * @param {string} email
 * @returns {boolean} Succès
 */
function deleteContact(email) {
  var sheet = getMarketingSheet_();
  if (!sheet) return false;

  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0].toLowerCase() === email.toLowerCase()) {
      sheet.deleteRow(i + 1);
      logEvent('GDPR_DELETE', 'Contact deleted: ' + email);
      return true;
    }
  }
  return false;
}

/**
 * Enregistre une campagne dans l'onglet Campagnes.
 * @param {Object} campaign - Données de la campagne
 */
function logCampaignToSheet(campaign) {
  if (!CONFIG.MARKETING_SHEET_ID) return;

  try {
    var ss = SpreadsheetApp.openById(CONFIG.MARKETING_SHEET_ID);
    var sheet = ss.getSheetByName('Campagnes');
    if (!sheet) return;

    sheet.appendRow([
      campaign.id,
      campaign.title,
      campaign.segment,
      campaign.sent || 0,
      campaign.errors || 0,
      campaign.status,
      campaign.createdAt,
      campaign.completedAt || ''
    ]);
  } catch (e) {
    logEvent('SHEET_ERROR', 'Cannot log campaign: ' + e.message);
  }
}

/**
 * Enregistre un événement dans l'onglet Logs du Sheet.
 * @param {string} type
 * @param {string} email
 * @param {string} action
 * @param {string} result
 * @param {string} details
 */
function logToSheet(type, email, action, result, details) {
  if (!CONFIG.MARKETING_SHEET_ID) return;

  try {
    var ss = SpreadsheetApp.openById(CONFIG.MARKETING_SHEET_ID);
    var sheet = ss.getSheetByName('Logs');
    if (!sheet) return;

    sheet.appendRow([
      new Date().toISOString(),
      type,
      email,
      action,
      result,
      details
    ]);

    // Garder max 5000 lignes dans les logs
    var maxRows = 5000;
    var totalRows = sheet.getLastRow();
    if (totalRows > maxRows + 100) {
      sheet.deleteRows(2, totalRows - maxRows);
    }
  } catch (e) {
    // Silencieux pour éviter boucle infinie de logging
  }
}
