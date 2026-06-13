import sqlite3
import os
import uuid
from datetime import datetime, timedelta
import random

db_path = os.path.join("apps", "api", "prisma", "dev.db")

# Pre-computed bcrypt hash for 'Password123!' (NestJS-compatible)
PASSWORD_HASH = "$2a$10$T8Z6/8tN0o2/l0g9DqG8oe5bEqwU.M7nI3H0GqyE5B4B2PZ4n7d.K"

def seed():
    if not os.path.exists(db_path):
        print(f"Error: Database file not found at {db_path}. Run 'npx prisma db push' first.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print("Checking database users...")
    
    # 1. Ensure Agent and Admin Users exist
    cursor.execute("SELECT id, email FROM User")
    users = cursor.fetchall()
    user_map = {u[1]: u[0] for u in users}

    admin_email = "admin@supportstream.com"
    agent_email = "agent@supportstream.com"

    if admin_email not in user_map:
        admin_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO User (id, email, passwordHash, displayName, role, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (admin_id, admin_email, PASSWORD_HASH, "Jane Admin", "ADMIN", 1, datetime.now().isoformat(), datetime.now().isoformat())
        )
        user_map[admin_email] = admin_id
        print("Created admin user.")
    else:
        admin_id = user_map[admin_email]

    if agent_email not in user_map:
        agent_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO User (id, email, passwordHash, displayName, role, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (agent_id, agent_email, PASSWORD_HASH, "Alex Agent", "AGENT", 1, datetime.now().isoformat(), datetime.now().isoformat())
        )
        user_map[agent_email] = agent_id
        print("Created agent user.")
    else:
        agent_id = user_map[agent_email]

    # Clean existing demo tickets to prevent primary key collision or duplication
    print("Clearing old demo sessions...")
    cursor.execute("DELETE FROM Session")
    cursor.execute("DELETE FROM Participant")
    cursor.execute("DELETE FROM Message")
    cursor.execute("DELETE FROM File")
    cursor.execute("DELETE FROM Recording")
    cursor.execute("DELETE FROM SessionSummary")
    cursor.execute("DELETE FROM Timeline")
    cursor.execute("DELETE FROM AuditLog")
    cursor.execute("DELETE FROM WebhookEvent")
    cursor.execute("DELETE FROM IntegrationLog")
    cursor.execute("DELETE FROM CustomerProfile")
    cursor.execute("DELETE FROM WorkflowRule")
    cursor.execute("DELETE FROM TicketSequence")

    # Initialize Ticket Sequence
    cursor.execute("INSERT INTO TicketSequence (id, current) VALUES (1, 18)")

    # 2. Seed Workflow Rules
    print("Seeding Workflow rules...")
    rules = [
        (str(uuid.uuid4()), "SESSION_ENDED", "POST_TO_WEBHOOK", 1, datetime.now().isoformat()),
        (str(uuid.uuid4()), "SESSION_ENDED", "POST_TO_SLACK", 1, datetime.now().isoformat()),
        (str(uuid.uuid4()), "FEEDBACK_RECEIVED", "SYNC_TO_SALESFORCE", 1, datetime.now().isoformat()),
        (str(uuid.uuid4()), "FEEDBACK_RECEIVED", "SYNC_TO_HUBSPOT", 1, datetime.now().isoformat())
    ]
    cursor.executemany("INSERT INTO WorkflowRule (id, trigger, action, enabled, createdAt) VALUES (?, ?, ?, ?, ?)", rules)

    # 3. Create Support Sessions (18 tickets)
    print("Seeding 18 support tickets...")
    
    # Static data pools for realistic support logs
    customers = [
        {"name": "Sam Johnson", "email": "sam.johnson@acme.com", "company": "Acme Corp", "phone": "+1 (555) 019-2831"},
        {"name": "Emma Watson", "email": "emma@hogwarts.edu", "company": "Hogwarts School", "phone": "+44 20 7946 0912"},
        {"name": "David Miller", "email": "d.miller@techsolutions.io", "company": "TechSolutions Ltd", "phone": "+1 (555) 043-9821"},
        {"name": "Sophia Davis", "email": "sophia@retailgiants.com", "company": "RetailGiants", "phone": "+1 (555) 076-4112"},
        {"name": "Liam Smith", "email": "liam@cloudservices.net", "company": "CloudServices LLC", "phone": "+1 (555) 091-8844"},
        {"name": "Olivia Taylor", "email": "olivia.t@greenenergy.org", "company": "Green Energy Org", "phone": "+1 (555) 054-2200"}
    ]

    tickets = [
        # Technical Support
        {"title": "Router Configuration Error", "desc": "Customer cannot access administration console on SS-X1 gateway after firmware upgrade.", "dept": "TECHNICAL_SUPPORT", "cat": "TECHNICAL_SUPPORT", "sev": "HIGH", "status": "ENDED", "res": "RESOLVED", "rating": 5, "comments": "Resolved immediately! Agent updated SS-X1 gateway firmware.", "sent": "POSITIVE"},
        {"title": "DSL Dropouts on Loop-B", "desc": "Intermittent DSL synchronisation failure on downstream line. SNR margin dropping below 6dB.", "dept": "TECHNICAL_SUPPORT", "cat": "TECHNICAL_SUPPORT", "sev": "CRITICAL", "status": "ENDED", "res": "ESCALATED", "rating": 2, "comments": "The agent was nice but we need an onsite technician to test loop-B wiring.", "sent": "NEGATIVE"},
        {"title": "IPTV Buffering Issues", "desc": "Multicast packets being discarded by core switches. Client experiencing heavy video stutter.", "dept": "TECHNICAL_SUPPORT", "cat": "TECHNICAL_SUPPORT", "sev": "MEDIUM", "status": "ENDED", "res": "RESOLVED", "rating": 4, "comments": "Re-configured IGMP snooping. Working perfectly now.", "sent": "POSITIVE"},
        {"title": "DNS Query Resolving Timeout", "desc": "Local caching servers dropping primary resolver connections during peak load hours.", "dept": "TECHNICAL_SUPPORT", "cat": "TECHNICAL_SUPPORT", "sev": "LOW", "status": "ENDED", "res": "RESOLVED", "rating": 4, "comments": "Flushed caches and adjusted timeout policies.", "sent": "NEUTRAL"},
        
        # Billing
        {"title": "Invoice Discrepancy June 2026", "desc": "Double charge detected on account renewal line. Charged for both standard and premium tiers.", "dept": "BILLING", "cat": "BILLING", "sev": "MEDIUM", "status": "ENDED", "res": "RESOLVED", "rating": 5, "comments": "Refunding duplicate charge. Processed credit memo.", "sent": "POSITIVE"},
        {"title": "Refund Request for Down-time", "desc": "Requesting SLA rebate for loop outage occurred on June 3rd lasting 8 consecutive hours.", "dept": "BILLING", "cat": "BILLING", "sev": "LOW", "status": "ENDED", "res": "PARTIALLY_RESOLVED", "rating": 3, "comments": "Credited $45 to the next bill. Compromise reached.", "sent": "NEUTRAL"},
        {"title": "Autopay Setup Failure", "desc": "ACH authorization failing on corporate checking accounts. Bank returned error 302.", "dept": "BILLING", "cat": "BILLING", "sev": "MEDIUM", "status": "ENDED", "res": "RESOLVED", "rating": 5, "comments": "Confirmed bank details and re-authorized.", "sent": "POSITIVE"},

        # Account Recovery
        {"title": "Admin Password Locked Out", "desc": "Corporate root user locked after 5 invalid attempts. MFA token sync out of phase.", "dept": "ACCOUNT_RECOVERY", "cat": "ACCOUNT_RECOVERY", "sev": "CRITICAL", "status": "ENDED", "res": "RESOLVED", "rating": 5, "comments": "Secure MFA reset. Restored root admin access.", "sent": "POSITIVE"},
        {"title": "SSO SAML Integration Failure", "desc": "Active Directory federation returning signature verification failure (Error 403).", "dept": "ACCOUNT_RECOVERY", "cat": "ACCOUNT_RECOVERY", "sev": "HIGH", "status": "ENDED", "res": "ESCALATED", "rating": 1, "comments": "Still locked out of SAML federated portals. Disappointed.", "sent": "NEGATIVE"},
        {"title": "Owner Transfer Verification", "desc": "Transferring portal ownership from previous IT Director to new CIO. Verification document uploaded.", "dept": "ACCOUNT_RECOVERY", "cat": "ACCOUNT_RECOVERY", "sev": "MEDIUM", "status": "ENDED", "res": "RESOLVED", "rating": 5, "comments": "Processed IT notary transfer files. CIO is now primary owner.", "sent": "POSITIVE"},

        # Sales
        {"title": "Enterprise Tier Walkthrough", "desc": "Call with Acme CIO to demonstrate multi-tenant controls, coturn integration, and API limits.", "dept": "SALES", "cat": "PRODUCT_DEMO", "sev": "LOW", "status": "ENDED", "res": "RESOLVED", "rating": 5, "comments": "Stunning demo! Booking procurement call next week.", "sent": "POSITIVE"},
        {"title": "API Rate Limit Quotation", "desc": "Pricing details requested for 50,000 concurrent WebRTC session minutes per month.", "dept": "SALES", "cat": "PRODUCT_DEMO", "sev": "MEDIUM", "status": "ENDED", "res": "RESOLVED", "rating": 4, "comments": "Sent official quotation sheet.", "sent": "NEUTRAL"},
        {"title": "On-premise Deployment Query", "desc": "Reviewing security controls for air-gapped server installation requirements.", "dept": "SALES", "cat": "PRODUCT_DEMO", "sev": "LOW", "status": "ENDED", "res": "PARTIALLY_RESOLVED", "rating": 3, "comments": "Explained docker and medsup layouts. Requires custom scoping.", "sent": "NEUTRAL"},

        # Escalations
        {"title": "SLA Failure on Fiber Route", "desc": "Primary fiber trunk severed. Auto-failover to backup LTE took 4 minutes instead of 50ms.", "dept": "ESCALATIONS", "cat": "ESCALATION", "sev": "CRITICAL", "status": "ENDED", "res": "ESCALATED", "rating": 2, "comments": "Routing to core engineering to fix routing convergence time.", "sent": "NEGATIVE"},
        {"title": "Executive Escalation: Data Leak", "desc": "Compliance officer flagged unauthorized guest join. Reviewing single-use invite tokens.", "dept": "ESCALATIONS", "cat": "ESCALATION", "sev": "CRITICAL", "status": "ENDED", "res": "RESOLVED", "rating": 5, "comments": "Verified it was an internal test. Invite log cleared.", "sent": "POSITIVE"},
        
        # Active & Waiting Queue Tickets (for populating current live dashboard)
        {"title": "VoIP SIP Trunking Error", "desc": "Incoming calls returning busy tone. Packet capture shows code 486 Busy Here.", "dept": "TECHNICAL_SUPPORT", "cat": "TECHNICAL_SUPPORT", "sev": "HIGH", "status": "ACTIVE", "res": None, "rating": None, "comments": None, "sent": "NEUTRAL"},
        {"title": "Billing Dispute: Extra Decoders", "desc": "Charged for 3 extra decoders that were returned back to warehouse on May 15.", "dept": "BILLING", "cat": "BILLING", "sev": "LOW", "status": "WAITING", "res": None, "rating": None, "comments": None, "sent": "NEUTRAL"},
        {"title": "MFA Device Synchronization", "desc": "Authenticator app generating invalid OTP keys. Clock drift suspected.", "dept": "ACCOUNT_RECOVERY", "cat": "ACCOUNT_RECOVERY", "sev": "MEDIUM", "status": "CREATED", "res": None, "rating": None, "comments": None, "sent": "NEUTRAL"}
    ]

    base_time = datetime.now() - timedelta(days=20)

    for i, t in enumerate(tickets):
        session_id = str(uuid.uuid4())
        ticket_num = i + 1
        ticket_ref = f"CASE-2026-{ticket_num:04d}"
        
        created_at = base_time + timedelta(days=i, hours=random.randint(1, 10))
        ended_at = created_at + timedelta(minutes=random.randint(10, 45)) if t["status"] == "ENDED" else None
        
        # Select customer data
        cust = customers[i % len(customers)]
        
        # 3.1 Insert Session
        cursor.execute(
            """INSERT INTO Session (
                id, ticketRef, category, severity, department, assignedAgentId, assignedTeam, 
                title, description, createdBy, status, startedAt, endedAt, agentNotes, 
                resolutionStatus, feedbackRating, feedbackResolved, feedbackComments, sentiment, 
                escalatedAt, escalationReason, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                session_id,
                ticket_ref,
                t["cat"],
                t["sev"],
                t["dept"],
                agent_id if t["status"] == "ENDED" else None,
                "Tier 2 Support" if t["dept"] == "TECHNICAL_SUPPORT" else "Ops Team",
                t["title"],
                t["desc"],
                admin_id,
                t["status"],
                created_at.isoformat() if t["status"] in ["ACTIVE", "ENDED"] else None,
                ended_at.isoformat() if t["status"] == "ENDED" else None,
                f"Completed troubleshooting. {t['desc']}" if t["status"] == "ENDED" else None,
                t["res"],
                t["rating"],
                t["feedbackResolved"] if "feedbackResolved" in t else (1 if t["res"] == "RESOLVED" else 0) if t["status"] == "ENDED" else None,
                t["comments"],
                t["sent"],
                created_at.isoformat() if t["res"] == "ESCALATED" else None,
                "Auto-escalated due to rating or high severity" if t["res"] == "ESCALATED" else None,
                created_at.isoformat(),
                ended_at.isoformat() if t["status"] == "ENDED" else created_at.isoformat()
            )
        )

        # 3.2 Insert Participants
        # Agent Participant
        cursor.execute(
            "INSERT INTO Participant (id, sessionId, userId, displayName, email, role, joinedAt, leftAt, isConnected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), session_id, agent_id, "Alex Agent", agent_email, "AGENT", created_at.isoformat(), ended_at.isoformat() if t["status"] == "ENDED" else None, 1 if t["status"] == "ACTIVE" else 0)
        )
        # Customer Participant
        cursor.execute(
            "INSERT INTO Participant (id, sessionId, userId, displayName, email, role, joinedAt, leftAt, isConnected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), session_id, None, cust["name"], cust["email"], "CUSTOMER", (created_at + timedelta(minutes=2)).isoformat(), ended_at.isoformat() if t["status"] == "ENDED" else None, 1 if t["status"] == "ACTIVE" else 0)
        )

        # 3.3 Create Customer Profile if not exists
        cursor.execute("SELECT id FROM CustomerProfile WHERE email = ?", (cust["email"],))
        existing_profile = cursor.fetchone()
        
        # Random mock CRM keys
        mock_sf = f"500{str(uuid.uuid4()).replace('-', '')[:15].upper()}" if t["status"] == "ENDED" and t["res"] == "RESOLVED" else None
        mock_hs = f"hs_deal_{random.randint(100000000, 999999999)}" if t["status"] == "ENDED" and t["res"] == "RESOLVED" else None
        
        if not existing_profile:
            cursor.execute(
                "INSERT INTO CustomerProfile (id, email, displayName, company, phone, notes, slackUser, salesforceId, hubspotId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), cust["email"], cust["name"], cust["company"], cust["phone"], f"VIP support tier for {cust['company']}.", f"@{cust['name'].lower().replace(' ', '')}", mock_sf, mock_hs, created_at.isoformat(), created_at.isoformat())
            )
        else:
            if mock_sf or mock_hs:
                cursor.execute(
                    "UPDATE CustomerProfile SET salesforceId = COALESCE(salesforceId, ?), hubspotId = COALESCE(hubspotId, ?), updatedAt = ? WHERE email = ?",
                    (mock_sf, mock_hs, datetime.now().isoformat(), cust["email"])
                )

        # 3.4 Seed Messages & Timelines for completed tickets to show statistics
        if t["status"] == "ENDED":
            # Add some messages
            msg1_id = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO Message (id, sessionId, senderId, senderName, senderRole, content, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (msg1_id, session_id, "guest", cust["name"], "CUSTOMER", "Hello, I am having issues with the setup.", (created_at + timedelta(minutes=3)).isoformat())
            )
            msg2_id = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO Message (id, sessionId, senderId, senderName, senderRole, content, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (msg2_id, session_id, agent_id, "Alex Agent", "AGENT", f"Let's look at the {t['title']} issues. Let's do a screen share.", (created_at + timedelta(minutes=4)).isoformat())
            )
            
            # Add some files
            if t["rating"] and t["rating"] >= 4:
                file_id = str(uuid.uuid4())
                cursor.execute(
                    "INSERT INTO File (id, sessionId, uploaderId, uploaderName, originalName, storageKey, mimeType, sizeBytes, isScanned, isSafe, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (file_id, session_id, "guest", cust["name"], "diagnostics_log.txt", f"files/{file_id}_diagnostics_log.txt", "text/plain", 45000, 1, 1, (created_at + timedelta(minutes=5)).isoformat())
                )

            # Add Recording if resolved
            if t["res"] == "RESOLVED":
                rec_id = str(uuid.uuid4())
                cursor.execute(
                    "INSERT INTO Recording (id, sessionId, storageKey, playbackUrl, durationSeconds, sizeBytes, status, startedAt, endedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (rec_id, session_id, f"recordings/{rec_id}.mp4", f"/api/v1/recordings/playback/{rec_id}", 320, 15000000, "COMPLETED", (created_at + timedelta(minutes=5)).isoformat(), (created_at + timedelta(minutes=10)).isoformat(), (created_at + timedelta(minutes=10)).isoformat())
                )

            # 3.5 SessionSummary
            cursor.execute(
                "INSERT INTO SessionSummary (id, sessionId, durationSec, participants, totalMessages, totalFiles, recordingUrl, endedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    session_id,
                    random.randint(600, 1800),
                    f'[{{"name": "Alex Agent", "role": "AGENT"}}, {{"name": "{cust["name"]}", "role": "CUSTOMER"}}]',
                    random.randint(5, 15),
                    1 if t["rating"] and t["rating"] >= 4 else 0,
                    f"/api/v1/recordings/playback/{session_id}" if t["res"] == "RESOLVED" else None,
                    "Alex Agent",
                    ended_at.isoformat()
                )
            )

            # 3.6 Seeding Integration logs & Webhooks events
            webhook_evt_id = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO WebhookEvent (id, event, payload, attempts, status, responseCode, lastAttempt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    webhook_evt_id,
                    "SESSION_ENDED",
                    f'{{"sessionId": "{session_id}", "ticketRef": "{ticket_ref}", "title": "{t["title"]}", "resolution": "{t["res"]}"}}',
                    1,
                    "SENT",
                    200,
                    ended_at.isoformat(),
                    ended_at.isoformat()
                )
            )

            if t["res"] == "RESOLVED":
                cursor.execute(
                    "INSERT INTO IntegrationLog (id, provider, action, status, errorMsg, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), "SALESFORCE", "SYNC_CASE", "SUCCESS", None, ended_at.isoformat())
                )
                cursor.execute(
                    "INSERT INTO IntegrationLog (id, provider, action, status, errorMsg, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), "HUBSPOT", "SYNC_DEAL", "SUCCESS", None, (ended_at + timedelta(seconds=1)).isoformat())
                )
            elif t["res"] == "ESCALATED":
                cursor.execute(
                    "INSERT INTO IntegrationLog (id, provider, action, status, errorMsg, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), "SLACK", "POST_MESSAGE", "SUCCESS", None, ended_at.isoformat())
                )

    conn.commit()
    conn.close()
    print("Database seeding completed successfully!")

if __name__ == "__main__":
    seed()
