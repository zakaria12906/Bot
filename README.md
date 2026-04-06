# Bot Gmail Support Digital + Telegram + Shopify

Bot de support client automatisé basé sur Google Apps Script avec validation Telegram et intégration Shopify.

## Architecture

```
Clients → Gmail
           ↓
     Apps Script
    ↓               ↓
Shopify API      Base emails (Google Sheet)
    ↓               ↓
Réponse générée     ↓
    ↓
Telegram validation
    ↓
Envoi automatique
```

## Modules

| Module | Fichier | Description |
|--------|---------|-------------|
| Config | `Config.js` | Configuration centralisée et Script Properties |
| Telegram | `Telegram.js` | Webhook, envoi messages, boutons inline |
| Gmail | `Gmail.js` | Scan inbox, gestion labels, filtrage |
| Réponses | `ReplyEngine.js` | Moteur de règles, templates, détection langue |
| Shopify | `Shopify.js` | API Admin, lookup commandes, statut fulfillment |
| Marketing | `Marketing.js` | Campagnes email, consentement RGPD, désinscription |
| Logs | `Logger.js` | Journal d'activité, monitoring, alertes |
| Sécurité | `Security.js` | Anti-spam, validation webhook, rate limiting |
| Main | `Main.js` | Orchestrateur principal, triggers, web app |

## Setup

### 1. Créer le bot Telegram
1. Parler à [@BotFather](https://t.me/BotFather) sur Telegram
2. Créer un nouveau bot avec `/newbot`
3. Récupérer le `BOT_TOKEN`
4. Envoyer un message au bot puis récupérer votre `chat_id` via `https://api.telegram.org/bot<TOKEN>/getUpdates`

### 2. Configurer Script Properties
Dans Apps Script → Paramètres du projet → Propriétés de script :

| Propriété | Description |
|-----------|-------------|
| `TG_TOKEN` | Token du bot Telegram |
| `TG_CHAT_ID` | Votre chat ID Telegram |
| `WEBHOOK_KEY` | Clé secrète pour sécuriser le webhook |
| `SHOPIFY_STORE` | Nom du store (xxx.myshopify.com) |
| `SHOPIFY_TOKEN` | Admin API access token |
| `SUPPORT_EMAIL` | Adresse email de support |
| `MARKETING_SHEET_ID` | ID du Google Sheet pour la base marketing |

### 3. Déployer
1. Copier tous les fichiers `.js` dans un projet Google Apps Script
2. Configurer les Script Properties
3. Déployer en tant que Web App
4. Configurer le webhook Telegram : `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WEBAPP_URL>?key=<WEBHOOK_KEY>`
5. Ajouter un trigger temporel pour `scanInbox` (toutes les 1 minute)

### 4. Google Sheet Marketing
Créer un Google Sheet avec les colonnes :
`email | prenom | consent | last_purchase | segment | unsubscribe_token | created_at | updated_at`

## Limites Gmail
- Gmail gratuit : 500 emails/jour
- Google Workspace : 2000 emails/jour
- Envoi marketing : 30-50 emails/minute max

## Conformité RGPD
- Consentement explicite requis
- Lien de désinscription dans chaque email marketing
- Mention entreprise obligatoire
- Données exportables/supprimables sur demande
