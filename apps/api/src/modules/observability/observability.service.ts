import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as client from 'prom-client';
import Redis from 'ioredis';

@Injectable()
export class ObservabilityService {
  private redisClient: Redis | null = null;

  // Prometheus Metrics Registers
  public readonly activeSessionsGauge: client.Gauge<string>;
  public readonly activeParticipantsGauge: client.Gauge<string>;
  public readonly recordingCountCounter: client.Counter<string>;
  public readonly chatMessagesCounter: client.Counter<string>;
  public readonly errorRateCounter: client.Counter<string>;
  public readonly wsConnectionsGauge: client.Gauge<string>;
  public readonly apiLatencyHistogram: client.Histogram<string>;

  constructor(private readonly prisma: PrismaService) {
    // Enable prom-client default system metrics (CPU, Memory, etc.)
    client.collectDefaultMetrics();

    this.activeSessionsGauge = new client.Gauge({
      name: 'active_sessions',
      help: 'Total number of active support call sessions',
    });

    this.activeParticipantsGauge = new client.Gauge({
      name: 'active_participants',
      help: 'Total number of active participants in support calls',
    });

    this.recordingCountCounter = new client.Counter({
      name: 'recording_count',
      help: 'Total number of session recordings generated',
    });

    this.chatMessagesCounter = new client.Counter({
      name: 'chat_messages_total',
      help: 'Total number of chat messages sent',
    });

    this.errorRateCounter = new client.Counter({
      name: 'error_rate_total',
      help: 'Total number of API/Websocket errors thrown',
      labelNames: ['code'],
    });

    this.wsConnectionsGauge = new client.Gauge({
      name: 'websocket_connections',
      help: 'Current active WebSocket signaling connections',
    });

    this.apiLatencyHistogram = new client.Histogram({
      name: 'api_latency_seconds',
      help: 'API request execution latencies',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    });

    // Initialize Redis client if configured
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.redisClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
      } catch (err) {
        console.error('Failed to instantiate Redis client for readiness checks:', err);
      }
    }
  }

  async runDatabaseCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      console.error('Database liveness check failed:', err);
      return false;
    }
  }

  async runRedisCheck(): Promise<boolean> {
    if (!this.redisClient) {
      // If Redis is not configured, we bypass and return true (optional dependency)
      return true;
    }
    try {
      await this.redisClient.connect();
      const pong = await this.redisClient.ping();
      this.redisClient.disconnect();
      return pong === 'PONG';
    } catch (err) {
      console.error('Redis liveness check failed:', err);
      return false;
    }
  }

  async getMetrics(): Promise<string> {
    // Dynamically update gauges from Database state before exporting
    try {
      const activeSessionsCount = await this.prisma.session.count({
        where: { status: 'ACTIVE', deletedAt: null },
      });
      const activeParticipantsCount = await this.prisma.participant.count({
        where: { isConnected: true },
      });

      this.activeSessionsGauge.set(activeSessionsCount);
      this.activeParticipantsGauge.set(activeParticipantsCount);
    } catch (err) {
      console.error('Failed to sync DB counts to Prometheus gauges:', err);
    }

    return client.register.metrics();
  }
}
