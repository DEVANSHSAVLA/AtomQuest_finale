import { Controller, Post, Body, Req, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new support agent or admin' })
  @SwaggerResponse({ status: 201, description: 'User created successfully' })
  @SwaggerResponse({ status: 400, description: 'Validation failed' })
  @SwaggerResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate user and retrieve token' })
  @SwaggerResponse({ status: 200, description: 'Login successful' })
  @SwaggerResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    // Extract IP address from request (e.g. forward headers from reverse proxy)
    const ipAddress = (request.headers['x-forwarded-for'] as string) || request.socket.remoteAddress;
    return this.authService.login(loginDto, ipAddress, userAgent);
  }

  @Post('google')
  @ApiOperation({ summary: 'Authenticate or register with Google OAuth token' })
  @SwaggerResponse({ status: 200, description: 'Authentication successful' })
  @SwaggerResponse({ status: 401, description: 'Invalid Google token' })
  async googleLogin(
    @Body() googleLoginDto: GoogleLoginDto,
    @Req() request: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ipAddress = (request.headers['x-forwarded-for'] as string) || request.socket.remoteAddress;
    return this.authService.googleLogin(googleLoginDto.credential, ipAddress, userAgent);
  }
}
