import { Injectable, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SupportCategory, IssueSeverity, Department, ResolutionStatus } from '@supportstream/shared-types';
import { CreateSessionDto } from './dto/create-session.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { AIService } from './ai.service';
import { IntegrationsService } from './integrations.service';
import { ApiResponse, SessionState, AuditAction, JwtPayload } from '@supportstream/shared-types';
import * as crypto from 'crypto';

@Injectable()
export class SessionsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly aiService: AIService,
    private readonly integrationsService: IntegrationsService,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.prisma.workflowRule.count();
      if (count === 0) {
        await this.prisma.workflowRule.createMany({
          data: [
            { trigger: 'SESSION_ENDED', action: 'POST_TO_WEBHOOK', enabled: true },
            { trigger: 'SESSION_ENDED', action: 'POST_TO_SLACK', enabled: true },
            { trigger: 'SESSION_ENDED', action: 'SYNC_TO_SALESFORCE', enabled: true },
            { trigger: 'SESSION_ENDED', action: 'SYNC_TO_HUBSPOT', enabled: true },
            { trigger: 'FEEDBACK_RECEIVED', action: 'POST_TO_WEBHOOK', enabled: true },
          ],
        });
        console.log('[Workflow Seed] Seeded default workflow rules successfully.');
      }
    } catch (err: any) {
      console.error('[Workflow Seed] Failed to seed default workflow rules:', err.message);
    }
  }

  // ==========================================
  // Support Session Creation with Atomic TicketRef
  // ==========================================
  async createSession(dto: CreateSessionDto, agentId: string, ipAddress?: string): Promise<ApiResponse<any>> {
    // 1. Atomic TicketSequence increment
    const seq = await this.prisma.ticketSequence.upsert({
      where: { id: 1 },
      update: { current: { increment: 1 } },
      create: { id: 1, current: 1 }
    });
    
    const ticketRef = `CASE-2026-${String(seq.current).padStart(4, '0')}`;

    // 2. Write Session record
    const session = await this.prisma.session.create({
      data: {
        ticketRef,
        title: dto.title,
        description: dto.description || null,
        category: (dto.category || 'TECHNICAL_SUPPORT') as SupportCategory,
        severity: (dto.severity || 'MEDIUM') as IssueSeverity,
        department: (dto.department || 'TECHNICAL_SUPPORT') as Department,
        assignedAgentId: dto.assignedAgentId || agentId,
        assignedTeam: dto.assignedTeam || null,
        createdBy: agentId,
        status: 'CREATED',
      },
    });

    // 3. Write audit log
    await this.prisma.auditLog.create({
      data: {
        userId: agentId,
        sessionId: session.id,
        action: 'SESSION_CREATED',
        ipAddress,
        payload: JSON.stringify({ ticketRef, title: dto.title }),
      },
    });

    // 4. Generate initial invite
    const invite = await this.generateInvite(session.id, agentId, ipAddress);

    // 5. Fire background notifications
    this.integrationsService.dispatchWebhook('SESSION_CREATED', {
      sessionId: session.id,
      ticketRef: session.ticketRef,
      category: session.category,
      severity: session.severity,
      title: session.title,
    }).catch(err => console.error('Webhook dispatch failed:', err));

    this.integrationsService.postToSlack(ticketRef, `New support session created: *${session.title}* in department: ${session.department}`).catch(err => console.error('Slack post failed:', err));

    return {
      success: true,
      data: {
        session,
        inviteToken: invite.token,
      },
    };
  }

  async generateInvite(sessionId: string, agentId: string, ipAddress?: string): Promise<any> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.deletedAt) {
      throw new NotFoundException({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
      });
    }

    const secret = this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-signing-key';
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const inviteId = crypto.randomUUID();
    const token = await this.jwtService.signAsync(
      {
        sub: inviteId,
        sessionId,
        role: 'CUSTOMER',
        type: 'invite',
      },
      {
        secret,
        expiresIn: '24h',
      },
    );

    const invite = await this.prisma.invite.create({
      data: {
        sessionId,
        token,
        createdBy: agentId,
        expiresAt,
        createdIp: ipAddress,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: agentId,
        sessionId,
        action: 'INVITE_CREATED',
        ipAddress,
        payload: JSON.stringify({ inviteId: invite.id }),
      },
    });

    return invite;
  }

  async regenerateInvite(sessionId: string, agentId: string, ipAddress?: string): Promise<ApiResponse<any>> {
    await this.prisma.invite.updateMany({
      where: { sessionId, isUsed: false, isRevoked: false },
      data: { isRevoked: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: agentId,
        sessionId,
        action: 'INVITE_REVOKED',
        ipAddress,
        payload: JSON.stringify({ reason: 'Regeneration requested' }),
      },
    });

    const newInvite = await this.generateInvite(sessionId, agentId, ipAddress);

    await this.prisma.auditLog.create({
      data: {
        userId: agentId,
        sessionId,
        action: 'INVITE_REGENERATED',
        ipAddress,
        payload: JSON.stringify({ inviteId: newInvite.id }),
      },
    });

    return {
      success: true,
      data: {
        inviteToken: newInvite.token,
      },
    };
  }

  // ==========================================
  // Guest Join with CRM profile creation
  // ==========================================
  async joinInvite(
    token: string,
    ipAddress?: string,
    clientData?: { displayName: string; email: string; company?: string; phone?: string; notes?: string }
  ): Promise<ApiResponse<{ accessToken: string; session: any }>> {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: { session: true },
    });

    if (!invite || invite.session.deletedAt) {
      throw new NotFoundException({
        success: false,
        error: { code: 'INVITE_NOT_FOUND', message: 'Invite token is invalid or does not exist' },
      });
    }

    // Increment join attempts
    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { joinAttempts: { increment: 1 } },
    });

    if (invite.isRevoked) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'INVITE_REVOKED', message: 'This invite link has been revoked' },
      });
    }

    if (invite.session.status === 'ENDED') {
      throw new ForbiddenException({
        success: false,
        error: { code: 'SESSION_ALREADY_ENDED', message: 'This support session has already ended' },
      });
    }

    // Allow invite link reuse for guest rejoin support (removed strictly single-use isUsed check)

    if (invite.expiresAt < new Date()) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'INVITE_EXPIRED', message: 'This invite link has expired' },
      });
    }

    // Mark as used
    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { isUsed: true, usedAt: new Date(), usedIp: ipAddress },
    });

    // Write session timeline event
    await this.prisma.timeline.create({
      data: {
        sessionId: invite.sessionId,
        event: 'Joined',
        participant: clientData?.displayName || 'Guest Customer',
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        sessionId: invite.sessionId,
        action: 'SESSION_JOINED',
        ipAddress,
        payload: JSON.stringify({ inviteId: invite.id, role: 'CUSTOMER', email: clientData?.email }),
      },
    });

    // Create or Sync Customer CRM Profile
    if (clientData?.email) {
      await this.prisma.customerProfile.upsert({
        where: { email: clientData.email },
        update: {
          displayName: clientData.displayName,
          company: clientData.company || null,
          phone: clientData.phone || null,
          notes: clientData.notes || null,
          updatedAt: new Date(),
        },
        create: {
          email: clientData.email,
          displayName: clientData.displayName,
          company: clientData.company || null,
          phone: clientData.phone || null,
          notes: clientData.notes || null,
        },
      });
    }

    // Update Session status to WAITING (waiting for active streams / socket connection)
    await this.prisma.session.update({
      where: { id: invite.sessionId },
      data: { status: 'WAITING' },
    });

    // Generate scoped short-lived guest access JWT
    const secret = this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-signing-key';
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: crypto.randomUUID(), // Guest customer temporary user ID
      role: 'CUSTOMER',
      email: clientData?.email || undefined,
      sessionId: invite.sessionId,
      type: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret,
      expiresIn: '4h',
    });

    return {
      success: true,
      data: {
        accessToken,
        session: {
          id: invite.session.id,
          title: invite.session.title,
          description: invite.session.description,
          status: invite.session.status,
        },
      },
    };
  }

  async getSessionDetails(sessionId: string): Promise<ApiResponse<any>> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        participants: true,
        summary: true,
        recordings: true,
        files: true,
        invites: true,
      },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return { success: true, data: session };
  }

  async getSessionHistory(userId: string, role: string): Promise<ApiResponse<any[]>> {
    const sessions = await this.prisma.session.findMany({
      where: {
        deletedAt: null,
        ...(role === 'AGENT' ? { createdBy: userId } : {}), // Admins see everything
      },
      include: {
        participants: true,
        summary: true,
        recordings: true,
        invites: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: sessions };
  }

  // ==========================================
  // End Support Session with Notes & Auto Escalations
  // ==========================================
  async endSession(
    sessionId: string,
    userId: string,
    displayName: string,
    ipAddress?: string,
    endData?: { resolutionStatus: string; agentNotes?: string }
  ): Promise<ApiResponse<any>> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        participants: true,
        messages: true,
        files: true,
        recordings: true,
      },
    });

    if (!session || session.deletedAt) {
      throw new NotFoundException({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
      });
    }

    if (session.status === 'ENDED') {
      throw new BadRequestException({
        success: false,
        error: { code: 'SESSION_ALREADY_ENDED', message: 'Session is already closed' },
      });
    }

    const endedAt = new Date();
    const startedAt = session.startedAt || session.createdAt;
    const durationSec = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

    const resolutionStatus = (endData?.resolutionStatus || 'RESOLVED') as ResolutionStatus;
    const agentNotes = endData?.agentNotes || null;

    // Ticket Escalation Engine
    let severity = session.severity;
    let department = session.department;
    let escalatedAt = null;
    let escalationReason = null;

    if (resolutionStatus === 'ESCALATED') {
      severity = 'CRITICAL';
      department = 'ESCALATIONS';
      escalatedAt = new Date();
      escalationReason = `Agent escalated support session during close. Notes: ${agentNotes || 'None'}`;
    }

    // Update Session status
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'ENDED',
        endedAt,
        resolutionStatus,
        agentNotes,
        severity,
        department,
        escalatedAt,
        escalationReason,
      },
    });

    // Write timeline logs
    await this.prisma.timeline.create({
      data: {
        sessionId,
        event: `Resolution status set to ${resolutionStatus}`,
        participant: displayName,
      },
    });

    await this.prisma.timeline.create({
      data: {
        sessionId,
        event: 'Ended',
        participant: displayName,
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        userId,
        sessionId,
        action: 'SESSION_ENDED',
        ipAddress,
        payload: JSON.stringify({ durationSec, endedBy: displayName, resolutionStatus }),
      },
    });

    // Build participants list payload for JSON
    const participantsData = session.participants.map(p => ({
      name: p.displayName,
      role: p.role,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt || endedAt,
    }));

    // Generate or Update SessionSummary (using upsert to avoid Unique Constraint failures on retry/abandoned)
    const summary = await this.prisma.sessionSummary.upsert({
      where: { sessionId },
      update: {
        durationSec,
        participants: JSON.stringify(participantsData),
        totalMessages: session.messages.length,
        totalFiles: session.files.length,
        recordingUrl: session.recordings[0]?.playbackUrl || null,
        endedBy: displayName,
      },
      create: {
        sessionId,
        durationSec,
        participants: JSON.stringify(participantsData),
        totalMessages: session.messages.length,
        totalFiles: session.files.length,
        recordingUrl: session.recordings[0]?.playbackUrl || null,
        endedBy: displayName,
      },
    });

    // Generate SessionAnalytics
    const recBytes = session.recordings.reduce((sum, r) => sum + BigInt(r.sizeBytes), BigInt(0));
    
    // Conversation Sentiment Indicator calculations
    const conversationSentiment = this.aiService.analyzeSentiment(session.messages);
    
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { sentiment: conversationSentiment }
    });

    // Generate or Update SessionAnalytics (using upsert to avoid Unique Constraint failures on retry/abandoned)
    await this.prisma.sessionAnalytics.upsert({
      where: { sessionId },
      update: {
        durationSec,
        totalMessages: session.messages.length,
        totalFiles: session.files.length,
        recordingBytes: recBytes,
      },
      create: {
        sessionId,
        durationSec,
        totalMessages: session.messages.length,
        totalFiles: session.files.length,
        recordingBytes: recBytes,
        reconnectCount: 0,
        averageRttMs: 0.0,
        averagePacketLoss: 0.0,
      },
    });

    // Fire background integration jobs matching active WorkflowRules
    this.prisma.workflowRule.findMany({ where: { enabled: true } }).then(activeRules => {
      const customerParticipant = session.participants.find(p => p.role === 'CUSTOMER');

      if (activeRules.some(r => r.trigger === 'SESSION_ENDED' && r.action === 'POST_TO_WEBHOOK')) {
        this.integrationsService.dispatchWebhook('SESSION_ENDED', {
          sessionId,
          ticketRef: session.ticketRef,
          resolutionStatus,
          durationSec,
          sentiment: conversationSentiment,
        }).catch(err => console.error('Webhook dispatch failed:', err));
      }

      if (activeRules.some(r => r.trigger === 'SESSION_ENDED' && r.action === 'POST_TO_SLACK')) {
        this.integrationsService.postToSlack(session.ticketRef || 'CASE-2026-0000', `Support session ended: status is *${resolutionStatus}*, customer sentiment: ${conversationSentiment}`).catch(err => console.error('Slack sync failed:', err));
      }

      if (customerParticipant && customerParticipant.email) {
        if (activeRules.some(r => r.trigger === 'SESSION_ENDED' && r.action === 'SYNC_TO_SALESFORCE')) {
          this.integrationsService.syncToSalesforce(sessionId, session.ticketRef || 'CASE-2026-0000', {
            title: session.title,
            customerEmail: customerParticipant.email,
            resolutionStatus,
            agentNotes,
          }).catch(err => console.error('SF sync failed:', err));
        }

        if (activeRules.some(r => r.trigger === 'SESSION_ENDED' && r.action === 'SYNC_TO_HUBSPOT')) {
          this.integrationsService.syncToHubSpot(sessionId, session.ticketRef || 'CASE-2026-0000', {
            title: session.title,
            customerEmail: customerParticipant.email,
            resolutionStatus,
            agentNotes,
          }).catch(err => console.error('HS sync failed:', err));
        }
      }
    }).catch(err => console.error('Failed to retrieve active workflow rules:', err));

    return {
      success: true,
      data: {
        session: updatedSession,
        summary,
      },
    };
  }

  // ==========================================
  // Customer Feedback submission & Escalation trigger
  // ==========================================
  async submitFeedback(
    sessionId: string,
    rating: number,
    resolved: boolean,
    comments?: string,
  ): Promise<ApiResponse<any>> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    let severity = session.severity;
    let department = session.department;
    let escalatedAt = session.escalatedAt;
    let escalationReason = session.escalationReason;

    // Escalation check for poor customer experience (<= 2 stars)
    if (rating <= 2) {
      severity = 'CRITICAL';
      department = 'ESCALATIONS';
      escalatedAt = new Date();
      escalationReason = `Customer submitted poor feedback rating (${rating}/5). Comments: ${comments || 'None'}`;
    }

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        feedbackRating: rating,
        feedbackResolved: resolved,
        feedbackComments: comments || null,
        severity,
        department,
        escalatedAt,
        escalationReason,
      },
    });

    await this.prisma.timeline.create({
      data: {
        sessionId,
        event: 'Feedback Received',
        participant: `Customer Rating: ${rating} Star(s)`,
      },
    });

    this.prisma.workflowRule.findMany({ where: { enabled: true } }).then(activeRules => {
      if (activeRules.some(r => r.trigger === 'FEEDBACK_RECEIVED' && r.action === 'POST_TO_WEBHOOK')) {
        this.integrationsService.dispatchWebhook('FEEDBACK_RECEIVED', {
          sessionId,
          ticketRef: session.ticketRef,
          rating,
          resolved,
          comments,
        }).catch(err => console.error('Feedback webhook failed:', err));
      }
    }).catch(err => console.error('Failed to retrieve active workflow rules:', err));

    return { success: true, data: updatedSession };
  }

  // ==========================================
  // Customer Profile & Support history Lookup by Email
  // ==========================================
  async getCustomerProfileByEmail(email: string): Promise<ApiResponse<any>> {
    const profile = await this.prisma.customerProfile.findUnique({
      where: { email },
    });

    // Find all ended sessions where participant email matches
    const participants = await this.prisma.participant.findMany({
      where: { email, role: 'CUSTOMER' },
      include: {
        session: {
          include: {
            summary: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const cases = participants.map(p => ({
      ticketRef: p.session.ticketRef,
      title: p.session.title,
      category: p.session.category,
      severity: p.session.severity,
      resolutionStatus: p.session.resolutionStatus,
      agentNotes: p.session.agentNotes,
      endedAt: p.session.endedAt,
    }));

    return {
      success: true,
      data: {
        profile,
        cases,
      },
    };
  }

  // ==========================================
  // Workflow Rules & Integrations Management
  // ==========================================
  async getWorkflowRules(): Promise<any[]> {
    return this.prisma.workflowRule.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWorkflowRule(trigger: string, action: string): Promise<any> {
    return this.prisma.workflowRule.create({
      data: { trigger, action, enabled: true },
    });
  }

  async toggleWorkflowRule(id: string, enabled: boolean): Promise<any> {
    return this.prisma.workflowRule.update({
      where: { id },
      data: { enabled },
    });
  }

  async deleteWorkflowRule(id: string): Promise<any> {
    return this.prisma.workflowRule.delete({
      where: { id },
    });
  }

  async getIntegrationLogs(): Promise<any[]> {
    return this.prisma.integrationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getWebhookEvents(): Promise<any[]> {
    return this.prisma.webhookEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async updateSession(
    sessionId: string,
    userId: string,
    updateData: {
      title?: string;
      description?: string;
      category?: string;
      severity?: string;
      department?: string;
      status?: string;
      resolutionStatus?: string;
      agentNotes?: string;
    },
    ipAddress?: string,
  ): Promise<ApiResponse<any>> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const data: any = {};
    if (updateData.title !== undefined) data.title = updateData.title;
    if (updateData.description !== undefined) data.description = updateData.description;
    if (updateData.category !== undefined) data.category = updateData.category as SupportCategory;
    if (updateData.severity !== undefined) data.severity = updateData.severity as IssueSeverity;
    if (updateData.department !== undefined) data.department = updateData.department as Department;
    if (updateData.status !== undefined) data.status = updateData.status as any;
    if (updateData.resolutionStatus !== undefined) data.resolutionStatus = updateData.resolutionStatus as ResolutionStatus;
    if (updateData.agentNotes !== undefined) data.agentNotes = updateData.agentNotes;

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data,
    });

    // Write timeline event
    await this.prisma.timeline.create({
      data: {
        sessionId,
        event: 'Session Updated',
        participant: `Fields: ${Object.keys(updateData).join(', ')}`,
      },
    });

    return { success: true, data: updatedSession };
  }

  async deleteSession(
    sessionId: string,
    userId: string,
    ipAddress?: string,
  ): Promise<ApiResponse<any>> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        deletedAt: new Date(),
      },
    });

    // Write timeline event
    await this.prisma.timeline.create({
      data: {
        sessionId,
        event: 'Session Archived',
        participant: 'System',
      },
    });

    return { success: true, data: updatedSession };
  }

  async requestSession(
    payload: {
      displayName: string;
      email: string;
      title: string;
      category: string;
      description?: string;
    },
    ipAddress?: string,
  ): Promise<ApiResponse<{ accessToken: string; session: any }>> {
    const { displayName, email, title, category, description } = payload;

    // 1. Find a system/creator user to satisfy foreign key constraint
    const defaultUser = await this.prisma.user.findFirst();
    if (!defaultUser) {
      throw new BadRequestException({
        success: false,
        error: { code: 'NO_AGENTS_AVAILABLE', message: 'No support agents are registered in the system yet.' },
      });
    }

    // 2. Generate unique ticket reference
    const seq = await this.prisma.ticketSequence.upsert({
      where: { id: 1 },
      update: { current: { increment: 1 } },
      create: { id: 1, current: 1 }
    });
    const ticketRef = `CASE-2026-${String(seq.current).padStart(4, '0')}`;

    // 3. Create the session in the DB
    const mappedCategory = (category || 'TECHNICAL_SUPPORT') as SupportCategory;
    
    let mappedDept: Department = 'TECHNICAL_SUPPORT';
    if (category === 'BILLING') mappedDept = 'BILLING';
    else if (category === 'ACCOUNT_RECOVERY') mappedDept = 'ACCOUNT_RECOVERY';
    else if (category === 'PRODUCT_DEMO' || category === 'SALES') mappedDept = 'SALES';
    else if (category === 'ESCALATION') mappedDept = 'ESCALATIONS';

    const session = await this.prisma.session.create({
      data: {
        ticketRef,
        title,
        description: description || null,
        category: mappedCategory,
        department: mappedDept,
        severity: 'MEDIUM',
        status: 'WAITING',
        createdBy: defaultUser.id,
      },
    });

    // 4. Create participant entry for the customer
    await this.prisma.participant.create({
      data: {
        sessionId: session.id,
        displayName,
        role: 'CUSTOMER',
        email,
        isConnected: false,
      },
    });

    // 5. Create or Sync Customer CRM Profile
    await this.prisma.customerProfile.upsert({
      where: { email },
      update: {
        displayName,
        updatedAt: new Date(),
      },
      create: {
        email,
        displayName,
      },
    });

    // 6. Generate an invite for the session
    const inviteId = crypto.randomUUID();
    const inviteToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.invite.create({
      data: {
        id: inviteId,
        sessionId: session.id,
        token: inviteToken,
        createdBy: defaultUser.id,
        isUsed: true,
        usedAt: new Date(),
        usedIp: ipAddress,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        createdIp: ipAddress,
      },
    });

    // 7. Generate timeline and audit logs
    await this.prisma.timeline.create({
      data: {
        sessionId: session.id,
        event: 'Created',
        participant: displayName,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        sessionId: session.id,
        action: 'SESSION_CREATED',
        ipAddress,
        payload: JSON.stringify({ ticketRef, title, email, category }),
      },
    });

    // 8. Generate guest access token
    const secret = this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-signing-key';
    const jwtPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: crypto.randomUUID(),
      role: 'CUSTOMER',
      email,
      sessionId: session.id,
      type: 'access',
    };

    const accessToken = await this.jwtService.signAsync(jwtPayload, {
      secret,
      expiresIn: '4h',
    });

    // 9. Fire background notifications
    this.integrationsService.dispatchWebhook('SESSION_CREATED', {
      sessionId: session.id,
      ticketRef: session.ticketRef,
      category: session.category,
      department: session.department,
    }).catch(() => {});

    return {
      success: true,
      data: {
        accessToken,
        session: {
          id: session.id,
          title: session.title,
          description: session.description,
          status: session.status,
        },
      },
    };
  }
}

