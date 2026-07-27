import { Controller, Get, INestApplication, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { configureSecurity, corsOrigin, THROTTLE_ERROR_MESSAGE, THROTTLER_OPTIONS } from 'src/common/security';

@Controller('status')
class StatusController {
  @Get()
  status() {
    return { status: 'ok' };
  }
}

/**
 * Monta o `AuthController` de verdade — com os `@Throttle` que ele declara — sobre
 * um app mínimo, endurecido pelo mesmo `configureSecurity()` que o `main.ts` chama.
 * O `AuthService` é dublê: aqui interessa a borda (rate limit, cabeçalhos, CORS),
 * não a regra de autenticação.
 *
 * Cada teste ganha um app novo porque o `ThrottlerGuard` guarda o contador em
 * memória; reaproveitar o app vazaria a contagem de um teste para o outro.
 */
async function createApp(frontendUrl?: string, extraOrigins?: string): Promise<INestApplication> {
  const authServiceStub: Partial<AuthService> = {
    signIn: jest.fn().mockRejectedValue(new UnauthorizedException('Credenciais inválidas')),
    forgotPassword: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(undefined),
    verifyEmail: jest.fn().mockResolvedValue(undefined),
  };

  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot(THROTTLER_OPTIONS)],
    controllers: [AuthController, StatusController],
    providers: [
      { provide: AuthService, useValue: authServiceStub },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureSecurity(app, frontendUrl, extraOrigins);
  await app.init();
  return app;
}

const credenciaisErradas = { username: 'ana', password: 'errada' };

describe('Borda de segurança do /auth', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  describe('rate limit', () => {
    it('QLT-04 permite 120 requisições em rota geral e bloqueia a 121ª', async () => {
      app = await createApp();
      const server = app.getHttpServer();

      for (let i = 1; i <= 120; i++) {
        expect((await request(server).get('/status')).status).toBe(200);
      }

      const bloqueada = await request(server).get('/status');
      expect(bloqueada.status).toBe(429);
      expect(bloqueada.body.message).toBe(THROTTLE_ERROR_MESSAGE);
    });

    it('permite 5 tentativas de login e bloqueia a 6ª com 429', async () => {
      app = await createApp();

      for (let i = 1; i <= 5; i++) {
        const res = await request(app.getHttpServer()).post('/auth/login').send(credenciaisErradas);
        expect(res.status).toBe(401); // erra a senha, mas ainda não foi barrado
      }

      const bloqueada = await request(app.getHttpServer()).post('/auth/login').send(credenciaisErradas);
      expect(bloqueada.status).toBe(429);
    });

    /**
     * O `httpClient` do frontend mostra `data.message` cru. Sem a mensagem
     * customizada, o usuário leria "ThrottlerException: Too Many Requests".
     */
    it('a mensagem do 429 chega em português e sem jargão', async () => {
      app = await createApp();
      const server = app.getHttpServer();

      for (let i = 0; i < 5; i++) await request(server).post('/auth/login').send(credenciaisErradas);
      const bloqueada = await request(server).post('/auth/login').send(credenciaisErradas);

      expect(bloqueada.body.message).toBe(THROTTLE_ERROR_MESSAGE);
      expect(bloqueada.body.message).not.toMatch(/ThrottlerException|Too Many Requests/i);
    });

    it('conta por IP: outro cliente não herda o bloqueio do primeiro', async () => {
      app = await createApp();
      const server = app.getHttpServer();

      for (let i = 0; i < 6; i++) {
        await request(server).post('/auth/login').set('X-Forwarded-For', '10.0.0.1').send(credenciaisErradas);
      }
      const primeiro = await request(server).post('/auth/login').set('X-Forwarded-For', '10.0.0.1').send(credenciaisErradas);
      expect(primeiro.status).toBe(429);

      // Se `trust proxy` não estivesse ligado, os dois compartilhariam o IP do
      // proxy e este segundo cliente já viria bloqueado.
      const segundo = await request(server).post('/auth/login').set('X-Forwarded-For', '10.0.0.2').send(credenciaisErradas);
      expect(segundo.status).toBe(401);
    });

    it('limita forgot-password a 3 pedidos (cota de e-mail e enumeração de contas)', async () => {
      app = await createApp();

      for (let i = 1; i <= 3; i++) {
        const res = await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'a@b.com' });
        expect(res.status).toBe(200);
      }

      const bloqueada = await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'a@b.com' });
      expect(bloqueada.status).toBe(429);
    });

    it('reset-password também é limitado a 5', async () => {
      app = await createApp();
      const server = app.getHttpServer();
      const body = { token: 't', newPassword: 'nova-senha-123' };

      for (let i = 1; i <= 5; i++) {
        expect((await request(server).post('/auth/reset-password').send(body)).status).toBe(200);
      }
      expect((await request(server).post('/auth/reset-password').send(body)).status).toBe(429);
    });
  });

  describe('helmet', () => {
    it('envia cabeçalhos de segurança e esconde o X-Powered-By', async () => {
      app = await createApp();
      const res = await request(app.getHttpServer()).post('/auth/login').send(credenciaisErradas);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS', () => {
    it('reflete a origem principal (FRONTEND_URL)', async () => {
      app = await createApp('https://repoif.example');
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', 'https://repoif.example')
        .send(credenciaisErradas);

      expect(res.headers['access-control-allow-origin']).toBe('https://repoif.example');
    });

    it('reflete uma origem extra vinda de CORS_EXTRA_ORIGINS', async () => {
      app = await createApp('https://repoif.example', 'https://preview.repoif.example');
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', 'https://preview.repoif.example')
        .send(credenciaisErradas);

      expect(res.headers['access-control-allow-origin']).toBe('https://preview.repoif.example');
    });

    it('não autoriza origem fora da lista', async () => {
      app = await createApp('https://repoif.example');
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', 'https://site-malicioso.example')
        .send(credenciaisErradas);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('nunca combina credentials com origem coringa', async () => {
      app = await createApp();
      const res = await request(app.getHttpServer()).post('/auth/login').set('Origin', 'https://qualquer.example').send(credenciaisErradas);

      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });
});

describe('corsOrigin()', () => {
  it('sem FRONTEND_URL, libera geral (desenvolvimento local)', () => {
    expect(corsOrigin(undefined)).toBe(true);
    expect(corsOrigin('   ')).toBe(true);
  });

  it('sozinha, FRONTEND_URL é a única origem', () => {
    expect(corsOrigin('https://a.com')).toEqual(['https://a.com']);
  });

  it('acrescenta CORS_EXTRA_ORIGINS, aparando espaços e vírgulas sobrando', () => {
    expect(corsOrigin('https://a.com', ' https://b.com , https://c.com ,,')).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ]);
  });

  /**
   * `FRONTEND_URL` também monta os links de convite e dos e-mails. Se alguém puser
   * uma lista ali, o link vira `https://a.com,https://b.com/verify-email?...`.
   * Este teste documenta que a variável é de valor único.
   */
  it('trata FRONTEND_URL como valor único, nunca como lista', () => {
    expect(corsOrigin('https://a.com,https://b.com')).toEqual(['https://a.com,https://b.com']);
  });
});
