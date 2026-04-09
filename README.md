# Bot Gmail Support Digital + Telegram + Shopify + SendGrid

Bot de support client automatisé basé sur Google Apps Script avec validation Telegram, intégration Shopify, et email marketing scalable.

## Architecture

```
Clients → Gmail
           ↓
     Apps Script
    ↓         ↓          ↓
Shopify API  Base emails  SendGrid API
    ↓         ↓          ↓
Réponse générée     Analytics
    ↓
Telegram validation
    ↓
Envoi automatique (Gmail ou SendGrid)
```

## Modules

| Module         | Fichier            | Description                                        |
|---------------|--------------------|----------------------------------------------------|
| Config        | Config.js          | Configuration centralisée et Script Properties     |
| Telegram      | Telegram.js        | Webhook, envoi messages, boutons inline, commandes |
| Gmail         | Gmail.js           | Scan inbox, gestion labels, filtrage               |
| Réponses      | ReplyEngine.js     | Moteur de réponse, templates, détection langue     |
| Règles métier | Rules.js           | Règles Shopify, digital vs physique, spam          |
| Shopify       | Shopify.js         | API Admin, lookup commandes, fulfillment           |
| Marketing     | Marketing.js       | Campagnes email, consentement RGPD, désinscription |
| Templates     | EmailTemplates.js  | Templates HTML responsive (promo, newsletter...)   |
| SendGrid      | SendGrid.js        | API v3, envoi scalable, stats délivrabilité        |
| Provider      | EmailProvider.js   | Routing intelligent Gmail/SendGrid, auto-fallback  |
| Analytics     | Analytics.js       | Tracking ouvertures/clics, stats campagnes         |
| Logs          | Logger.js          | Journal d'activité, monitoring, alertes            |
| Dashboard     | Dashboard.js       | Rapports quotidiens/hebdo, métriques temps réel    |
| Sécurité      | Security.js        | Anti-spam, validation webhook, rate limiting       |
| Setup         | SheetSetup.js      | Création auto de la base Google Sheet              |
| Backup        | Backup.js          | Sauvegarde, restauration, intégrité, retry logic   |
| Main          | Main.js            | Orchestrateur principal, triggers, web app         |

## Commandes Telegram

### Support
| Commande | Description |
|----------|-------------|
| `/start` | Menu principal |
| `/status` | État du bot |
| `/stats` | Statistiques du jour |
| `/dashboard` | Tableau de bord interactif |
| `/report` | Rapport quotidien |

### Marketing
| Commande | Description |
|----------|-------------|
| `/campaign Titre \| Message \| Segment` | Lancer une campagne |
| `/contacts` | Stats base marketing |
| `/analytics campaign_id` | Ouvertures et clics d'une campagne |
| `/provider` | Statut du provider email actif |

### RGPD
| Commande | Description |
|----------|-------------|
| `/export` | Exporter les contacts consentants |
| `/delete_contact email` | Supprimer un contact (droit à l'effacement) |

### Système
| Commande | Description |
|----------|-------------|
| `/backup` | Sauvegarder la base contacts |
| `/integrity` | Vérifier l'intégrité des données |
| `/integrity_fix` | Corriger automatiquement les problèmes |
| `/logs` | 10 derniers logs |
| `/help` | Aide complète |

## Setup

### 1. Créer le bot Telegram

1. Parler à @BotFather sur Telegram
2. Créer un nouveau bot avec `/newbot`
3. Récupérer le `BOT_TOKEN`
4. Envoyer un message au bot puis récupérer votre `chat_id` via `https://api.telegram.org/bot<TOKEN>/getUpdates`

### 2. Configurer Script Properties

Dans Apps Script → Paramètres du projet → Propriétés de script :

| Propriété | Requis | Description |
|-----------|--------|-------------|
| TG_TOKEN | Oui | Token du bot Telegram |
| TG_CHAT_ID | Oui | Votre chat ID Telegram |
| WEBHOOK_KEY | Oui | Clé secrète pour sécuriser le webhook |
| SUPPORT_EMAIL | Oui | Adresse email de support |
| SHOPIFY_STORE | Non | Nom du store (xxx.myshopify.com) |
| SHOPIFY_TOKEN | Non | Admin API access token |
| MARKETING_SHEET_ID | Non | ID du Google Sheet (auto-créé si absent) |
| SENDGRID_API_KEY | Non | Clé API SendGrid (Phase 4) |
| SENDGRID_FROM | Non | Email expéditeur SendGrid |
| SENDGRID_FROM_NAME | Non | Nom expéditeur SendGrid |
| SENDGRID_PLAN | Non | Plan SendGrid: free/essentials/pro/premier |
| EMAIL_PROVIDER | Non | Mode: gmail, sendgrid, ou auto (défaut) |

### 3. Déployer

1. Copier tous les fichiers `.js` dans un projet Google Apps Script
2. Configurer les Script Properties
3. Exécuter `initialize()` une seule fois (configure tout automatiquement)
4. Le bot est prêt

### 4. Google Sheet Marketing

Créé automatiquement via `createMarketingSheet()` ou manuellement avec les colonnes :
`email | prenom | consent | last_purchase | segment | unsubscribe_token | created_at | updated_at`

## Email Provider (Phase 4)

Le bot supporte deux providers email avec basculement intelligent :

| Mode | Comportement |
|------|-------------|
| `gmail` | Uniquement Gmail (500/jour gratuit, 2000/jour Workspace) |
| `sendgrid` | Uniquement SendGrid (100/jour gratuit, 50k+/jour payant) |
| `auto` (défaut) | Gmail par défaut, bascule sur SendGrid quand quota < 50 |

### SendGrid Setup

1. Créer un compte sur [sendgrid.com](https://sendgrid.com)
2. Générer une API Key (Settings → API Keys)
3. Vérifier votre domaine (Settings → Sender Authentication)
4. Ajouter `SENDGRID_API_KEY` dans Script Properties

## Analytics

Chaque campagne marketing inclut :
- **Tracking pixel** : détection des ouvertures (invisible 1x1 GIF)
- **Liens trackés** : redirection transparente avec comptage des clics
- **Onglet Analytics** : créé automatiquement dans le Google Sheet
- **Commande `/analytics`** : stats temps réel par campagne

## Conformité RGPD

- Consentement explicite requis (checkbox dans la base)
- Lien de désinscription dans chaque email marketing
- Mention entreprise obligatoire dans le footer
- `/export` : droit à la portabilité
- `/delete_contact` : droit à l'effacement
- Headers `List-Unsubscribe` conformes

## Limites

| Provider | Limite |
|----------|--------|
| Gmail gratuit | 500 emails/jour |
| Google Workspace | 2000 emails/jour |
| SendGrid Free | 100 emails/jour |
| SendGrid Essentials | 50 000 emails/jour |
| Envoi marketing | 30-50 emails/minute (Gmail), 100+/min (SendGrid) |
