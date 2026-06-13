// ==========================================
// SupportStream Shared Types & API Contracts
// ==========================================

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT' | 'CUSTOMER';

export type SessionState =
  | 'CREATED'
  | 'WAITING'
  | 'ACTIVE'
  | 'RECORDING'
  | 'AGENT_DISCONNECTED'
  | 'CUSTOMER_DISCONNECTED'
  | 'RECONNECTING'
  | 'ENDED'
  | 'ABANDONED';

export type RecordingStatus = 'RECORDING' | 'PROCESSING' | 'AVAILABLE' | 'FAILED';

export type SupportCategory =
  | 'TECHNICAL_SUPPORT'
  | 'BILLING'
  | 'ACCOUNT_RECOVERY'
  | 'INSTALLATION'
  | 'PRODUCT_DEMO'
  | 'ESCALATION';

export type ResolutionStatus =
  | 'RESOLVED'
  | 'PARTIALLY_RESOLVED'
  | 'ESCALATED'
  | 'NO_RESPONSE';

export type IssueSeverity =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type Department =
  | 'TECHNICAL_SUPPORT'
  | 'BILLING'
  | 'ACCOUNT_RECOVERY'
  | 'SALES'
  | 'ESCALATIONS';

export type WebhookStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED';

export type AuditAction =
  | 'LOGIN'
  | 'SESSION_CREATED'
  | 'SESSION_JOINED'
  | 'RECORDING_STARTED'
  | 'RECORDING_STOPPED'
  | 'FILE_UPLOADED'
  | 'SESSION_ENDED'
  | 'INVITE_CREATED'
  | 'INVITE_REGENERATED'
  | 'INVITE_REVOKED';

// ==========================================
// JWT Payload Claims Structure
// ==========================================
export interface JwtPayload {
  sub: string;
  role: Role;
  email?: string;     // Added to track customer email mapping
  sessionId?: string; // Optional: Scoped access limit for guest customers
  type: 'access';
  iat: number;
  exp: number;
}

// ==========================================
// Standard API Envelope
// ==========================================
export interface ApiError {
  code: string;
  message: string;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

// ==========================================
// Socket.IO Event Payloads
// ==========================================

export interface JoinRoomPayload {
  sessionId: string;
  displayName: string;
  role: Role;
  email?: string; // Added to track customer email mapping
}

export interface ChatMessagePayload {
  content: string;
  timestamp: string; // ISO date string
}

export interface RecordingStartedPayload {
  startedBy: string;
  timestamp: string; // ISO date string
}

export interface ConnectionQualityPayload {
  targetParticipantId: string;
  quality: 'Excellent' | 'Good' | 'Poor';
  stats: {
    rtt: number;
    packetLoss: number;
    bitrate: number;
  };
}

export interface IceRestartPayload {
  sdp: string;
}

// WebSocket Event Names Registry
export const SOCKET_EVENTS = {
  JOIN_ROOM: 'join-room',
  LEAVE_ROOM: 'leave-room',
  CHAT_MESSAGE: 'chat-message',
  USER_JOINED: 'user-joined',
  USER_LEFT: 'user-left',
  RECORDING_STARTED: 'recording-started',
  RECORDING_STOPPED: 'recording-stopped',
  FILE_UPLOADED: 'file-uploaded',
  CONNECTION_QUALITY: 'connection-quality',
  ICE_RESTART: 'ice-restart',
  SESSION_ENDED: 'session-ended',
} as const;
