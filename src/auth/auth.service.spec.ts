import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { hashSync } from 'bcrypt';

import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { UserDto } from 'src/users/users.dto';
import { UsersService } from 'src/users/users.service';
import {
    AuthService,
    EMAIL_NOT_VERIFIED_MESSAGE,
    INVALID_CREDENTIALS_MESSAGE,
} from './auth.service';

function user(overrides: Partial<UserDto> = {}): UserDto {
    return {
        id: 'user-id',
        username: 'ana',
        email: 'ana@ifpi.edu.br',
        password: hashSync('senha-correta', 10),
        role: UserRoleEnum.TEACHER,
        emailVerified: true,
        ...overrides,
    };
}

function buildService({
    foundByUsername = user(),
    foundByEmail = user(),
    ...options
}: {
    foundByUsername?: UserDto | null;
    foundByEmail?: UserDto | null;
    expiration?: string | undefined;
} = {}) {
    const expiration = Object.prototype.hasOwnProperty.call(options, 'expiration')
        ? options.expiration
        : '3600';
    const usersService = {
        findByUsername: jest.fn(async () => foundByUsername),
        findByEmail: jest.fn(async () => foundByEmail),
        verifyEmail: jest.fn(),
        requestPasswordReset: jest.fn(),
        resendEmailVerification: jest.fn(),
        resetPassword: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    const jwtService = {
        sign: jest.fn(() => 'jwt-assinado'),
    } as unknown as jest.Mocked<JwtService>;

    const configService = {
        get: jest.fn(() => expiration),
    } as unknown as jest.Mocked<ConfigService>;

    const service = new AuthService(usersService, jwtService, configService);
    return { service, usersService, jwtService };
}

describe('AuthService - configuração JWT', () => {
    it.each([undefined, '', '0', '-1', 'invalido'])(
        'AUT-10 rejeita expiração inválida: %p',
        expiration => {
            expect(() => buildService({ expiration })).toThrow(/JWT_EXPIRATION_TIME inválido/);
        },
    );
});

describe('AuthService.signIn()', () => {
    it('AUT-06 autentica por username normalizado', async () => {
        const { service, usersService } = buildService();

        await expect(service.signIn('  ana  ', '', '  senha-correta  ')).resolves.toEqual({
            token: 'jwt-assinado',
            expiresIn: 3600,
        });
        expect(usersService.findByUsername).toHaveBeenCalledWith('ana');
        expect(usersService.findByEmail).not.toHaveBeenCalled();
    });

    it('AUT-07 autentica por e-mail normalizado', async () => {
        const { service, usersService } = buildService();

        await service.signIn('', '  ana@ifpi.edu.br  ', 'senha-correta');

        expect(usersService.findByEmail).toHaveBeenCalledWith('ana@ifpi.edu.br');
        expect(usersService.findByUsername).not.toHaveBeenCalled();
    });

    it('AUT-08 usa a mesma resposta para usuário inexistente e senha incorreta', async () => {
        const inexistente = buildService({ foundByUsername: null });
        const senhaErrada = buildService();

        const first = inexistente.service.signIn('ninguem', '', 'senha-correta');
        const second = senhaErrada.service.signIn('ana', '', 'senha-incorreta');

        await expect(first).rejects.toMatchObject({
            constructor: UnauthorizedException,
            message: INVALID_CREDENTIALS_MESSAGE,
        });
        await expect(second).rejects.toMatchObject({
            constructor: UnauthorizedException,
            message: INVALID_CREDENTIALS_MESSAGE,
        });
    });

    it.each([
        ['', '', 'senha-correta'],
        ['ana', '', ''],
        ['   ', '   ', 'senha-correta'],
        ['ana', '', undefined],
    ])('AUT-08 rejeita credenciais incompletas sem erro interno', async (username, email, password) => {
        const { service, jwtService } = buildService();

        await expect(
            service.signIn(username, email, password as never),
        ).rejects.toMatchObject({ message: INVALID_CREDENTIALS_MESSAGE });
        expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('AUT-09 não emite JWT para conta não verificada', async () => {
        const pending = user({ emailVerified: false });
        const { service, jwtService } = buildService({ foundByUsername: pending });

        await expect(
            service.signIn('ana', '', 'senha-correta'),
        ).rejects.toMatchObject({ message: EMAIL_NOT_VERIFIED_MESSAGE });
        expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('AUT-10 assina apenas identidade e papel e devolve a expiração configurada', async () => {
        const found = user();
        const { service, jwtService } = buildService({ foundByUsername: found, expiration: '7200' });

        const result = await service.signIn('ana', '', 'senha-correta');

        expect(jwtService.sign).toHaveBeenCalledWith({
            sub: found.id,
            username: found.username,
            email: found.email,
            role: found.role,
        });
        expect(jwtService.sign).not.toHaveBeenCalledWith(expect.objectContaining({ password: expect.anything() }));
        expect(result).toEqual({ token: 'jwt-assinado', expiresIn: 7200 });
    });
});

describe('AuthService - delegação de tokens', () => {
    it('delega verificação, recuperação, reenvio e redefinição ao UsersService', async () => {
        const { service, usersService } = buildService();

        await service.verifyEmail('token-email');
        await service.forgotPassword('ana@ifpi.edu.br');
        await service.resendVerification('ana@ifpi.edu.br');
        await service.resetPassword('token-reset', 'nova-senha');

        expect(usersService.verifyEmail).toHaveBeenCalledWith('token-email');
        expect(usersService.requestPasswordReset).toHaveBeenCalledWith('ana@ifpi.edu.br');
        expect(usersService.resendEmailVerification).toHaveBeenCalledWith('ana@ifpi.edu.br');
        expect(usersService.resetPassword).toHaveBeenCalledWith('token-reset', 'nova-senha');
    });
});
