import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set global API prefix to /api/v1
  app.setGlobalPrefix('api/v1');

  // Enforce CORS for Vercel/localhost clients
  app.enableCors({
    origin: '*', // Enforce strict allowlists in production, wildcard for hackathon
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Apply standard global exception formatting
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Configure global validation and format custom standard error responses
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) => {
        const messages = errors
          .map((err) => Object.values(err.constraints || {}).join(', '))
          .join('; ');
        return new BadRequestException({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: messages,
          },
        });
      },
    }),
  );

  // Configure Swagger documentation under /api/docs
  const config = new DocumentBuilder()
    .setTitle('SupportStream API')
    .setDescription('The enterprise-grade REST & Real-time signaling API for SupportStream')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth', // This name must match `@ApiBearerAuth('JWT-auth')` on controllers
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`SupportStream API is running on: http://localhost:${port}/api/v1`);
  console.log(`Swagger documentation is available at: http://localhost:${port}/api/docs`);
}
bootstrap();
