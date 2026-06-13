import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { UseGuards, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatService } from '../chat/chat.service';
import { ObservabilityService } from '../observability/observability.service';
import { Role, SessionState, JwtPayload, JoinRoomPayload, ChatMessagePayload } from '@supportstream/shared-types';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // Track active 5-minute reconnection timers per session ID
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  // Map socket IDs to JWT payloads for fast lookup on disconnect
  private socketSessionMap = new Map<string, { userId: string; role: Role; sessionId: string; displayName: string; email?: string }>();
  // Track active media producers per session
  private sessionProducers = new Map<string, { producerId: string; kind: string; socketId: string; isScreenShare: boolean }[]>();

  // Media server control endpoint
  private readonly mediaServerUrl = process.env.MEDIA_SERVER_URL || 'http://localhost:3002';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly observability: ObservabilityService,
  ) {}

  async handleConnection(socket: Socket) {
    // Authenticate socket handshake using JWT
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    
    if (!token) {
      this.observability.errorRateCounter.inc({ code: 'WS_UNAUTHORIZED' });
      socket.disconnect(true);
      return;
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-signing-key';
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
      
      const userId = payload.sub;
      const role = payload.role;
      const email = payload.email || undefined;
      const sessionId = payload.sessionId || socket.handshake.query?.sessionId as string;

      if (!sessionId) {
        throw new Error('Session ID required');
      }

      // Fetch user profile for display name
      let displayName = 'Guest Customer';
      if (role !== 'CUSTOMER') {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (user) displayName = user.displayName;
      }

      // Store socket mappings
      this.socketSessionMap.set(socket.id, { userId, role, sessionId, displayName, email });
      this.observability.wsConnectionsGauge.inc();
      
      console.log(`Socket connected: ${socket.id} (User: ${displayName}, Role: ${role}, Session: ${sessionId}, Email: ${email || 'None'})`);
    } catch (err) {
      console.error(`Socket auth failed:`, err);
      this.observability.errorRateCounter.inc({ code: 'WS_AUTH_FAILED' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const sessionInfo = this.socketSessionMap.get(socket.id);
    if (!sessionInfo) return;

    const { userId, role, sessionId, displayName } = sessionInfo;
    this.socketSessionMap.delete(socket.id);
    this.observability.wsConnectionsGauge.dec();

    console.log(`Socket disconnected: ${socket.id} (Session: ${sessionId})`);

    // Clean up sessionProducers state
    const list = this.sessionProducers.get(sessionId) || [];
    const updatedList = list.filter(p => p.socketId !== socket.id);
    if (updatedList.length === 0) {
      this.sessionProducers.delete(sessionId);
    } else {
      this.sessionProducers.set(sessionId, updatedList);
    }

    // Update DB connection states
    await this.prisma.participant.updateMany({
      where: role === 'CUSTOMER'
        ? { sessionId, role: 'CUSTOMER', isConnected: true }
        : { sessionId, userId, isConnected: true },
      data: { isConnected: false, leftAt: new Date() },
    });

    // Notify other participants
    this.server.to(sessionId).emit('user-left', { userId, displayName, role });

    // Handle 5-minute Reconnection Grace Window
    const disconnectedState: SessionState = role === 'CUSTOMER' ? 'CUSTOMER_DISCONNECTED' : 'AGENT_DISCONNECTED';
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { status: disconnectedState },
    });

    // Write timeline entry
    await this.prisma.timeline.create({
      data: {
        sessionId,
        event: 'Disconnected',
        participant: displayName,
      },
    });

    // Clear any previous timer
    if (this.reconnectTimers.has(sessionId)) {
      clearTimeout(this.reconnectTimers.get(sessionId)!);
    }

    // Set 5-minute grace window timer
    const graceWindowMs = 5 * 60 * 1000; // 5 minutes
    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(sessionId);
      
      // Update session to ABANDONED if timer expires
      const currentSession = await this.prisma.session.findUnique({ where: { id: sessionId } });
      if (currentSession && currentSession.status !== 'ENDED') {
        await this.prisma.session.update({
          where: { id: sessionId },
          data: { status: 'ABANDONED', endedAt: new Date() },
        });

        await this.prisma.timeline.create({
          data: {
            sessionId,
            event: 'Abandoned',
            participant: 'System Timeout',
          },
        });

        // Broadcast session end to remaining sockets in room
        this.server.to(sessionId).emit('session-ended', { reason: 'Grace window expired' });
        console.log(`Session ${sessionId} marked as ABANDONED due to inactivity`);
      }
    }, graceWindowMs);

    this.reconnectTimers.set(sessionId, timer);
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ) {
    const { sessionId, displayName, role } = payload;
    
    // Joint socket room
    await socket.join(sessionId);

    // Safety net: Update the mapped session ID and display name for this socket connection
    const sessionInfo = this.socketSessionMap.get(socket.id);
    if (sessionInfo) {
      sessionInfo.sessionId = sessionId;
      sessionInfo.displayName = displayName;
      this.socketSessionMap.set(socket.id, sessionInfo);
    }

    // Cancel 5-minute reconnect timer if it is running
    if (this.reconnectTimers.has(sessionId)) {
      clearTimeout(this.reconnectTimers.get(sessionId)!);
      this.reconnectTimers.delete(sessionId);
      
      // Track increment of reconnection analytics
      await this.prisma.sessionAnalytics.update({
        where: { sessionId },
        data: { reconnectCount: { increment: 1 } },
      }).catch(() => {}); // Analytics might not exist yet if CREATED status
    }

    const userId = sessionInfo?.userId || 'unknown';
    const email = sessionInfo?.email || null;

    // Log participant entry in DB
    const existingParticipant = await this.prisma.participant.findFirst({
      where: role === 'CUSTOMER'
        ? { sessionId, role: 'CUSTOMER' }
        : { sessionId, userId },
    });

    if (existingParticipant) {
      await this.prisma.participant.update({
        where: { id: existingParticipant.id },
        data: { isConnected: true, leftAt: null, displayName, email },
      });
      
      await this.prisma.timeline.create({
        data: { sessionId, event: 'Reconnected', participant: displayName },
      });
    } else {
      await this.prisma.participant.create({
        data: { sessionId, userId: role !== 'CUSTOMER' ? userId : null, displayName, role, email },
      });
    }

    // Set Session active
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'ACTIVE', startedAt: new Date() },
    });

    // Notify room
    this.server.to(sessionId).emit('user-joined', { userId, displayName, role, socketId: socket.id });
    
    const existingProducers = this.sessionProducers.get(sessionId) || [];
    const otherProducers = existingProducers.filter(p => p.socketId !== socket.id);

    return { 
      success: true, 
      session, 
      existingProducers: otherProducers.map(p => ({
        producerId: p.producerId,
        kind: p.kind,
        isScreenShare: p.isScreenShare,
      }))
    };
  }

  @SubscribeMessage('chat-message')
  async handleChatMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ChatMessagePayload,
  ) {
    const sessionInfo = this.socketSessionMap.get(socket.id);
    if (!sessionInfo) throw new UnauthorizedException();

    const { userId, role, sessionId, displayName } = sessionInfo;

    // Persist to Neon DB
    const saved = await this.chatService.saveMessage(
      sessionId,
      userId,
      displayName,
      role,
      payload.content,
    );

    // Broadcast to room
    this.server.to(sessionId).emit('chat-message', {
      id: saved.id,
      senderId: userId,
      senderName: displayName,
      senderRole: role,
      content: payload.content,
      createdAt: saved.createdAt,
    });

    // Increment metrics
    this.observability.chatMessagesCounter.inc();
  }

  // ==========================================
  @SubscribeMessage('p2p-signal')
  handleP2pSignal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { action: string; data: any },
  ) {
    const sessionInfo = this.socketSessionMap.get(socket.id);
    if (!sessionInfo) throw new UnauthorizedException();
    const { sessionId } = sessionInfo;
    socket.to(sessionId).emit('p2p-signal', {
      senderSocketId: socket.id,
      action: payload.action,
      data: payload.data,
    });
    return { success: true };
  }

  @SubscribeMessage('media-signal')
  async handleMediaSignal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { action: string; data: any },
  ) {
    const sessionInfo = this.socketSessionMap.get(socket.id);
    if (!sessionInfo) throw new UnauthorizedException();

    const { sessionId } = sessionInfo;

    try {
      // Forward request to local media-server endpoint
      const response = await fetch(`${this.mediaServerUrl}/api/v1/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          socketId: socket.id,
          action: payload.action,
          data: payload.data,
        }),
      });

      const result = await response.json();

      if (payload.action === 'produce' && result.success) {
        const list = this.sessionProducers.get(sessionId) || [];
        list.push({
          producerId: result.data.id,
          kind: payload.data.kind,
          socketId: socket.id,
          isScreenShare: payload.data.isScreenShare || false,
        });
        this.sessionProducers.set(sessionId, list);

        socket.to(sessionId).emit('new-producer', {
          producerId: result.data.id,
          kind: payload.data.kind,
          userId: sessionInfo.userId,
          displayName: sessionInfo.displayName,
          role: sessionInfo.role,
          isScreenShare: payload.data.isScreenShare || false,
        });
      }

      return result;
    } catch (err: any) {
      console.error('Failed to proxy media signal to media-server:', err.message);
      this.observability.errorRateCounter.inc({ code: 'MEDIA_PROXY_ERROR' });
      return { success: false, error: err.message };
    }
  }

  @SubscribeMessage('recording-control')
  async handleRecordingControl(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { action: 'start' | 'stop'; recordingId?: string },
  ) {
    const sessionInfo = this.socketSessionMap.get(socket.id);
    if (!sessionInfo || sessionInfo.role === 'CUSTOMER') throw new UnauthorizedException();

    const { sessionId, displayName } = sessionInfo;

    if (payload.action === 'start') {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { status: 'RECORDING' },
      });
      // Broadcast state
      this.server.to(sessionId).emit('recording-started', { startedBy: displayName, timestamp: new Date() });
      this.observability.recordingCountCounter.inc();
    } else {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { status: 'ACTIVE' },
      });
      this.server.to(sessionId).emit('recording-stopped', { stoppedBy: displayName, timestamp: new Date() });
    }

    return { success: true };
  }

  @SubscribeMessage('connection-quality')
  handleConnectionQuality(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { stats: any; quality: string },
  ) {
    const sessionInfo = this.socketSessionMap.get(socket.id);
    if (!sessionInfo) return;

    // Relay quality stats to other room participants (e.g. Agent dashboard quality indicator)
    this.server.to(sessionInfo.sessionId).emit('connection-quality', {
      participantId: sessionInfo.userId,
      displayName: sessionInfo.displayName,
      quality: payload.quality,
      stats: payload.stats,
    });
  }

  @SubscribeMessage('user-media-state')
  handleUserMediaState(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { micEnabled: boolean; cameraEnabled: boolean },
  ) {
    const sessionInfo = this.socketSessionMap.get(socket.id);
    if (!sessionInfo) return;

    // Relay camera/microphone enabled state to other room participants
    this.server.to(sessionInfo.sessionId).emit('user-media-state', {
      participantId: sessionInfo.userId,
      role: sessionInfo.role,
      micEnabled: payload.micEnabled,
      cameraEnabled: payload.cameraEnabled,
    });
  }

  @SubscribeMessage('active-speaker')
  handleActiveSpeaker(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { volume: number },
  ) {
    const sessionInfo = this.socketSessionMap.get(socket.id);
    if (!sessionInfo) return;

    // Broadcast speaker volume triggers for border glow animations
    this.server.to(sessionInfo.sessionId).emit('active-speaker', {
      participantId: sessionInfo.userId,
      volume: payload.volume,
    });
  }
}
