import { Controller, Get, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserDecorator } from '../../common/decorators/user.decorator';
import { JwtPayload } from '@supportstream/shared-types';

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get(':sessionId')
  @ApiOperation({ summary: 'Retrieve chat messages for an active or completed support session' })
  @SwaggerResponse({ status: 200, description: 'Messages list retrieved' })
  @SwaggerResponse({ status: 403, description: 'Forbidden access' })
  async getChatHistory(
    @Param('sessionId') sessionId: string,
    @UserDecorator() user: JwtPayload,
  ) {
    // Audit invite security: Guest customers must be locked to their assigned session ID
    if (user.role === 'CUSTOMER' && user.sessionId !== sessionId) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'Guest customers cannot access chat history of other sessions',
        },
      });
    }

    return this.chatService.getMessages(sessionId);
  }
}
