import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureSecurity } from './common/security';
import { portugueseValidationException } from './common/validation-messages';

async function bootstrap() {
  dotenv.config();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  configureSecurity(app, process.env.FRONTEND_URL, process.env.CORS_EXTRA_ORIGINS);

  // `exceptionFactory`: as mensagens do class-validator vão cruas para a tela
  // (regra 6f), então precisam sair em português.
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, exceptionFactory: portugueseValidationException }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
