import { BadRequestException } from '@nestjs/common';
import { compareSync, hashSync } from 'bcrypt';

import { TokenTypeEnum } from 'src/common/enums/token-type.enum';
import { TokenEntity } from 'src/db/entities/token.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { MailService } from 'src/mail/mail.service';
import { UsersService } from './users.service';

function buildService({
    user = null,
    token = null,
}: {
    user?: UserEntity | null;
    token?: TokenEntity | null;
} = {}) {
    const usersRepository = {
        findOne: jest.fn(async () => user),
        save: jest.fn(async (entity: UserEntity) => entity),
    };
    const tokenRepository = {
        findOne: jest.fn(async () => token),
        save: jest.fn(async (entity: TokenEntity) => entity),
        delete: jest.fn(async () => ({ affected: 1 })),
    };
    const mailService = {
        sendPasswordResetEmail: jest.fn(async () => undefined),
        sendVerificationEmail: jest.fn(async () => undefined),
    } as unknown as jest.Mocked<MailService>;

    const service = new UsersService(
        usersRepository as never,
        tokenRepository as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        mailService,
        {} as never,
    );
    return { service, usersRepository, tokenRepository, mailService };
}

function account(overrides: Partial<UserEntity> = {}): UserEntity {
    return {
        id: 'user-id',
        username: 'ana',
        email: 'ana@ifpi.edu.br',
        password: hashSync('senha-antiga', 10),
        emailVerified: false,
        ...overrides,
    } as UserEntity;
}

function storedToken(type: TokenTypeEnum, overrides: Partial<TokenEntity> = {}): TokenEntity {
    return {
        id: 'token-id',
        userId: 'user-id',
        token: 'token-seguro',
        type,
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    } as TokenEntity;
}

describe('UsersService.verifyEmail()', () => {
    it.each(['', '   ', undefined])('AUT-13 rejeita token vazio: %p', async value => {
        const { service } = buildService();
        await expect(service.verifyEmail(value as never)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('AUT-13 rejeita token inexistente', async () => {
        const { service } = buildService();
        await expect(service.verifyEmail('desconhecido')).rejects.toMatchObject({ message: 'Token inválido' });
    });

    it('AUT-13 apaga e rejeita token expirado', async () => {
        const token = storedToken(TokenTypeEnum.EMAIL_VERIFICATION, {
            expiresAt: new Date(Date.now() - 1),
        });
        const { service, tokenRepository } = buildService({ token });

        await expect(service.verifyEmail(token.token)).rejects.toMatchObject({ message: 'Token expirado' });
        expect(tokenRepository.delete).toHaveBeenCalledWith({ id: token.id });
    });

    it('AUT-13 confirma a conta e invalida todos os links de verificação', async () => {
        const user = account();
        const token = storedToken(TokenTypeEnum.EMAIL_VERIFICATION);
        const { service, usersRepository, tokenRepository } = buildService({ user, token });

        await service.verifyEmail(`  ${token.token}  `);

        expect(user.emailVerified).toBe(true);
        expect(usersRepository.save).toHaveBeenCalledWith(user);
        expect(tokenRepository.delete).toHaveBeenCalledWith({
            userId: user.id,
            type: TokenTypeEnum.EMAIL_VERIFICATION,
        });
    });

    it('AUT-13 token de usuário removido também é invalidado', async () => {
        const token = storedToken(TokenTypeEnum.EMAIL_VERIFICATION);
        const { service, tokenRepository } = buildService({ token, user: null });

        await expect(service.verifyEmail(token.token)).rejects.toMatchObject({ message: 'Usuário não encontrado' });
        expect(tokenRepository.delete).toHaveBeenCalledWith({ id: token.id });
    });
});

describe('UsersService.requestPasswordReset()', () => {
    it('AUT-16 recusa e-mail vazio', async () => {
        const { service } = buildService();
        await expect(service.requestPasswordReset('   ')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('AUT-16 não revela conta inexistente nem envia mensagem', async () => {
        const { service, tokenRepository, mailService } = buildService();

        await expect(service.requestPasswordReset('ninguem@ifpi.edu.br')).resolves.toBeUndefined();
        expect(tokenRepository.save).not.toHaveBeenCalled();
        expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('AUT-16 invalida token anterior e emite outro com dez minutos', async () => {
        const user = account();
        const { service, tokenRepository, mailService } = buildService({ user });
        const before = Date.now();

        await service.requestPasswordReset(`  ${user.email}  `);

        expect(tokenRepository.delete).toHaveBeenCalledWith({
            userId: user.id,
            type: TokenTypeEnum.PASSWORD_RESET,
        });
        expect(tokenRepository.save).toHaveBeenCalledWith(expect.objectContaining({
            userId: user.id,
            type: TokenTypeEnum.PASSWORD_RESET,
        }));
        const emitted = (tokenRepository.save as jest.Mock).mock.calls[0][0] as TokenEntity;
        expect(emitted.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 10 * 60_000 - 100);
        expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
            user.email,
            user.username,
            emitted.token,
        );
    });
});

describe('UsersService.resetPassword()', () => {
    it.each([
        ['', 'senha-nova'],
        ['token', ''],
        ['token', 'curta'],
    ])('AUT-17 rejeita entrada inválida sem alterar usuário', async (tokenValue, password) => {
        const user = account();
        const { service, usersRepository } = buildService({ user });

        await expect(service.resetPassword(tokenValue, password)).rejects.toBeInstanceOf(BadRequestException);
        expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('AUT-17 rejeita token inexistente', async () => {
        const { service } = buildService();
        await expect(service.resetPassword('desconhecido', 'senha-nova-123')).rejects.toMatchObject({
            message: 'Token inválido',
        });
    });

    it('AUT-17 apaga e rejeita token expirado', async () => {
        const token = storedToken(TokenTypeEnum.PASSWORD_RESET, {
            expiresAt: new Date(Date.now() - 1),
        });
        const { service, tokenRepository } = buildService({ token });

        await expect(service.resetPassword(token.token, 'senha-nova-123')).rejects.toMatchObject({
            message: 'Token expirado',
        });
        expect(tokenRepository.delete).toHaveBeenCalledWith({ id: token.id });
    });

    it('AUT-17 altera a senha com hash e torna o token de uso único', async () => {
        const user = account();
        const token = storedToken(TokenTypeEnum.PASSWORD_RESET);
        const { service, usersRepository, tokenRepository } = buildService({ user, token });

        await service.resetPassword(token.token, 'senha-nova-123');

        expect(compareSync('senha-nova-123', user.password)).toBe(true);
        expect(usersRepository.save).toHaveBeenCalledWith(user);
        expect(tokenRepository.delete).toHaveBeenCalledWith({ id: token.id });
    });

    it('AUT-17 invalida token cujo usuário não existe', async () => {
        const token = storedToken(TokenTypeEnum.PASSWORD_RESET);
        const { service, tokenRepository } = buildService({ token, user: null });

        await expect(service.resetPassword(token.token, 'senha-nova-123')).rejects.toMatchObject({
            message: 'Usuário não encontrado',
        });
        expect(tokenRepository.delete).toHaveBeenCalledWith({ id: token.id });
    });
});
