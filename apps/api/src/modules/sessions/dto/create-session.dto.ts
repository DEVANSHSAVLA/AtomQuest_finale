import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ example: 'Router Setup Troubleshooting', description: 'Session Title' })
  @IsString({ message: 'Title must be a string' })
  @IsNotEmpty({ message: 'Title is required' })
  title!: string;

  @ApiProperty({ example: 'Customer having issue config of model SS-X1', description: 'Session Description' })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @ApiProperty({ example: 'TECHNICAL_SUPPORT', enum: ['TECHNICAL_SUPPORT', 'BILLING', 'ACCOUNT_RECOVERY', 'INSTALLATION', 'PRODUCT_DEMO', 'ESCALATION'] })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 'MEDIUM', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiProperty({ example: 'TECHNICAL_SUPPORT', enum: ['TECHNICAL_SUPPORT', 'BILLING', 'ACCOUNT_RECOVERY', 'SALES', 'ESCALATIONS'] })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ example: 'agent-uuid-here', description: 'Assigned Agent User ID' })
  @IsOptional()
  @IsString()
  assignedAgentId?: string;

  @ApiProperty({ example: 'Tier-2 Support', description: 'Assigned Team name' })
  @IsOptional()
  @IsString()
  assignedTeam?: string;
}
