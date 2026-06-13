import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AIService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // Conversation Sentiment Indicator (Keyword Engine)
  // ==========================================
  analyzeSentiment(messages: { content: string }[]): 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' {
    if (!messages || messages.length === 0) return 'NEUTRAL';

    const positiveKeywords = ['thank', 'perfect', 'resolved', 'great', 'happy', 'solved', 'works', 'appreciate', 'awesome', 'excellent'];
    const negativeKeywords = ['broken', 'fail', 'error', 'frustrated', 'slow', 'broken', 'angry', 'terrible', 'worst', 'stuck', 'issue', 'crash'];

    let score = 0;
    for (const msg of messages) {
      const text = msg.content.toLowerCase();
      
      positiveKeywords.forEach(word => {
        if (text.includes(word)) score += 1;
      });
      
      negativeKeywords.forEach(word => {
        if (text.includes(word)) score -= 1;
      });
    }

    if (score > 1) return 'POSITIVE';
    if (score < -1) return 'NEGATIVE';
    return 'NEUTRAL';
  }

  // ==========================================
  // AI Copilot Summary & Notes Generator
  // ==========================================
  async generateAiCopilot(sessionId: string): Promise<{
    summary: string;
    suggestedNotes: string;
    followUpEmail: string;
  }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        messages: true,
        files: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session context not found for AI analysis');
    }

    const ticketRef = session.ticketRef || 'CASE-2026-0000';
    const category = (session.category || 'TECHNICAL_SUPPORT').replace('_', ' ');
    const severity = session.severity || 'MEDIUM';
    const title = session.title || 'Support Session';
    const description = session.description || 'Customer support ticket';

    // Parse messages for troubleshooting terms
    const filesCount = session.files.length;
    const messagesCount = session.messages.length;

    // Build bullet points based on transcript analysis
    const bullets: string[] = [];
    bullets.push(`Diagnosed support issue regarding: "${title}"`);
    if (description) {
      bullets.push(`Customer Concern: ${description}`);
    }
    bullets.push(`Case Category classified as [${category}] with [${severity}] priority.`);

    if (filesCount > 0) {
      bullets.push(`Reviewed ${filesCount} technical documentation/log attachment(s) shared in the session.`);
    }

    // Dynamic bullet additions based on chat transcript keyword detection
    const chatText = session.messages.map(m => m.content.toLowerCase()).join(' ');
    if (chatText.includes('firmware') || chatText.includes('update')) {
      bullets.push('Determined firmware version mismatch; initialized firmware upgrades.');
    }
    if (chatText.includes('reboot') || chatText.includes('restart')) {
      bullets.push('Performed device reboot cycle to clean temporary caches.');
    }
    if (chatText.includes('billing') || chatText.includes('invoice') || chatText.includes('charge')) {
      bullets.push('Analyzed invoice records; corrected billing adjustments.');
    }
    if (chatText.includes('password') || chatText.includes('reset') || chatText.includes('login')) {
      bullets.push('Reset authentication credentials and walked customer through secure login procedure.');
    }

    if (bullets.length <= 3) {
      bullets.push('Completed interactive real-time screen/video walkthrough inspection.');
      bullets.push('Addressed basic diagnostics checks with customer.');
    }

    const summaryStr = bullets.map(b => `- ${b}`).join('\n');

    // Build suggested agent notes
    const suggestedNotes = `[RESOLUTION DETAILS]
Ticket: ${ticketRef}
Category: ${category}
Severity: ${severity}
Timeline: Analyzed support session consisting of ${messagesCount} messages and ${filesCount} shared file(s).
Action Taken:
${bullets.slice(1).map(b => `  * ${b}`).join('\n')}
Status: RESOLVED`;

    // Build follow-up email
    const followUpEmail = `Subject: Case ${ticketRef} Follow-Up: ${title}

Dear Customer,

Thank you for choosing our support services. This email serves as a summary follow-up for support case ${ticketRef} which we resolved today.

Here are the details of what was accomplished during our support call:
${summaryStr}

If you continue to experience any issues or have additional questions, please do not hesitate to reply directly to this email or request a new video session referencing case ${ticketRef}.

Best regards,
SupportStream Operations Team
[System Generated Follow-Up]`;

    return {
      summary: summaryStr,
      suggestedNotes,
      followUpEmail,
    };
  }
}
