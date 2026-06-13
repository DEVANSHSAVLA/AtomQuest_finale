import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // ==========================================
  // Webhook System with Reliability Logging
  // ==========================================
  async dispatchWebhook(event: string, payload: any): Promise<void> {
    const webhookUrl = this.configService.get<string>('WEBHOOK_URL');

    // Create delivery audit record in PENDING state
    const webhookRecord = await this.prisma.webhookEvent.create({
      data: {
        event,
        payload: JSON.stringify(payload),
        status: 'PENDING',
        attempts: 0,
      },
    });

    if (!webhookUrl) {
      console.log(`[Webhook] No WEBHOOK_URL configured. Event '${event}' logged to DB in FAILED state.`);
      await this.prisma.webhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          status: 'FAILED',
          attempts: 1,
          responseCode: 404,
          lastAttempt: new Date(),
        },
      });
      return;
    }

    try {
      console.log(`[Webhook] Dispatching event '${event}' to ${webhookUrl}...`);
      
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          data: payload,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(id);

      await this.prisma.webhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          status: 'SENT',
          attempts: 1,
          responseCode: response.status,
          lastAttempt: new Date(),
        },
      });
      
      console.log(`[Webhook] Dispatch succeeded. Code: ${response.status}`);
    } catch (err: any) {
      console.error(`[Webhook] Dispatch failed. Error: ${err.message}`);
      
      await this.prisma.webhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          status: 'FAILED',
          attempts: 1,
          responseCode: 500,
          lastAttempt: new Date(),
        },
      });
    }
  }

  // ==========================================
  // Slack Incoming Webhook (No OAuth/Bot)
  // ==========================================
  async postToSlack(ticketRef: string, text: string): Promise<void> {
    const slackUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
    if (!slackUrl) {
      console.log(`[Slack Webhook] No SLACK_WEBHOOK_URL configured. Mock logging text: "${text}"`);
      await this.prisma.integrationLog.create({
        data: {
          provider: 'SLACK',
          action: 'POST_MESSAGE',
          status: 'SUCCESS',
          errorMsg: 'Mock delivery (No webhook configured)',
        },
      });
      return;
    }

    try {
      const response = await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*SupportStream notification:* ${text} [Ticket: ${ticketRef}]`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`);
      }

      await this.prisma.integrationLog.create({
        data: {
          provider: 'SLACK',
          action: 'POST_MESSAGE',
          status: 'SUCCESS',
        },
      });
    } catch (err: any) {
      await this.prisma.integrationLog.create({
        data: {
          provider: 'SLACK',
          action: 'POST_MESSAGE',
          status: 'FAILED',
          errorMsg: err.message,
        },
      });
    }
  }

  // ==========================================
  // Salesforce Mock Connector Layer (Fake mode)
  // ==========================================
  async syncToSalesforce(sessionId: string, ticketRef: string, caseData: any): Promise<void> {
    console.log(`[Salesforce Adapter] Starting sync for ticket ${ticketRef}...`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const isSuccess = Math.random() > 0.05;

    if (isSuccess) {
      const mockSfId = `500${Math.random().toString(36).substring(2, 17).toUpperCase()}`;
      console.log(`[Salesforce Adapter] Case successfully synchronized. SF-ID: ${mockSfId}`);
      
      if (caseData.customerEmail) {
        await this.prisma.customerProfile.updateMany({
          where: { email: caseData.customerEmail },
          data: { salesforceId: mockSfId },
        });
      }

      await this.prisma.integrationLog.create({
        data: {
          provider: 'SALESFORCE',
          action: 'SYNC_CASE',
          status: 'SUCCESS',
        },
      });
    } else {
      console.error(`[Salesforce Adapter] Connection timed out during sync.`);
      await this.prisma.integrationLog.create({
        data: {
          provider: 'SALESFORCE',
          action: 'SYNC_CASE',
          status: 'FAILED',
          errorMsg: 'Connection timeout (Simulated)',
        },
      });
    }
  }

  // ==========================================
  // HubSpot Mock Connector Layer (Fake mode)
  // ==========================================
  async syncToHubSpot(sessionId: string, ticketRef: string, dealData: any): Promise<void> {
    console.log(`[HubSpot Adapter] Starting sync for ticket ${ticketRef}...`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const isSuccess = Math.random() > 0.05;

    if (isSuccess) {
      const mockHsId = `hs_deal_${Math.floor(100000000 + Math.random() * 900000000)}`;
      console.log(`[HubSpot Adapter] Deal synced successfully. HS-Deal-ID: ${mockHsId}`);

      if (dealData.customerEmail) {
        await this.prisma.customerProfile.updateMany({
          where: { email: dealData.customerEmail },
          data: { hubspotId: mockHsId },
        });
      }

      await this.prisma.integrationLog.create({
        data: {
          provider: 'HUBSPOT',
          action: 'SYNC_DEAL',
          status: 'SUCCESS',
        },
      });
    } else {
      console.error(`[HubSpot Adapter] Authentication handshake failed.`);
      await this.prisma.integrationLog.create({
        data: {
          provider: 'HUBSPOT',
          action: 'SYNC_DEAL',
          status: 'FAILED',
          errorMsg: 'Invalid API Key (Simulated)',
        },
      });
    }
  }
}
