import { Controller, Post, Get, Param, Body, UseGuards, Req, Query, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { AIService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserDecorator } from '../../common/decorators/user.decorator';
import { JwtPayload } from '@supportstream/shared-types';

@ApiTags('Sessions')
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly aiService: AIService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new support session' })
  @SwaggerResponse({ status: 201, description: 'Session created' })
  async create(
    @Body() createDto: CreateSessionDto,
    @UserDecorator() user: JwtPayload,
    @Req() request: Request,
  ) {
    const ipAddress = (request.headers['x-forwarded-for'] as string) || request.socket.remoteAddress;
    return this.sessionsService.createSession(createDto, user.sub, ipAddress);
  }

  @Post(':id/invite/regenerate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Regenerate session invite token (invalidating previous ones)' })
  async regenerateInvite(
    @Param('id') sessionId: string,
    @UserDecorator() user: JwtPayload,
    @Req() request: Request,
  ) {
    const ipAddress = (request.headers['x-forwarded-for'] as string) || request.socket.remoteAddress;
    return this.sessionsService.regenerateInvite(sessionId, user.sub, ipAddress);
  }

  @Post('request')
  @ApiOperation({ summary: 'Request a support session (public customer endpoint)' })
  async requestSession(
    @Body() payload: { 
      displayName: string; 
      email: string; 
      title: string; 
      category: string; 
      description?: string; 
    },
    @Req() request: Request,
  ) {
    const ipAddress = (request.headers['x-forwarded-for'] as string) || request.socket.remoteAddress;
    return this.sessionsService.requestSession(payload, ipAddress);
  }

  @Post('join')
  @ApiOperation({ summary: 'Validate invite token and obtain scoped access token (Customer join)' })
  async join(
    @Body('token') token: string, 
    @Req() request: Request,
    @Body('clientData') clientData?: { displayName: string; email: string; company?: string; phone?: string; notes?: string }
  ) {
    const ipAddress = (request.headers['x-forwarded-for'] as string) || request.socket.remoteAddress;
    return this.sessionsService.joinInvite(token, ipAddress, clientData);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retrieve session logs and past call history' })
  async getHistory(@UserDecorator() user: JwtPayload) {
    return this.sessionsService.getSessionHistory(user.sub, user.role);
  }

  @Get('customer-profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retrieve customer CRM profile and support history by email' })
  async getCustomerProfile(@Query('email') email: string) {
    return this.sessionsService.getCustomerProfileByEmail(email);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get session details by ID' })
  async getDetails(@Param('id') sessionId: string) {
    return this.sessionsService.getSessionDetails(sessionId);
  }

  @Post(':id/end')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'End session and generate timeline summary' })
  async end(
    @Param('id') sessionId: string,
    @Body() endData: { resolutionStatus: string; agentNotes?: string },
    @UserDecorator() user: JwtPayload,
    @Req() request: Request,
  ) {
    const ipAddress = (request.headers['x-forwarded-for'] as string) || request.socket.remoteAddress;
    const displayName = user.role === 'CUSTOMER' ? 'Customer' : `Agent ${user.sub.substring(0, 4)}`;
    return this.sessionsService.endSession(sessionId, user.sub, displayName, ipAddress, endData);
  }

  @Post(':id/feedback')
  @ApiOperation({ summary: 'Submit satisfaction feedback for a support session' })
  async submitFeedback(
    @Param('id') sessionId: string,
    @Body() feedbackDto: SubmitFeedbackDto,
  ) {
    return this.sessionsService.submitFeedback(
      sessionId,
      feedbackDto.rating,
      feedbackDto.resolved,
      feedbackDto.comments,
    );
  }

  @Post(':id/ai-copilot')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Run AI Copilot to generate support summary, notes, and emails' })
  async getAiCopilot(@Param('id') sessionId: string) {
    const data = await this.aiService.generateAiCopilot(sessionId);
    return { success: true, data };
  }

  @Get('workflows/rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all workflow rules' })
  async getWorkflows() {
    const data = await this.sessionsService.getWorkflowRules();
    return { success: true, data };
  }

  @Post('workflows/rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a workflow rule' })
  async createWorkflow(
    @Body('trigger') trigger: string,
    @Body('action') action: string,
  ) {
    const data = await this.sessionsService.createWorkflowRule(trigger, action);
    return { success: true, data };
  }

  @Post('workflows/rules/:id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Toggle a workflow rule' })
  async toggleWorkflow(
    @Param('id') id: string,
    @Body('enabled') enabled: boolean,
  ) {
    const data = await this.sessionsService.toggleWorkflowRule(id, enabled);
    return { success: true, data };
  }

  @Delete('workflows/rules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a workflow rule' })
  async deleteWorkflow(@Param('id') id: string) {
    const data = await this.sessionsService.deleteWorkflowRule(id);
    return { success: true, data };
  }

  @Get('logs/integrations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get recent integration sync logs' })
  async getIntegrationLogs() {
    const data = await this.sessionsService.getIntegrationLogs();
    return { success: true, data };
  }

  @Get('logs/webhooks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get recent webhook reliability logs' })
  async getWebhookEvents() {
    const data = await this.sessionsService.getWebhookEvents();
    return { success: true, data };
  }

  @Post(':id/update')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update support session properties' })
  async updateSession(
    @Param('id') sessionId: string,
    @Body() updateData: {
      title?: string;
      description?: string;
      category?: string;
      severity?: string;
      department?: string;
      status?: string;
      resolutionStatus?: string;
      agentNotes?: string;
    },
    @UserDecorator() user: JwtPayload,
    @Req() request: Request,
  ) {
    const ipAddress = (request.headers['x-forwarded-for'] as string) || request.socket.remoteAddress;
    return this.sessionsService.updateSession(sessionId, user.sub, updateData, ipAddress);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Soft delete / archive a support session' })
  async deleteSession(
    @Param('id') sessionId: string,
    @UserDecorator() user: JwtPayload,
    @Req() request: Request,
  ) {
    const ipAddress = (request.headers['x-forwarded-for'] as string) || request.socket.remoteAddress;
    return this.sessionsService.deleteSession(sessionId, user.sub, ipAddress);
  }
}
