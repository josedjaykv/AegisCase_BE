import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from '@aegiscase/common';

async function bootstrap() {
  const logger = new Logger('ApiGateway');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS_ORIGIN may be '*' (allow all), a single origin, or a comma-separated
  // list (e.g. the dockerized FE on :4200 and a local Vite dev server on :5173).
  // CORS_ORIGIN: '*'/unset => reflect any origin (origin:true, the most reliable
  // "allow all"); otherwise a comma-separated allow-list (dockerized FE :4200,
  // local Vite dev :5173, ...).
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  app.enableCors({
    origin:
      !corsOrigin || corsOrigin === '*'
        ? true
        : corsOrigin.split(',').map((o) => o.trim()).filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('AegisCase API')
    .setDescription('Investigation Management System — API Gateway')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`API Gateway running on http://localhost:${port}`);
  logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
