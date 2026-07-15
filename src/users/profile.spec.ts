import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { compareSync, hashSync } from 'bcrypt';

import { UserEntity } from 'src/db/entities/user.entity';
import { TokenTypeEnum } from 'src/common/enums/token-type.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { UsersService } from './users.service';

const SENHA_ATUAL = 'senha-antiga-123';

function novoUsuario(): UserEntity {
    return {
        id: 'user-1',
        username: 'kaue',
        name: null,
        email: 'kaue@ifpi.edu.br',
        password: hashSync(SENHA_ATUAL, 10),
        role: UserRoleEnum.TEACHER,
        emailVerified: true,
    } as UserEntity;
}

/** Só os colaboradores que `updateProfile` e `changePassword` tocam. */
function buildService(user: UserEntity) {
    const salvos: UserEntity[] = [];
    const apagados: unknown[] = [];

    const usersRepository = {
        findOne: async ({ where }: { where: { id: string } }) => (where.id === user.id ? user : null),
        save: async (u: UserEntity) => {
            salvos.push(u);
            return u;
        },
    };
    const tokenRepository = {
        delete: async (criteria: unknown) => {
            apagados.push(criteria);
            return { affected: 1 };
        },
    };

    const service = new UsersService(
        usersRepository as never,
        tokenRepository as never,
        {} as never, // subjects
        {} as never, // classroomMembers
        {} as never, // classrooms
        {} as never, // files
        {} as never, // assignments
        {} as never, // submissions
        {} as never, // mail
        {} as never, // subjectService
    );

    return { service, salvos, apagados };
}

describe('UsersService.updateProfile()', () => {
    it('grava o nome de exibição', async () => {
        const user = novoUsuario();
        const { service } = buildService(user);

        const perfil = await service.updateProfile(user.id, { name: '  Kauê Alves S.  ' });

        expect(perfil.name).toBe('Kauê Alves S.');
        expect(user.name).toBe('Kauê Alves S.');
    });

    /** Nome em branco significa "apagar o nome": a UI volta a exibir o @username. */
    it('nome em branco apaga o nome, virando null', async () => {
        const user = novoUsuario();
        user.name = 'Kauê';
        const { service } = buildService(user);

        const perfil = await service.updateProfile(user.id, { name: '   ' });

        expect(perfil.name).toBeNull();
    });

    /**
     * O `username` é a identidade: está na URL do perfil e dentro do JWT. Se um corpo
     * malicioso conseguisse alterá-lo por aqui, links já compartilhados quebrariam e o
     * token ficaria obsoleto. A rota não deve tocá-lo em hipótese alguma.
     */
    it('não altera o username, mesmo que o corpo tente', async () => {
        const user = novoUsuario();
        const { service } = buildService(user);

        await service.updateProfile(user.id, { username: 'outro', role: 'ADMIN' } as never);

        expect(user.username).toBe('kaue');
        expect(user.role).toBe(UserRoleEnum.TEACHER);
    });
});

describe('UsersService.changePassword()', () => {
    const nova = 'senha-nova-4567';

    it('troca a senha quando a atual confere', async () => {
        const user = novoUsuario();
        const { service, salvos } = buildService(user);

        await service.changePassword(user.id, { currentPassword: SENHA_ATUAL, newPassword: nova });

        expect(salvos).toHaveLength(1);
        expect(compareSync(nova, user.password)).toBe(true);
    });

    it('grava a senha com hash, nunca em texto puro', async () => {
        const user = novoUsuario();
        const { service } = buildService(user);

        await service.changePassword(user.id, { currentPassword: SENHA_ATUAL, newPassword: nova });

        expect(user.password).not.toBe(nova);
        expect(user.password.startsWith('$2')).toBe(true);
    });

    /**
     * Sem esta conferência, uma aba esquecida aberta vira uma tomada de conta:
     * bastaria alcançar o formulário para trocar a senha.
     */
    it('recusa quando a senha atual está errada, e não altera nada', async () => {
        const user = novoUsuario();
        const original = user.password;
        const { service, salvos } = buildService(user);

        await expect(
            service.changePassword(user.id, { currentPassword: 'chute-errado', newPassword: nova }),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(user.password).toBe(original);
        expect(salvos).toHaveLength(0);
    });

    it('recusa quando a nova senha é igual à atual', async () => {
        const user = novoUsuario();
        const { service } = buildService(user);

        await expect(
            service.changePassword(user.id, { currentPassword: SENHA_ATUAL, newPassword: SENHA_ATUAL }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    /** Um pedido de "esqueci a senha" pendente seria uma segunda chave para a conta. */
    it('invalida os tokens de redefinição pendentes', async () => {
        const user = novoUsuario();
        const { service, apagados } = buildService(user);

        await service.changePassword(user.id, { currentPassword: SENHA_ATUAL, newPassword: nova });

        expect(apagados).toContainEqual({ userId: user.id, type: TokenTypeEnum.PASSWORD_RESET });
    });
});

function queryDeProfessoresVinculados(ids: string[]) {
    const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn(async () => ids.map(teacherId => ({ teacherId }))),
    };
    return qb;
}

function buildProfileService({
    users,
    linkedTeacherIds,
    subjects,
}: {
    users: UserEntity[];
    linkedTeacherIds: string[];
    subjects: { id: string; name: string; description?: string | null; isPublic: boolean }[];
}) {
    const usersRepository = {
        findOne: async ({ where }: { where: { id?: string; username?: string } }) =>
            users.find(u => (where.id ? u.id === where.id : u.username === where.username)) ?? null,
    };

    const classroomMemberRepository = {
        createQueryBuilder: jest.fn(() => queryDeProfessoresVinculados(linkedTeacherIds)),
    };

    const subjectService = {
        findVisibleInTeacherProfile: jest.fn(async () => subjects),
    };

    const service = new UsersService(
        usersRepository as never,
        {} as never, // tokens
        {} as never, // subjects
        classroomMemberRepository as never,
        {} as never, // classrooms
        {} as never, // files
        {} as never, // assignments
        {} as never, // submissions
        {} as never, // mail
        subjectService as never,
    );

    return { service, subjectService };
}

describe('UsersService.getProfile()', () => {
    const professor = {
        ...novoUsuario(),
        id: 'teacher-1',
        username: 'ana',
        role: UserRoleEnum.TEACHER,
    } as UserEntity;

    const aluno = {
        ...novoUsuario(),
        id: 'student-1',
        username: 'joao',
        role: UserRoleEnum.STUDENT,
    } as UserEntity;

    it('lista privadas do professor quando o aluno participa de turma vinculada', async () => {
        const { service, subjectService } = buildProfileService({
            users: [professor, aluno],
            linkedTeacherIds: [professor.id],
            subjects: [
                { id: 'publica-1', name: 'Algoritmos', description: null, isPublic: true },
                { id: 'privada-1', name: 'Banco de Dados - Turma A', description: null, isPublic: false },
            ],
        });

        const perfil = await service.getProfile(professor.username, {
            userId: aluno.id,
            role: UserRoleEnum.STUDENT,
        });

        expect(subjectService.findVisibleInTeacherProfile).toHaveBeenCalledWith(
            professor.id,
            { userId: aluno.id, role: UserRoleEnum.STUDENT },
            false,
        );
        expect(perfil.subjects).toEqual([
            { id: 'publica-1', name: 'Algoritmos', description: null, isPublic: true },
            { id: 'privada-1', name: 'Banco de Dados - Turma A', description: null, isPublic: false },
        ]);
    });

    it('bloqueia aluno sem vínculo antes de listar disciplinas privadas', async () => {
        const { service, subjectService } = buildProfileService({
            users: [professor, aluno],
            linkedTeacherIds: [],
            subjects: [],
        });

        await expect(
            service.getProfile(professor.username, {
                userId: aluno.id,
                role: UserRoleEnum.STUDENT,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(subjectService.findVisibleInTeacherProfile).not.toHaveBeenCalled();
    });
});
