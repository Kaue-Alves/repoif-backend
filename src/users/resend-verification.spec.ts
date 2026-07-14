import { BadRequestException } from '@nestjs/common';

import { TokenEntity } from 'src/db/entities/token.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { TokenTypeEnum } from 'src/common/enums/token-type.enum';
import { MailService } from 'src/mail/mail.service';
import { EMAIL_VERIFICATION_TTL_MS, UsersService } from './users.service';

const NAO_VERIFICADO = {
    id: 'user-1',
    username: 'bruno',
    email: 'bruno@aluno.ifpi.edu.br',
    emailVerified: false,
} as UserEntity;

const VERIFICADO = {
    id: 'user-2',
    username: 'ana',
    email: 'ana@ifpi.edu.br',
    emailVerified: true,
} as UserEntity;

/** Só os colaboradores que `resendEmailVerification` toca. */
function buildService(usuarios: UserEntity[] = [NAO_VERIFICADO, VERIFICADO]) {
    const tokensSalvos: TokenEntity[] = [];
    const apagados: unknown[] = [];

    const usersRepository = {
        findOne: async ({ where }: { where: { email: string } }) =>
            usuarios.find(u => u.email === where.email) ?? null,
    };
    const tokenRepository = {
        delete: async (criteria: unknown) => {
            apagados.push(criteria);
            return { affected: 1 };
        },
        save: async (token: TokenEntity) => {
            tokensSalvos.push(token);
            return token;
        },
    };
    const mailService = {
        sendVerificationEmail: jest.fn(async () => {}),
    } as unknown as jest.Mocked<MailService>;

    const service = new UsersService(
        usersRepository as never,
        tokenRepository as never,
        {} as never, // subjects
        {} as never, // classroomMembers
        {} as never, // classrooms
        {} as never, // files
        {} as never, // assignments
        {} as never, // submissions
        mailService,
        {} as never, // subjectService
    );

    return { service, mailService, tokensSalvos, apagados };
}

describe('UsersService.resendEmailVerification()', () => {
    it('emite um token novo e envia o e-mail para a conta não verificada', async () => {
        const { service, mailService, tokensSalvos } = buildService();

        await service.resendEmailVerification(NAO_VERIFICADO.email);

        expect(tokensSalvos).toHaveLength(1);
        expect(tokensSalvos[0].type).toBe(TokenTypeEnum.EMAIL_VERIFICATION);
        expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
            NAO_VERIFICADO.email,
            NAO_VERIFICADO.username,
            tokensSalvos[0].token,
        );
    });

    /** Um link antigo que continuasse valendo seria uma credencial a mais circulando. */
    it('invalida os tokens de verificação anteriores antes de emitir o novo', async () => {
        const { service, apagados } = buildService();

        await service.resendEmailVerification(NAO_VERIFICADO.email);

        expect(apagados).toContainEqual({
            userId: NAO_VERIFICADO.id,
            type: TokenTypeEnum.EMAIL_VERIFICATION,
        });
    });

    it('o novo token vale 24 horas — os 10 minutos antigos venciam antes de o e-mail ser lido', async () => {
        const { service, tokensSalvos } = buildService();

        await service.resendEmailVerification(NAO_VERIFICADO.email);

        const horas = (tokensSalvos[0].expiresAt.getTime() - Date.now()) / 3_600_000;
        expect(EMAIL_VERIFICATION_TTL_MS).toBe(86_400_000);
        expect(Math.round(horas)).toBe(24);
    });

    /**
     * Responder diferente para "não existe" e "já verificado" transformaria a rota
     * num oráculo de quais e-mails têm conta no sistema.
     */
    it('não envia nada para conta já verificada, e não acusa isso', async () => {
        const { service, mailService, tokensSalvos } = buildService();

        await expect(service.resendEmailVerification(VERIFICADO.email)).resolves.toBeUndefined();

        expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
        expect(tokensSalvos).toHaveLength(0);
    });

    it('não envia nada para e-mail inexistente, e não acusa isso', async () => {
        const { service, mailService } = buildService();

        await expect(service.resendEmailVerification('ninguem@example.com')).resolves.toBeUndefined();

        expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('recusa e-mail em branco', async () => {
        const { service } = buildService();

        await expect(service.resendEmailVerification('   ')).rejects.toBeInstanceOf(BadRequestException);
    });
});
