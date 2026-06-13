# SupportStream — Hackathon Judging Demo Script
## ⏱️ Recommended 4–5 Minute "WOW" Walkthrough

This demo script walks judges through SupportStream, showing how it differs from generic meeting tools by combining WebRTC with ticket workflows, CRM context, and automated escalation.

---

## 🎭 Roles & Preparation
- **Browser Tab 1 (Agent View)**: Standard browser window.
- **Browser Tab 2 (Customer View)**: Incognito window (simulates customer device).
- **Browser Tab 3 (Admin Control)**: Standard browser window (logged in as administrator).

---

## ⏱️ Live Demo Timeline

### 1. Login & Dashboard (0:00 - 0:30)
- **Action**: Log in as `agent@supportstream.com` (Password: `Password123!`).
- **Showcase**: Renders the dark-themed **Agent Queue Control Dashboard**. Point out the:
  - **Operational Metrics Ribbon**: Average satisfaction rating, resolved rate, and active call rooms.
  - **Segmented Department Queues**: Active tickets automatically routed to columns (`Technical Support`, `Billing`, `Account Recovery`, `Sales`, `Escalations`).
  - **Past Resolutions Sidebar**: Prior ticket reference listings.

### 2. Create Ticket & Assign Department (0:30 - 1:00)
- **Action**: Click **Create Support Room**.
- **Input**: 
  - Title: *Router Gateway SS-X1 Troubleshooting*
  - Severity: *Critical*
  - Routing Department Column: *Technical Support*
- **Action**: Click **Initialize Call**.
- **Showcase**: The waiting lobby opens. Click **Copy Invite Link** (UI flashes checkmark indicator).

### 3. Customer Pre-Join Lobby (1:00 - 1:40)
- **Action**: Switch to the **Incognito Window** (Tab 2) and paste the copied link.
- **Showcase**: The **Customer Pre-Join Setup Lobby** opens:
  - Explain how SupportStream requires no app downloads.
  - Show the local camera preview and hardware toggle checks (Mic / Camera).
- **Input**: Enter Customer details:
  - Name: *Sam Customer*
  - Email: *sam.johnson@acme.com*
  - Company: *Acme Corp*
  - Phone: *+1 (555) 019-2831*
  - Notes: *MFA token locked after upgrade*
- **Action**: Click **Join Video Support Call**.

### 4. Interactive Call & Screen Share (1:40 - 2:30)
- **Showcase**:
  - **Video Feeds**: Double video streams connect through the server-routed **Mediasoup SFU** data plane. Highlight the **Active Speaker Glow** outlining the talker's video feed.
  - **Telemetry Indicator**: Point out the live telemetry statistics header showing latency (RTT), packet loss, and link status.
  - **Conversation Sentiment Indicator**: Show the emoji sentiment gauge (starts at Neutral 😐).
- **Action**: Send a chat message: *"Can you share your screen?"* 
- **Action (Customer)**: Click **Share Screen** and choose a tab.
- **Showcase**: The video layout shifts into presentation mode with the shared stream focused and participant videos arranged in the sidebar.

### 5. Chat, File Upload & CRM Sidebar (2:30 - 3:00)
- **Action (Customer)**: Send a message: *"Sending diagnostic logs."* Click the paperclip icon and upload a text file.
- **Showcase**: The file is scanned on the server. The download link renders directly inside the chat bubbles for both peers.
- **Action (Agent)**: Click **Customer CRM Profile** in the header.
- **Showcase**: The sidebar opens, rendering Sam's company, phone, and past support history (tickets, dates, outcomes) to provide immediate agent context.

### 6. End Session & Support Copilot (3:00 - 3:30)
- **Action (Agent)**: Click **Hang Up Session**. The **End Support Session Form** modal opens.
- **Action**: Click **Generate Support Copilot Summary**.
- **Showcase**: The transcript keyword engine returns:
  - **Summary Bullets**: Diagnosed issue, category, and severity details.
  - **Suggested Resolution Notes**: Generated formatting for the database log.
  - **Customer Follow-Up Email**: Ready-to-send email template summarizing resolution actions.
- **Action**: Set status to **Resolved** and click **Submit & Close Session**. Confetti triggers on the agent screen.

### 7. Customer Satisfaction Feedback (3:30 - 4:00)
- **Action (Customer)**: The customer is routed to the feedback screen.
- **Input**: Rate **5 Stars**, select *"Yes, Resolved"*, and enter a comment. Click **Submit**.
- **Showcase**: Confetti triggers, and the customer is securely redirected back to the home screen.

### 8. Admin Analytics & Webhook Reliability (4:00 - 4:30)
- **Action**: Switch to the **Admin Window** (Tab 3) and navigate to `/admin`.
- **Showcase**: Open the **Automations & Sync Logs** tab:
  - **Webhook Reliability Dispatch Audits**: Show the `SESSION_ENDED` event log, displaying the timestamp, attempts (`1`), and HTTP code (`200`).
  - **CRM Connector sync logs**: Point to the Salesforce case sync (`500XXXX`) and HubSpot deal sync (`hs_deal_XXXX`) logs generated in fake/demo mode.
- **Action**: Click **Audit Logs** tab to show the timeline listing of connections, file shares, and closures.

---

## ❓ The Winning Pitch: Why not Zoom?

Every judge asks this. Be ready to explain:

> *"Zoom is a generic meeting tool. It doesn't know what a support ticket is, doesn't validate customer satisfaction, and doesn't sync with customer profiles.*
> 
> *SupportStream is built specifically for support teams. It integrates secure video directly into customer histories, automates CRM updates, checks client connection quality, and triggers escalations based on feedback. It turns video calls into structured, trackable support workflows."*
