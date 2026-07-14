import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/**
 * Políticas de borda. Ficam aqui, e não no `app.module`/`main`, para que os testes
 * possam montar um app mínimo com os mesmos limites sem arrastar o banco junto —
 * e, principalmente, para que testem *esta* configuração, e não uma cópia dela.
 */

/**
 * O `httpClient` do frontend exibe `error.response.data.message` cru para o usuário.
 * Sem isto, quem erra a senha cinco vezes lê "ThrottlerException: Too Many Requests".
 */
export const THROTTLE_ERROR_MESSAGE =
  'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';

/**
 * Teto global generoso: existe para conter abuso automatizado, não para atrapalhar
 * quem navega. As rotas de `/auth` apertam esse limite com `@Throttle`.
 */
export const GLOBAL_THROTTLE = { name: 'default', ttl: 60_000, limit: 120 };

/**
 * `errorMessage` vai na raiz, e não dentro do throttler: um `@Throttle` por rota
 * substitui a configuração nomeada e perderia a mensagem.
 */
export const THROTTLER_OPTIONS = {
  throttlers: [GLOBAL_THROTTLE],
  errorMessage: THROTTLE_ERROR_MESSAGE,
};

/** 5 tentativas de login por minuto, por IP. Suficiente para quem errou a senha. */
export const LOGIN_THROTTLE = { default: { ttl: 60_000, limit: 5 } };

/**
 * 3 pedidos a cada 15 minutos. Aqui o limite protege duas coisas: a conta contra
 * enumeração de emails e a cota do Brevo contra virar máquina de spam.
 */
export const EMAIL_THROTTLE = { default: { ttl: 15 * 60_000, limit: 3 } };

/**
 * Origens permitidas no CORS.
 *
 * `FRONTEND_URL` tem **um único valor**: ela também monta os links de convite e os
 * dos e-mails transacionais. Uma lista separada por vírgula ali geraria
 * `https://a.com,https://b.com/verify-email?...`. Origens adicionais (previews)
 * entram por `CORS_EXTRA_ORIGINS`, que só o CORS lê.
 *
 * Sem `FRONTEND_URL`, libera geral — conveniência de desenvolvimento local.
 */
export function corsOrigin(frontendUrl?: string, extraOrigins?: string): string[] | boolean {
  const primary = frontendUrl?.trim();
  if (!primary) return true;

  const extras = (extraOrigins ?? '').split(',').map(o => o.trim()).filter(Boolean);
  return [primary, ...extras];
}

/**
 * Endurece o app HTTP. Chamada pelo `main.ts` e pelos testes de borda — o teste
 * exercita exatamente o que roda em produção.
 */
export function configureSecurity(
  app: NestExpressApplication,
  frontendUrl?: string,
  extraOrigins?: string,
): void {
  // O Render põe a aplicação atrás de um proxy. Sem isto, `req.ip` é o IP do
  // proxy: o rate limit contaria todos os usuários como um só e trancaria todo
  // mundo assim que um deles errasse a senha cinco vezes.
  app.set('trust proxy', 1);

  app.use(helmet());

  // A API é consumida com `Authorization: Bearer`, nunca com cookie — daí não
  // haver `credentials: true` (que, aliás, o navegador rejeita junto com `*`).
  app.enableCors({
    origin: corsOrigin(frontendUrl, extraOrigins),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });
}
