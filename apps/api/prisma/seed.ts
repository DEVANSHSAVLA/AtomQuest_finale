import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const uuidv4 = () => randomUUID();

const prisma = new PrismaClient();
const PASSWORD_HASH = "$2a$10$T8Z6/8tN0o2/l0g9DqG8oe5bEqwU.M7nI3H0GqyE5B4B2PZ4n7d.K"; // Password123!

async function main() {
  console.log('Clearing database tables...');
  await prisma.webhookEvent.deleteMany({});
  await prisma.integrationLog.deleteMany({});
  await prisma.workflowRule.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.timeline.deleteMany({});
  await prisma.sessionSummary.deleteMany({});
  await prisma.recording.deleteMany({});
  await prisma.file.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.participant.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.customerProfile.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.ticketSequence.deleteMany({});

  console.log('Seeding user profiles...');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@supportstream.com',
      passwordHash: PASSWORD_HASH,
      displayName: 'Jane Admin',
      role: 'ADMIN',
      isActive: true,
    },
  });

  const agent = await prisma.user.create({
    data: {
      email: 'agent@supportstream.com',
      passwordHash: PASSWORD_HASH,
      displayName: 'Alex Agent',
      role: 'AGENT',
      isActive: true,
    },
  });

  console.log('Initializing ticket sequence...');
  await prisma.ticketSequence.create({
    data: {
      id: 1,
      current: 18,
    },
  });

  console.log('Seeding workflow rules...');
  await prisma.workflowRule.createMany({
    data: [
      { trigger: 'SESSION_ENDED', action: 'POST_TO_WEBHOOK', enabled: true },
      { trigger: 'SESSION_ENDED', action: 'POST_TO_SLACK', enabled: true },
      { trigger: 'FEEDBACK_RECEIVED', action: 'SYNC_TO_SALESFORCE', enabled: true },
      { trigger: 'FEEDBACK_RECEIVED', action: 'SYNC_TO_HUBSPOT', enabled: true },
    ],
  });

  const customers = [
    { name: 'Sam Johnson', email: 'sam.johnson@acme.com', company: 'Acme Corp', phone: '+1 (555) 019-2831' },
    { name: 'Emma Watson', email: 'emma@hogwarts.edu', company: 'Hogwarts School', phone: '+44 20 7946 0912' },
    { name: 'David Miller', email: 'd.miller@techsolutions.io', company: 'TechSolutions Ltd', phone: '+1 (555) 043-9821' },
    { name: 'Sophia Davis', email: 'sophia@retailgiants.com', company: 'RetailGiants', phone: '+1 (555) 076-4112' },
    { name: 'Liam Smith', email: 'liam@cloudservices.net', company: 'CloudServices LLC', phone: '+1 (555) 091-8844' },
    { name: 'Olivia Taylor', email: 'olivia.t@greenenergy.org', company: 'Green Energy Org', phone: '+1 (555) 054-2200' },
  ];

  const tickets = [
    { title: 'Router Configuration Error', desc: 'Customer cannot access administration console on SS-X1 gateway after firmware upgrade.', dept: 'TECHNICAL_SUPPORT', cat: 'TECHNICAL_SUPPORT', sev: 'HIGH', status: 'ENDED', res: 'RESOLVED', rating: 5, comments: 'Resolved immediately! Agent updated SS-X1 gateway firmware.', sent: 'POSITIVE' },
    { title: 'DSL Dropouts on Loop-B', desc: 'Intermittent DSL synchronisation failure on downstream line. SNR margin dropping below 6dB.', dept: 'TECHNICAL_SUPPORT', cat: 'TECHNICAL_SUPPORT', sev: 'CRITICAL', status: 'ENDED', res: 'ESCALATED', rating: 2, comments: 'The agent was nice but we need an onsite technician to test loop-B wiring.', sent: 'NEGATIVE' },
    { title: 'IPTV Buffering Issues', desc: 'Multicast packets being discarded by core switches. Client experiencing heavy video stutter.', dept: 'TECHNICAL_SUPPORT', cat: 'TECHNICAL_SUPPORT', sev: 'MEDIUM', status: 'ENDED', res: 'RESOLVED', rating: 4, comments: 'Re-configured IGMP snooping. Working perfectly now.', sent: 'POSITIVE' },
    { title: 'DNS Query Resolving Timeout', desc: 'Local caching servers dropping primary resolver connections during peak load hours.', dept: 'TECHNICAL_SUPPORT', cat: 'TECHNICAL_SUPPORT', sev: 'LOW', status: 'ENDED', res: 'RESOLVED', rating: 4, comments: 'Flushed caches and adjusted timeout policies.', sent: 'NEUTRAL' },
    { title: 'Invoice Discrepancy June 2026', desc: 'Double charge detected on account renewal line. Charged for both standard and premium tiers.', dept: 'BILLING', cat: 'BILLING', sev: 'MEDIUM', status: 'ENDED', res: 'RESOLVED', rating: 5, comments: 'Refunding duplicate charge. Processed credit memo.', sent: 'POSITIVE' },
    { title: 'Refund Request for Down-time', desc: 'Requesting SLA rebate for loop outage occurred on June 3rd lasting 8 consecutive hours.', dept: 'BILLING', cat: 'BILLING', sev: 'LOW', status: 'ENDED', res: 'PARTIALLY_RESOLVED', rating: 3, comments: 'Credited $45 to the next bill. Compromise reached.', sent: 'NEUTRAL' },
    { title: 'Autopay Setup Failure', desc: 'ACH authorization failing on corporate checking accounts. Bank returned error 302.', dept: 'BILLING', cat: 'BILLING', sev: 'MEDIUM', status: 'ENDED', res: 'RESOLVED', rating: 5, comments: 'Confirmed bank details and re-authorized.', sent: 'POSITIVE' },
    { title: 'Admin Password Locked Out', desc: 'Corporate root user locked after 5 invalid attempts. MFA token sync out of phase.', dept: 'ACCOUNT_RECOVERY', cat: 'ACCOUNT_RECOVERY', sev: 'CRITICAL', status: 'ENDED', res: 'RESOLVED', rating: 5, comments: 'Secure MFA reset. Restored root admin access.', sent: 'POSITIVE' },
    { title: 'SSO SAML Integration Failure', desc: 'Active Directory federation returning signature verification failure (Error 403).', dept: 'ACCOUNT_RECOVERY', cat: 'ACCOUNT_RECOVERY', sev: 'HIGH', status: 'ENDED', res: 'ESCALATED', rating: 1, comments: 'Still locked out of SAML federated portals. Disappointed.', sent: 'NEGATIVE' },
    { title: 'Owner Transfer Verification', desc: 'Transferring portal ownership from previous IT Director to new CIO. Verification document uploaded.', dept: 'ACCOUNT_RECOVERY', cat: 'ACCOUNT_RECOVERY', sev: 'MEDIUM', status: 'ENDED', res: 'RESOLVED', rating: 5, comments: 'Processed IT notary transfer files. CIO is now primary owner.', sent: 'POSITIVE' },
    { title: 'Enterprise Tier Walkthrough', desc: 'Call with Acme CIO to demonstrate multi-tenant controls, coturn integration, and API limits.', dept: 'SALES', cat: 'PRODUCT_DEMO', sev: 'LOW', status: 'ENDED', res: 'RESOLVED', rating: 5, comments: 'Stunning demo! Booking procurement call next week.', sent: 'POSITIVE' },
    { title: 'API Rate Limit Quotation', desc: 'Pricing details requested for 50,000 concurrent WebRTC session minutes per month.', dept: 'SALES', cat: 'PRODUCT_DEMO', sev: 'MEDIUM', status: 'ENDED', res: 'RESOLVED', rating: 4, comments: 'Sent official quotation sheet.', sent: 'NEUTRAL' },
    { title: 'On-premise Deployment Query', desc: 'Reviewing security controls for air-gapped server installation requirements.', dept: 'SALES', cat: 'PRODUCT_DEMO', sev: 'LOW', status: 'ENDED', res: 'PARTIALLY_RESOLVED', rating: 3, comments: 'Explained docker and medsup layouts. Requires custom scoping.', sent: 'NEUTRAL' },
    { title: 'SLA Failure on Fiber Route', desc: 'Primary fiber trunk severed. Auto-failover to backup LTE took 4 minutes instead of 50ms.', dept: 'ESCALATIONS', cat: 'ESCALATION', sev: 'CRITICAL', status: 'ENDED', res: 'ESCALATED', rating: 2, comments: 'Routing to core engineering to fix routing convergence time.', sent: 'NEGATIVE' },
    { title: 'Executive Escalation: Data Leak', desc: 'Compliance officer flagged unauthorized guest join. Reviewing single-use invite tokens.', dept: 'ESCALATIONS', cat: 'ESCALATION', sev: 'CRITICAL', status: 'ENDED', res: 'RESOLVED', rating: 5, comments: 'Verified it was an internal test. Invite log cleared.', sent: 'POSITIVE' },
    { title: 'VoIP SIP Trunking Error', desc: 'Incoming calls returning busy tone. Packet capture shows code 486 Busy Here.', dept: 'TECHNICAL_SUPPORT', cat: 'TECHNICAL_SUPPORT', sev: 'HIGH', status: 'ACTIVE', res: null, rating: null, comments: null, sent: 'NEUTRAL' },
    { title: 'Billing Dispute: Extra Decoders', desc: 'Charged for 3 extra decoders that were returned back to warehouse on May 15.', dept: 'BILLING', cat: 'BILLING', sev: 'LOW', status: 'WAITING', res: null, rating: null, comments: null, sent: 'NEUTRAL' },
    { title: 'MFA Device Synchronization', desc: 'Authenticator app generating invalid OTP keys. Clock drift suspected.', dept: 'ACCOUNT_RECOVERY', cat: 'ACCOUNT_RECOVERY', sev: 'MEDIUM', status: 'CREATED', res: null, rating: null, comments: null, sent: 'NEUTRAL' }
  ];

  console.log('Seeding tickets and profiles...');
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    const ticketRef = `CASE-2026-${String(i + 1).padStart(4, '0')}`;
    const cust = customers[i % customers.length];
    
    // Check/create customer profile
    let profile = await prisma.customerProfile.findUnique({ where: { email: cust.email } });
    const mockSf = t.status === 'ENDED' && t.res === 'RESOLVED' ? `500${uuidv4().replace(/-/g, '').substring(0, 15).toUpperCase()}` : null;
    const mockHs = t.status === 'ENDED' && t.res === 'RESOLVED' ? `hs_deal_${Math.floor(100000000 + Math.random() * 900000000)}` : null;

    if (!profile) {
      profile = await prisma.customerProfile.create({
        data: {
          email: cust.email,
          displayName: cust.name,
          company: cust.company,
          phone: cust.phone,
          notes: `VIP support tier for ${cust.company}.`,
          slackUser: `@${cust.name.toLowerCase().replace(/ /g, '')}`,
          salesforceId: mockSf,
          hubspotId: mockHs,
        }
      });
    } else if (mockSf || mockHs) {
      await prisma.customerProfile.update({
        where: { email: cust.email },
        data: {
          salesforceId: profile.salesforceId || mockSf,
          hubspotId: profile.hubspotId || mockHs,
        }
      });
    }

    const createdDate = new Date();
    createdDate.setDate(createdDate.getDate() - (20 - i));
    const endedDate = t.status === 'ENDED' ? new Date(createdDate.getTime() + 25 * 60000) : null;

    // Create session
    const session = await prisma.session.create({
      data: {
        ticketRef,
        category: t.cat as any,
        severity: t.sev as any,
        department: t.dept as any,
        assignedAgentId: t.status === 'ENDED' ? agent.id : null,
        assignedTeam: t.dept === 'TECHNICAL_SUPPORT' ? 'Tier 2 Support' : 'Ops Team',
        title: t.title,
        description: t.desc,
        createdBy: admin.id,
        status: t.status as any,
        startedAt: t.status === 'ACTIVE' || t.status === 'ENDED' ? createdDate : null,
        endedAt: endedDate,
        agentNotes: t.status === 'ENDED' ? `Completed troubleshooting. ${t.desc}` : null,
        resolutionStatus: t.res as any,
        feedbackRating: t.rating,
        feedbackResolved: t.rating ? (t.res === 'RESOLVED' ? true : false) : null,
        feedbackComments: t.comments,
        sentiment: t.sent,
        escalatedAt: t.res === 'ESCALATED' ? createdDate : null,
        escalationReason: t.res === 'ESCALATED' ? 'Auto-escalated due to rating or high severity' : null,
        createdAt: createdDate,
        updatedAt: endedDate || createdDate,
      }
    });

    // Create participants
    await prisma.participant.create({
      data: {
        sessionId: session.id,
        userId: agent.id,
        displayName: 'Alex Agent',
        email: 'agent@supportstream.com',
        role: 'AGENT',
        joinedAt: createdDate,
        leftAt: endedDate,
        isConnected: t.status === 'ACTIVE' ? true : false,
      }
    });

    await prisma.participant.create({
      data: {
        sessionId: session.id,
        displayName: cust.name,
        email: cust.email,
        role: 'CUSTOMER',
        joinedAt: new Date(createdDate.getTime() + 2 * 60000),
        leftAt: endedDate,
        isConnected: t.status === 'ACTIVE' ? true : false,
      }
    });

    // Logs for completed calls
    if (t.status === 'ENDED') {
      await prisma.message.create({
        data: {
          sessionId: session.id,
          senderId: 'guest',
          senderName: cust.name,
          senderRole: 'CUSTOMER',
          content: 'Hello, I am having issues with the setup.',
          createdAt: new Date(createdDate.getTime() + 3 * 60000),
        }
      });

      await prisma.message.create({
        data: {
          sessionId: session.id,
          senderId: agent.id,
          senderName: 'Alex Agent',
          senderRole: 'AGENT',
          content: `Let's look at the ${t.title} issues. Let's do a screen share.`,
          createdAt: new Date(createdDate.getTime() + 4 * 60000),
        }
      });

      if (t.rating && t.rating >= 4) {
        await prisma.file.create({
          data: {
            sessionId: session.id,
            uploaderId: 'guest',
            uploaderName: cust.name,
            originalName: 'diagnostics_log.txt',
            storageKey: `files/${uuidv4()}_diagnostics_log.txt`,
            mimeType: 'text/plain',
            sizeBytes: 45000,
            isScanned: true,
            isSafe: true,
            createdAt: new Date(createdDate.getTime() + 5 * 60000),
          }
        });
      }

      if (t.res === 'RESOLVED') {
        await prisma.recording.create({
          data: {
            sessionId: session.id,
            storageKey: `recordings/${session.id}.mp4`,
            playbackUrl: `/api/v1/recordings/playback/${session.id}`,
            durationSeconds: 320,
            sizeBytes: 15000000,
            status: 'AVAILABLE',
            startedAt: new Date(createdDate.getTime() + 5 * 60000),
            endedAt: new Date(createdDate.getTime() + 10 * 60000),
            createdAt: new Date(createdDate.getTime() + 10 * 60000),
          }
        });
      }

      await prisma.sessionSummary.create({
        data: {
          sessionId: session.id,
          durationSec: Math.floor((endedDate!.getTime() - createdDate.getTime()) / 1000),
          participants: JSON.stringify([
            { name: 'Alex Agent', role: 'AGENT' },
            { name: cust.name, role: 'CUSTOMER' }
          ]),
          totalMessages: 6,
          totalFiles: t.rating && t.rating >= 4 ? 1 : 0,
          recordingUrl: t.res === 'RESOLVED' ? `/api/v1/recordings/playback/${session.id}` : null,
          endedBy: 'Alex Agent',
          createdAt: endedDate!,
        }
      });

      // Seeding Integration Log audits
      await prisma.webhookEvent.create({
        data: {
          event: 'SESSION_ENDED',
          payload: JSON.stringify({ sessionId: session.id, ticketRef, title: t.title, resolution: t.res }),
          attempts: 1,
          status: 'SENT',
          responseCode: 200,
          lastAttempt: endedDate,
          createdAt: endedDate!,
        }
      });

      if (t.res === 'RESOLVED') {
        await prisma.integrationLog.create({
          data: { provider: 'SALESFORCE', action: 'SYNC_CASE', status: 'SUCCESS', errorMsg: null, createdAt: endedDate! }
        });
        await prisma.integrationLog.create({
          data: { provider: 'HUBSPOT', action: 'SYNC_DEAL', status: 'SUCCESS', errorMsg: null, createdAt: new Date(endedDate!.getTime() + 1000) }
        });
      } else if (t.res === 'ESCALATED') {
        await prisma.integrationLog.create({
          data: { provider: 'SLACK', action: 'POST_MESSAGE', status: 'SUCCESS', errorMsg: null, createdAt: endedDate! }
        });
      }
    }
  }

  console.log('Database seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
