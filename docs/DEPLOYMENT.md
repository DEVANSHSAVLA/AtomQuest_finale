# SupportStream Deployment & Integration Guide

This document describes the deployment architecture, configuration keys, webhook settings, CRM mock layers, and conversation sentiment metrics for SupportStream.

---

## ⚙️ Environment Configurations

The API and frontend applications expect configuration keys declared in `.env` files or system environment variables.

### Control API backend (`apps/api/.env`)
```ini
# Base API Ports
PORT=3001
JWT_SECRET=super-secret-jwt-signing-key
DATABASE_URL="file:./dev.db"

# Media Server Signaling Address
MEDIA_SERVER_URL="http://localhost:3002"

# Slack Incoming Webhook
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# Main Webhook Dispatch target (for operational reliability logs)
WEBHOOK_URL="https://customer-support-ticketing.onrender.com/webhooks"
```

### Next.js Frontend Web client (`apps/web/.env.local`)
```ini
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

---

## 🔌 Webhooks & Integrations

### 1. Slack Webhook Sync
SupportStream implements an **Incoming Webhook integration** to broadcast session alerts.
- **Scope**: No OAuth or bot user tokens are required.
- **Usage**: When a session is created or closed, a POST request is sent to `SLACK_WEBHOOK_URL` with a structured text payload.
- **Config**: Declare `SLACK_WEBHOOK_URL` in the NestJS API environment. If empty, the system automatically runs in a Mock mode and logs sync results in the `IntegrationLog` database.

### 2. Salesforce & HubSpot Adapters
SupportStream uses a **Mock Connector Layer** to simulate enterprise CRM synchronization during call closure.
- **Salesforce Adapter**: Simulates CRM case creation. It automatically generates a mock Salesforce ID (`500XXXXXXXXXXXX`) and links it to the guest customer's CRM profile.
- **HubSpot Adapter**: Simulates Deal tracking. It creates a mock Deal ID (`hs_deal_XXXXXXXXX`) and links it to the profile.
- **Status Audits**: Sync logs, including simulated retry attempts, status changes (`SUCCESS` / `FAILED`), and response codes are stored in the database. Admins can view these in real-time under the **Automations & Sync Logs** tab in the Operations Dashboard.

### 3. **Configure Project Settings**:
   - **Framework Preset**: Select **Next.js** (detected automatically).
   - **Root Directory**: Keep it as the **root repository directory (`.`)**. Our custom `vercel.json` configuration file will automatically handle building `apps/web` from the root, allowing proper package dependency resolving and compilation!
   - **Environment Variables**: Expand this section and add:
     - **Name**: `NEXT_PUBLIC_API_URL`
       - **Value**: `https://devanshsavla17-supportstream-api.hf.space/api/v1`
     - **Name**: `NEXT_PUBLIC_SOCKET_URL`
       - **Value**: `https://devanshsavla17-supportstream-api.hf.space`

4. **Deploy**:
   - Click **Deploy**. Vercel will install dependencies, compile the Next.js static pages, and host the web client globally.
   - Note down your Vercel deployment URL (e.g. `https://atom-quest-finale-web.vercel.app`).

### 3. Conversation Sentiment Indicator
SupportStream includes a **Conversation Sentiment Indicator** based on a keyword matching engine.
- **Marketing**: Do not market this feature as AI. It is branded exclusively as a **Conversation Sentiment Indicator**.
- **Logic**: Evaluates support chat exchange transcripts against a curated list of keywords.
  - **Positive words**: `thank`, `perfect`, `resolved`, `great`, `happy`, `solved`, `works`, `appreciate`, `awesome`, `excellent`
  - **Negative words**: `broken`, `fail`, `error`, `frustrated`, `slow`, `angry`, `terrible`, `worst`, `stuck`, `issue`, `crash`
- **Output**: Returns `POSITIVE`, `NEUTRAL`, or `NEGATIVE` and stores the outcome on the `Session` model. This is displayed as an emoji gauge in the header of the call room and inside the dashboard.

---

## 🛠️ Production Deployments

For high-availability production architectures, the components should be deployed behind an Nginx reverse proxy routing TLS traffic:

1. **Control plane (NestJS & Next.js)**: Can be run inside container services (e.g. Railway or Render) or static hosting (Vercel).
2. **Data plane (Mediasoup media-server)**: Must be deployed on a VPS (e.g. AWS EC2, DigitalOcean) with raw public IP access. It requires opening the public UDP port range (`40000-49999`) for WebRTC media streams.
