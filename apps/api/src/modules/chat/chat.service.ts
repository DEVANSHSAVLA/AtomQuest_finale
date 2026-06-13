import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, ApiResponse } from '@supportstream/shared-types';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async saveMessage(
    sessionId: string,
    senderId: string,
    senderName: string,
    senderRole: Role,
    content: string,
  ): Promise<any> {
    return this.prisma.message.create({
      data: {
        sessionId,
        senderId,
        senderName,
        senderRole,
        content,
      },
    });
  }

  async getMessages(sessionId: string): Promise<ApiResponse<any[]>> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.deletedAt) {
      throw new NotFoundException({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
      });
    }

    const messages = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      success: true,
      data: messages,
    };
  }
}
