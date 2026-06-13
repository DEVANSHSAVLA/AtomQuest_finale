import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from '@supportstream/shared-types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization token is missing',
        },
      });
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-signing-key';
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, { secret });
      
      // Ensure the token type is 'access'
      if (payload.type !== 'access') {
        throw new UnauthorizedException({
          success: false,
          error: {
            code: 'INVALID_TOKEN_TYPE',
            message: 'Invalid token type',
          },
        });
      }

      // Attach payload to request context
      (request as any).user = payload;
    } catch {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        },
      });
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
