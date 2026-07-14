import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';

const SECRET = 'segredo-de-teste';

/** Contexto de execução mínimo com o header `Authorization` desejado. */
function contextWith(authorization?: string): ExecutionContext {
  const request: Record<string, unknown> = { headers: authorization ? { authorization } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const jwtService = new JwtService({ secret: SECRET });
  const configService = { get: () => SECRET } as unknown as ConfigService;
  const guard = new AuthGuard(jwtService, configService);

  it('aceita um token válido e anexa o payload à requisição', async () => {
    const token = await jwtService.signAsync({ sub: 'u-1', username: 'ana', role: 'TEACHER' }, { secret: SECRET });
    const context = contextWith(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const request = context.switchToHttp().getRequest();
    expect(request.user).toMatchObject({ sub: 'u-1', username: 'ana', role: 'TEACHER' });
  });

  it('recusa requisição sem header Authorization', async () => {
    await expect(guard.canActivate(contextWith())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('recusa esquema que não seja Bearer', async () => {
    await expect(guard.canActivate(contextWith('Basic YWJjOjEyMw=='))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('recusa token assinado com outro segredo', async () => {
    const forjado = await jwtService.signAsync({ sub: 'u-1' }, { secret: 'outro-segredo' });
    await expect(guard.canActivate(contextWith(`Bearer ${forjado}`))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('recusa token expirado', async () => {
    const expirado = await jwtService.signAsync({ sub: 'u-1' }, { secret: SECRET, expiresIn: '-1s' });
    await expect(guard.canActivate(contextWith(`Bearer ${expirado}`))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
