import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { compareSync } from 'bcrypt';

import { ReportReasonEnum } from 'src/common/enums/report-reason.enum';
import { ReportStatusEnum } from 'src/common/enums/report-status.enum';
import { ReportTargetTypeEnum } from 'src/common/enums/report-target-type.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { FileEntity } from 'src/db/entities/file.entity';
import { ReportEntity } from 'src/db/entities/report.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { AdminService } from './admin.service';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const DELETED = '33333333-3333-4333-8333-333333333333';
const FILE = '44444444-4444-4444-8444-444444444444';
const REPORT = '55555555-5555-4555-8555-555555555555';

const user = (overrides: Partial<UserEntity> = {}) => ({
    id: TARGET,
    username: 'professor',
    email: 'professor@ifpi.edu.br',
    password: 'hash-secreto',
    role: UserRoleEnum.TEACHER,
    emailVerified: true,
    deletedAt: null,
    ...overrides,
}) as UserEntity;

const file = (overrides: Partial<FileEntity> = {}) => ({
    id: FILE,
    originalName: 'aula.pdf',
    key: 'pdfs/aula.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    subjectId: 'subject-id',
    uploadedBy: TARGET,
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
}) as FileEntity;

const report = (overrides: Partial<ReportEntity> = {}) => ({
    id: REPORT,
    reporterId: ADMIN,
    targetType: ReportTargetTypeEnum.FILE,
    targetUserId: null,
    targetFileId: FILE,
    reason: ReportReasonEnum.COPYRIGHT,
    description: 'Uso indevido',
    status: ReportStatusEnum.PENDING,
    resolvedBy: null,
    resolutionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
}) as ReportEntity;

function queryBuilder(data: unknown[] = [], total = data.length) {
    return {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        withDeleted: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [data, total]),
        getCount: jest.fn(async () => total),
    };
}

function buildService(options: {
    users?: UserEntity[];
    files?: FileEntity[];
    reports?: ReportEntity[];
} = {}) {
    const users = options.users ?? [
        user({ id: ADMIN, username: 'admin', email: 'admin@ifpi.edu.br', role: UserRoleEnum.ADMIN }),
        user(),
        user({ id: DELETED, username: 'ex-aluno', role: UserRoleEnum.STUDENT, deletedAt: new Date() }),
    ];
    const files = options.files ?? [file()];
    const reports = options.reports ?? [report()];
    const userQb = queryBuilder(users, users.length);
    const fileQb = queryBuilder(files, files.length);
    const reportQb = queryBuilder(reports, reports.length);

    const userRepository = {
        createQueryBuilder: jest.fn(() => userQb),
        findOne: jest.fn(async ({ where, withDeleted }: {
            where: { id?: string } | Array<{ username?: string; email?: string }>;
            withDeleted?: boolean;
        }) => {
            if (Array.isArray(where)) {
                return users.find(item => where.some(criteria =>
                    (criteria.username && item.username === criteria.username) ||
                    (criteria.email && item.email === criteria.email))) ?? null;
            }
            const found = users.find(item => item.id === where.id) ?? null;
            return found?.deletedAt && !withDeleted ? null : found;
        }),
        find: jest.fn(async () => users),
        create: jest.fn((data: Partial<UserEntity>) => data as UserEntity),
        save: jest.fn(async (item: UserEntity) => {
            if (!item.id) item.id = 'created-user';
            return item;
        }),
        softDelete: jest.fn(async () => ({ affected: 1 })),
        restore: jest.fn(async () => ({ affected: 1 })),
        count: jest.fn(async () => 0),
    };
    const fileRepository = {
        createQueryBuilder: jest.fn(() => fileQb),
        findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
            files.find(item => item.id === where.id) ?? null),
        find: jest.fn(async () => files),
        delete: jest.fn(async () => ({ affected: 1 })),
        softDelete: jest.fn(async () => ({ affected: 1 })),
        restore: jest.fn(async () => ({ affected: 1 })),
        count: jest.fn(async () => 0),
    };
    const reportRepository = {
        createQueryBuilder: jest.fn(() => reportQb),
        findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
            reports.find(item => item.id === where.id) ?? null),
        save: jest.fn(async (item: ReportEntity) => item),
        count: jest.fn(async () => 0),
    };
    const r2Service = {
        deleteObject: jest.fn(async () => undefined),
        getPresignedDownloadUrl: jest.fn(async () => 'https://r2.test/download'),
    };
    const service = new AdminService(
        userRepository as never,
        fileRepository as never,
        reportRepository as never,
        r2Service as never,
    );
    return {
        service,
        userRepository,
        fileRepository,
        reportRepository,
        r2Service,
        userQb,
        fileQb,
        reportQb,
    };
}

describe('AdminService - usuários', () => {
    it('ADM-02 lista com excluídos, papel, busca, paginação e sem campos sensíveis', async () => {
        const { service, userQb } = buildService();
        const result = await service.listUsers({
            page: 2,
            limit: 2,
            search: ' prof ',
            role: UserRoleEnum.TEACHER,
            includeDeleted: 'true',
        });
        expect(userQb.withDeleted).toHaveBeenCalled();
        expect(userQb.andWhere).toHaveBeenCalledWith('user.role = :role', {
            role: UserRoleEnum.TEACHER,
        });
        expect(userQb.andWhere).toHaveBeenCalledWith(
            '(user.username ILIKE :search OR user.email ILIKE :search)',
            { search: '%prof%' },
        );
        expect(userQb.skip).toHaveBeenCalledWith(2);
        expect(result.data[0]).not.toHaveProperty('password');
        expect(result.meta).toMatchObject({ page: 2, limit: 2, total: 3 });
    });

    it('ADM-02 usa zero páginas quando a consulta está vazia', async () => {
        const { service } = buildService({ users: [] });
        await expect(service.listUsers({})).resolves.toMatchObject({
            data: [],
            meta: { total: 0, totalPages: 0, hasNextPage: false },
        });
    });

    it('ADM-03 cria usuário verificado, normaliza email e preserva a senha exata no hash', async () => {
        const { service, userRepository } = buildService({ users: [] });
        const password = ' senha-123 ';
        const result = await service.createUser({
            username: '  novo  ',
            email: ' NOVO@IFPI.EDU.BR ',
            password,
            role: UserRoleEnum.STUDENT,
        });
        const created = userRepository.create.mock.calls[0][0] as UserEntity;
        expect(result).toMatchObject({
            username: 'novo',
            email: 'novo@ifpi.edu.br',
            emailVerified: true,
        });
        expect(compareSync(password, created.password)).toBe(true);
        expect(compareSync(password.trim(), created.password)).toBe(false);
        expect(result).not.toHaveProperty('password');
    });

    it('ADM-03 rejeita duplicidade prévia e concorrente com conflito controlado', async () => {
        const existing = buildService();
        const race = buildService({ users: [] });
        const dto = {
            username: 'professor',
            email: 'outro@ifpi.edu.br',
            password: 'senha-123',
            role: UserRoleEnum.TEACHER,
        };
        await expect(existing.service.createUser(dto)).rejects.toBeInstanceOf(ConflictException);
        race.userRepository.save.mockRejectedValueOnce({ driverError: { code: '23505' } });
        await expect(race.service.createUser({ ...dto, username: 'livre' }))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it('ADM-03 rejeita username ou senha compostos somente por espaços', async () => {
        const { service } = buildService({ users: [] });
        await expect(service.createUser({
            username: '   ',
            email: 'novo@ifpi.edu.br',
            password: 'senha-123',
            role: UserRoleEnum.STUDENT,
        })).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.createUser({
            username: 'novo',
            email: 'novo@ifpi.edu.br',
            password: '        ',
            role: UserRoleEnum.STUDENT,
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ADM-04 altera papel de terceiro, mas não do próprio administrador', async () => {
        const { service, userRepository } = buildService();
        await expect(service.updateUserRole(TARGET, { role: UserRoleEnum.STUDENT }, ADMIN))
            .resolves.toMatchObject({ id: TARGET, role: UserRoleEnum.STUDENT });
        expect(userRepository.save).toHaveBeenCalled();
        await expect(service.updateUserRole(ADMIN, { role: UserRoleEnum.TEACHER }, ADMIN))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ADM-05 aplica soft delete em terceiro, nunca em si mesmo ou novamente', async () => {
        const { service, userRepository } = buildService();
        await expect(service.softDeleteUser(TARGET, ADMIN)).resolves.toEqual({
            id: TARGET,
            deleted: true,
        });
        expect(userRepository.softDelete).toHaveBeenCalledWith(TARGET);
        await expect(service.softDeleteUser(ADMIN, ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.softDeleteUser(DELETED, ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ADM-06 restaura somente usuário realmente excluído', async () => {
        const { service, userRepository } = buildService();
        await expect(service.restoreUser(DELETED)).resolves.toEqual({ id: DELETED, restored: true });
        expect(userRepository.restore).toHaveBeenCalledWith(DELETED);
        await expect(service.restoreUser(TARGET)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.restoreUser('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('AdminService - arquivos', () => {
    it('ADM-07 lista busca, excluídos, uploader e converte bigint para number', async () => {
        const { service, userRepository, fileQb } = buildService();
        userRepository.find.mockResolvedValueOnce([user()]);
        const result = await service.listFiles({
            page: 1,
            limit: 20,
            search: ' aula ',
            includeDeleted: 'true',
        });
        expect(fileQb.withDeleted).toHaveBeenCalled();
        expect(fileQb.andWhere).toHaveBeenCalledWith(
            'file.originalName ILIKE :search',
            { search: '%aula%' },
        );
        expect(result.data[0]).toMatchObject({
            id: FILE,
            size: 1024,
            uploaderUsername: 'professor',
        });
    });

    it('ADM-08 gera download até para arquivo privado e desabilitado', async () => {
        const deleted = file({ deletedAt: new Date() });
        const { service, r2Service } = buildService({ files: [deleted] });
        await expect(service.getFileDownloadUrl(FILE)).resolves.toBe('https://r2.test/download');
        expect(r2Service.getPresignedDownloadUrl).toHaveBeenCalledWith(deleted.key);
    });

    it('ADM-09 soft delete mantém R2; hard delete remove R2 antes do registro', async () => {
        const soft = buildService();
        await soft.service.deleteFile(FILE, false);
        expect(soft.fileRepository.softDelete).toHaveBeenCalledWith(FILE);
        expect(soft.r2Service.deleteObject).not.toHaveBeenCalled();

        const hard = buildService();
        await hard.service.deleteFile(FILE, true);
        expect(hard.r2Service.deleteObject).toHaveBeenCalledWith('pdfs/aula.pdf');
        expect(hard.r2Service.deleteObject.mock.invocationCallOrder[0])
            .toBeLessThan(hard.fileRepository.delete.mock.invocationCallOrder[0]);
    });

    it('ADM-10 falha do R2 preserva o registro para auditoria e nova tentativa', async () => {
        const { service, fileRepository, r2Service } = buildService();
        r2Service.deleteObject.mockRejectedValueOnce(new Error('R2 unavailable'));
        await expect(service.deleteFile(FILE, true)).rejects.toThrow('R2 unavailable');
        expect(fileRepository.delete).not.toHaveBeenCalled();
    });

    it('ADM-09/11 rejeita soft delete repetido e restaura somente desabilitado', async () => {
        const deleted = file({ deletedAt: new Date() });
        const deletedCase = buildService({ files: [deleted] });
        const activeCase = buildService();
        await expect(deletedCase.service.deleteFile(FILE, false))
            .rejects.toBeInstanceOf(BadRequestException);
        await expect(deletedCase.service.restoreFile(FILE)).resolves.toEqual({
            id: FILE,
            restored: true,
        });
        await expect(activeCase.service.restoreFile(FILE)).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('AdminService - denúncias e estatísticas', () => {
    it('DEN-06 filtra e enriquece denúncia com autor, alvo, arquivo e uploader', async () => {
        const targetFile = file();
        const { service, reportQb, userRepository, fileRepository } = buildService({
            reports: [report()],
            files: [targetFile],
        });
        userRepository.find
            .mockResolvedValueOnce([user({ id: ADMIN, username: 'autor' })])
            .mockResolvedValueOnce([user()]);
        fileRepository.find.mockResolvedValueOnce([targetFile]);

        const result = await service.listReports({
            page: 1,
            limit: 20,
            status: ReportStatusEnum.PENDING,
            targetType: ReportTargetTypeEnum.FILE,
        });
        expect(reportQb.andWhere).toHaveBeenCalledWith(
            'report.status = :status',
            { status: ReportStatusEnum.PENDING },
        );
        expect(reportQb.andWhere).toHaveBeenCalledWith(
            'report.targetType = :targetType',
            { targetType: ReportTargetTypeEnum.FILE },
        );
        expect(result.data[0]).toMatchObject({
            reporter: { id: ADMIN, username: 'autor' },
            targetFile: {
                id: FILE,
                uploader: { id: TARGET, username: 'professor' },
            },
        });
    });

    it('DEN-07 status terminal registra responsável; não terminal limpa responsável', async () => {
        const terminal = buildService();
        await expect(terminal.service.updateReportStatus(
            REPORT,
            { status: ReportStatusEnum.RESOLVED, resolutionNote: '  removido  ' },
            ADMIN,
        )).resolves.toMatchObject({
            status: ReportStatusEnum.RESOLVED,
            resolutionNote: 'removido',
            resolvedBy: ADMIN,
        });
        const review = buildService({ reports: [report({ resolvedBy: ADMIN })] });
        await expect(review.service.updateReportStatus(
            REPORT,
            { status: ReportStatusEnum.REVIEWED },
            ADMIN,
        )).resolves.toMatchObject({
            status: ReportStatusEnum.REVIEWED,
            resolutionNote: null,
            resolvedBy: null,
        });
    });

    it('ADM-12 contabiliza ativos, excluídos, papéis, arquivos e denúncias', async () => {
        const { service, userRepository, fileRepository, reportRepository } = buildService();
        userRepository.count
            .mockResolvedValueOnce(10)
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(4)
            .mockResolvedValueOnce(5);
        fileRepository.count.mockResolvedValueOnce(20);
        reportRepository.count.mockResolvedValueOnce(3).mockResolvedValueOnce(8);
        userRepository.createQueryBuilder().getCount.mockResolvedValueOnce(2);
        fileRepository.createQueryBuilder().getCount.mockResolvedValueOnce(4);

        await expect(service.getStats()).resolves.toEqual({
            users: {
                total: 10,
                deleted: 2,
                byRole: { admins: 1, teachers: 4, students: 5 },
            },
            files: { total: 20, deleted: 4 },
            reports: { total: 8, pending: 3 },
        });
    });
});
