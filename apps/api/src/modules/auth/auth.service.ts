import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload, ApiResponse, AuditAction, Role } from '@supportstream/shared-types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<ApiResponse<any>> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({
        success: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'A user with this email address is already registered',
        },
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        role: dto.role || 'AGENT',
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
      },
    });

    return { success: true, data: user };
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<ApiResponse<{ token: string; user: any }>> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password combination',
        },
      });
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password combination',
        },
      });
    }

    const secret = this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-signing-key';
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      role: user.role as Role,
      type: 'access',
    };

    const token = await this.jwtService.signAsync(payload, {
      secret,
      expiresIn: '24h',
    });

    // Write audit log entry
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        ipAddress,
        userAgent,
        payload: JSON.stringify({ email: user.email }),
      },
    });

    return {
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role as Role,
        },
      },
    };
  }

  async verifyGoogleToken(idToken: string): Promise<any> {
    try {
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
      if (!response.ok) {
        throw new Error('Failed to verify token with Google');
      }
      const payload = await response.json();
      if (!payload.email) {
        throw new Error('Google token did not contain email');
      }
      return payload;
    } catch (err) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'GOOGLE_AUTH_FAILED',
          message: 'Failed to verify Google ID token',
        },
      });
    }
  }

  async googleLogin(credential: string, ipAddress?: string, userAgent?: string): Promise<ApiResponse<{ token: string; user: any }>> {
    const googlePayload = await this.verifyGoogleToken(credential);
    const email = googlePayload.email;
    const displayName = googlePayload.name || googlePayload.email.split('@')[0];

    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (googleClientId && googlePayload.aud !== googleClientId) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'GOOGLE_AUTH_FAILED',
          message: 'Google Client ID mismatch',
        },
      });
    }

    // Find if user exists
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Create user if not exists (automatic registration)
      const dummyPassword = Math.random().toString(36) + Math.random().toString(36);
      const passwordHash = await bcrypt.hash(dummyPassword, 10);
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          role: 'AGENT',
        },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'INACTIVE_USER',
          message: 'User account is inactive',
        },
      });
    }

    const secret = this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-signing-key';
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      role: user.role as Role,
      type: 'access',
    };

    const token = await this.jwtService.signAsync(payload, {
      secret,
      expiresIn: '24h',
    });

    // Write audit log entry
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        ipAddress,
        userAgent,
        payload: JSON.stringify({ email: user.email, provider: 'GOOGLE' }),
      },
    });

    return {
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role as Role,
        },
      },
    };
  }
}
