import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export class SocketClientManager {
  private socket: Socket | null = null;
  private currentToken: string | null = null;
  private currentSessionId: string | null = null;

  connect(token: string, sessionId?: string): Socket {
    const targetSessionId = sessionId || null;
    if (this.socket && this.socket.connected && this.currentToken === token && this.currentSessionId === targetSessionId) {
      return this.socket;
    }

    if (this.socket) {
      console.log('Socket connection parameters changed or socket disconnected. Reconnecting...');
      this.disconnect();
    }

    this.currentToken = token;
    this.currentSessionId = targetSessionId;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      query: sessionId ? { sessionId } : {},
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Socket.IO connection established with signaling server:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('Socket.IO disconnected from signaling server:', reason);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentToken = null;
    this.currentSessionId = null;
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketManager = new SocketClientManager();
