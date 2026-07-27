import { BadRequestException, ConflictException } from '@nestjs/common';
import { compareSync } from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { TokenTypeEnum } from 'src/common/enums/token-type.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { TokenEntity } from 'src/db/entities/token.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { MailService } from 'src/mail/mail.service';
import { UserDto } from './users.dto';
import { EMAIL_VERIFICATION_TTL_MS, UsersService } from './users.service';

type RegistrationInput = {
    username: string;
    email: string;
    password: string;
    role: UserRoleEnum;
};

function existingUser(overrides: Partial<UserEntity> = {}): UserEntity {
    return {
        id: 'existing-id',
        username: 'existente',
        name: null,
        email: 'existente@ifpi.edu.br',
        password: '$2b$10$hash-existente',
        role: UserRoleEnum.STUDENT,
        emailVerified: true,
        deletedAt: null,
        ...overrides,
    } as UserEntity;
}

function buildService(initialUsers: UserEntity[] = []) {
    const users = [...initialUsers];
    const savedUsers: UserEntity[] = [];
    const savedTokens: TokenEntity[] = [];

    const usersRepository = {
        findOne: jest.fn(async ({ where }: { where: Partial<UserEntity> | Partial<UserEntity>[] }) => {
            const alternatives = Array.isArray(where) ? where : [where];
            return users.find(user =>
                alternatives.some(criteria =>
                    Object.entries(criteria).every(([key, value]) => user[key as keyof UserEntity] === value),
                ),
            ) ?? null;
        }),
        save: jest.fn(async (user: UserEntity) => {
            if (!user.id) user.id = 'created-id';
            savedUsers.push(user);
            return user;
        }),
        find: jest.fn(async () => users),
    };

    const tokenRepository = {
        delete: jest.fn(async () => ({ affected: 1 })),
        save: jest.fn(async (token: TokenEntity) => {
            savedTokens.push(token);
            return token;
        }),
    };

    const mailService = {
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

    return { service, usersRepository, tokenRepository, mailService, savedUsers, savedTokens };
}

const validInput = (overrides: Partial<RegistrationInput> = {}): RegistrationInput => ({
    username: '  novo.usuario  ',
    email: '  novo@ifpi.edu.br  ',
    password: '  senha-segura-123  ',
    role: UserRoleEnum.STUDENT,
    ...overrides,
});

describe('UsersService.create() - cadastro público', () => {
    it.each([UserRoleEnum.STUDENT, UserRoleEnum.TEACHER])(
        'AUT-01 cadastra %s com dados normalizados e senha em hash',
        async role => {
            const { service, savedUsers } = buildService();

            const result = await service.create(validInput({ role }));

            expect(result).toEqual({ id: 'created-id', username: 'novo.usuario' });
            expect(savedUsers).toHaveLength(1);
            expect(savedUsers[0]).toMatchObject({
                username: 'novo.usuario',
                email: 'novo@ifpi.edu.br',
                role,
                emailVerified: false,
            });
            expect(savedUsers[0].password).not.toBe('senha-segura-123');
            expect(compareSync('senha-segura-123', savedUsers[0].password)).toBe(true);
        },
    );

    it('AUT-02 rejeita ADMIN no service, mesmo sem passar pelo ValidationPipe', async () => {
        const { service, usersRepository } = buildService();

        await expect(
            service.create(validInput({ role: UserRoleEnum.ADMIN })),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('AUT-03 rejeita username já existente com conflito controlado', async () => {
        const original = existingUser();
        const snapshot = { ...original };
        const { service, usersRepository } = buildService([original]);

        await expect(
            service.create(validInput({ username: original.username })),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(original).toEqual(snapshot);
        expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('AUT-03 rejeita e-mail já existente com conflito controlado', async () => {
        const original = existingUser();
        const { service, usersRepository } = buildService([original]);

        await expect(
            service.create(validInput({ email: original.email })),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(usersRepository.save).not.toHaveBeenCalled();
    });

    it('AUT-05 não substitui e-mail ou senha de conta não verificada', async () => {
        const original = existingUser({ emailVerified: false });
        const snapshot = { ...original };
        const { service, usersRepository, mailService } = buildService([original]);

        await expect(
            service.create(validInput({
                username: original.username,
                email: 'atacante@ifpi.edu.br',
                password: 'senha-do-atacante',
            })),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(original).toEqual(snapshot);
        expect(usersRepository.save).not.toHaveBeenCalled();
        expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('AUT-03 também considera contas excluídas na verificação de unicidade', async () => {
        const deleted = existingUser({ deletedAt: new Date() });
        const { service, usersRepository } = buildService([deleted]);

        await expect(
            service.create(validInput({ email: deleted.email })),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(usersRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
    });

    it('AUT-03 converte colisão concorrente do índice PostgreSQL em conflito controlado', async () => {
        const { service, usersRepository, tokenRepository } = buildService();
        usersRepository.save.mockRejectedValueOnce({ driverError: { code: '23505' } });

        await expect(service.create(validInput())).rejects.toBeInstanceOf(ConflictException);

        expect(tokenRepository.save).not.toHaveBeenCalled();
    });

    it('AUT-04 emite token de verificação de 24 horas e envia a mensagem', async () => {
        const now = Date.now();
        const { service, savedTokens, mailService } = buildService();

        await service.create(validInput());

        expect(savedTokens).toHaveLength(1);
        expect(savedTokens[0]).toMatchObject({
            userId: 'created-id',
            type: TokenTypeEnum.EMAIL_VERIFICATION,
        });
        expect(savedTokens[0].expiresAt.getTime()).toBeGreaterThanOrEqual(now + EMAIL_VERIFICATION_TTL_MS - 100);
        expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
            'novo@ifpi.edu.br',
            'novo.usuario',
            savedTokens[0].token,
        );
    });
});

describe('UserDto - papéis do cadastro público', () => {
    const validDto = (role: UserRoleEnum) => plainToInstance(UserDto, {
        username: 'novo.usuario',
        email: 'novo@ifpi.edu.br',
        password: 'senha-segura-123',
        role,
    });

    it.each([UserRoleEnum.STUDENT, UserRoleEnum.TEACHER])(
        'AUT-01 aceita o papel público %s',
        async role => {
            const dto = validDto(role);
            await expect(validate(dto)).resolves.toEqual([]);
        },
    );

    it('AUT-02 rejeita ADMIN antes de chamar o service', async () => {
        const dto = validDto(UserRoleEnum.ADMIN);
        const errors = await validate(dto);

        expect(errors).toHaveLength(1);
        expect(errors[0].property).toBe('role');
        expect(errors[0].constraints?.isIn).toContain('TEACHER ou STUDENT');
    });
});

describe('UsersService.findAllUsers() - privacidade', () => {
    it('USR-08 nunca devolve e-mail, hash, verificação ou estado de exclusão', async () => {
        const user = existingUser({ name: 'Usuário Existente' });
        const { service } = buildService([user]);

        const result = await service.findAllUsers();

        expect(result).toEqual([{
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
        }]);
        expect(result?.[0]).not.toHaveProperty('password');
        expect(result?.[0]).not.toHaveProperty('email');
        expect(result?.[0]).not.toHaveProperty('emailVerified');
        expect(result?.[0]).not.toHaveProperty('deletedAt');
    });
});
