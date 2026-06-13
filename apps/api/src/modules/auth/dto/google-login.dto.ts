import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjFkOWU4Y...',
    description: 'Google OAuth ID Token Credential',
  })
  @IsNotEmpty({ message: 'Credential token is required' })
  credential!: string;
}
