import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsEnum, MinLength } from 'class-validator';
import { Role } from '@supportstream/shared-types';

export class RegisterDto {
  @ApiProperty({ example: 'agent@supportstream.com', description: 'Agent or Admin Email' })
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @ApiProperty({ example: 'Password123!', description: 'Minimum 6 characters password' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password!: string;

  @ApiProperty({ example: 'Alex Smith', description: 'Display name' })
  @IsNotEmpty({ message: 'Display name is required' })
  displayName!: string;

  @ApiProperty({ example: 'AGENT', enum: ['SUPER_ADMIN', 'ADMIN', 'AGENT', 'CUSTOMER'] })
  @IsOptional()
  @IsEnum(['SUPER_ADMIN', 'ADMIN', 'AGENT', 'CUSTOMER'], { message: 'Invalid role classification' })
  role?: Role;
}
