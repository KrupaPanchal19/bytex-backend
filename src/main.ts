import 'reflect-metadata';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { SeedService } from './seed/seed.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  // Every route lives under /api so the frontend proxy has a single, stable prefix.
  app.setGlobalPrefix('api');

  // Reject malformed payloads before they reach a controller. `transform` coerces
  // query/body primitives to their DTO types; `whitelist` strips unknown fields.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Single funnel for error shape so the frontend always gets { statusCode, message, ... }.
  app.useGlobalFilters(new AllExceptionsFilter());

  if (process.env.SEED_ON_BOOT !== 'false') {
    await app.get(SeedService).seedIfEmpty();
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Smart Ledger API listening on http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap();
