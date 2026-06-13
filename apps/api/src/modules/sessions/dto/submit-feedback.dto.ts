import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsInt, Min, Max, IsBoolean, IsOptional, IsString } from 'class-validator';

export class SubmitFeedbackDto {
  @ApiProperty({ example: 5, description: 'Satisfaction Rating (1-5 stars)' })
  @IsNotEmpty({ message: 'Rating is required' })
  @IsInt({ message: 'Rating must be an integer' })
  @Min(1, { message: 'Rating must be at least 1 star' })
  @Max(5, { message: 'Rating cannot exceed 5 stars' })
  rating!: number;

  @ApiProperty({ example: true, description: 'Was the support issue resolved?' })
  @IsNotEmpty({ message: 'Resolution response is required' })
  @IsBoolean({ message: 'Resolved must be a boolean' })
  resolved!: boolean;

  @ApiProperty({ example: 'Great service, firmware updated successfully.', description: 'Optional feedback comments' })
  @IsOptional()
  @IsString({ message: 'Comments must be a string' })
  comments?: string;
}
