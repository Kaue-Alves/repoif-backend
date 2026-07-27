import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { compareSync } from 'bcrypt';
import { DataSource, Repository } from 'typeorm';

import { ReportReasonEnum } from 'src/common/enums/report-reason.enum';
import { ReportStatusEnum } from 'src/common/enums/report-status.enum';
import { ReportTargetTypeEnum } from 'src/common/enums/report-target-type.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { FileEntity } from 'src/db/entities/file.entity';
import { ReportEntity } from 'src/db/entities/report.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { R2Service } from 'src/r2/r2.service';
import { ReportsService } from 'src/reports/reports.service';
import { AdminService } from './admin.service';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

const ADMIN = '11111111-1111-4111-8111-111111111111';
const TEACHER = '22222222-2222-4222-8222-222222222222';
const STUDENT = '33333333-3333-4333-8333-333333333333';
const OTHER_STUDENT = '44444444-4444-4444-8444-444444444444';
const FILE = '55555555-5555-4555-8555-555555555555';
const SUBJECT = '66666666-6666-4666-8666-666666666666';

describeIfDb('Admin e denúncias - integração com PostgreSQL', () => {
    let adminService: AdminService;
    let reportsService: ReportsService;
    let dataSource: DataSource;
    let users: Repository<UserEntity>;
    let files: Repository<FileEntity>;
    let reports: Repository<ReportEntity>;

    const r2 = {
        deleteObject: jest.fn(async () => undefined),
        getPresignedDownloadUrl: jest.fn(async (key: string) => `https://r2.test/${key}`),
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    url: TEST_DATABASE_URL,
                    entities: [UserEntity, FileEntity, ReportEntity],
                    synchronize: true,
                    dropSchema: true,
                }),
                TypeOrmModule.forFeature([UserEntity, FileEntity, ReportEntity]),
            ],
            providers: [
                AdminService,
                ReportsService,
                { provide: R2Service, useValue: r2 },
            ],
        }).compile();

        adminService = moduleRef.get(AdminService);
        reportsService = moduleRef.get(ReportsService);
        dataSource = moduleRef.get(DataSource);
        users = moduleRef.get(getRepositoryToken(UserEntity));
        files = moduleRef.get(getRepositoryToken(FileEntity));
        reports = moduleRef.get(getRepositoryToken(ReportEntity));
    });

    afterAll(async () => {
        await dataSource?.destroy();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        r2.deleteObject.mockResolvedValue(undefined);
        await reports.clear();
        await files.clear();
        await users.clear();

        await users.save([
            users.create({
                id: ADMIN,
                username: 'admin',
                email: 'admin@ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.ADMIN,
                emailVerified: true,
            }),
            users.create({
                id: TEACHER,
                username: 'ana',
                email: 'ana@ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.TEACHER,
                emailVerified: true,
            }),
            users.create({
                id: STUDENT,
                username: 'bruno',
                email: 'bruno@aluno.ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.STUDENT,
                emailVerified: true,
            }),
            users.create({
                id: OTHER_STUDENT,
                username: 'carla',
                email: 'carla@aluno.ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.STUDENT,
                emailVerified: true,
            }),
        ]);
        await files.save(files.create({
            id: FILE,
            originalName: 'material privado.pdf',
            key: 'pdfs/material.pdf',
            mimeType: 'application/pdf',
            size: 2048,
            subjectId: SUBJECT,
            uploadedBy: TEACHER,
            isPublic: false,
        }));
    });

    it('ADM-02 lista por ILIKE, papel, excluídos e paginação sem hash', async () => {
        await users.softDelete(STUDENT);
        const result = await adminService.listUsers({
            page: 1,
            limit: 10,
            search: 'BRUNO',
            role: UserRoleEnum.STUDENT,
            includeDeleted: 'true',
        });
        expect(result.data).toEqual([
            expect.objectContaining({ id: STUDENT, username: 'bruno', deletedAt: expect.any(Date) }),
        ]);
        expect(result.data[0]).not.toHaveProperty('password');
        expect(result.meta).toMatchObject({ total: 1, totalPages: 1 });
    });

    it('ADM-03 cria usuário verificado com hash e converte unicidade real em conflito', async () => {
        const created = await adminService.createUser({
            username: '  novo  ',
            email: ' NOVO@IFPI.EDU.BR ',
            password: 'senha-segura',
            role: UserRoleEnum.STUDENT,
        });
        const persisted = await users.findOneByOrFail({ id: created.id });
        expect(persisted.emailVerified).toBe(true);
        expect(compareSync('senha-segura', persisted.password)).toBe(true);

        await expect(adminService.createUser({
            username: 'outro',
            email: 'novo@ifpi.edu.br',
            password: 'senha-segura',
            role: UserRoleEnum.STUDENT,
        })).rejects.toBeInstanceOf(ConflictException);
    });

    it('ADM-04/05/06 altera terceiro e completa soft delete/restauração', async () => {
        await expect(adminService.updateUserRole(
            STUDENT,
            { role: UserRoleEnum.TEACHER },
            ADMIN,
        )).resolves.toMatchObject({ role: UserRoleEnum.TEACHER });
        await adminService.softDeleteUser(STUDENT, ADMIN);
        expect(await users.findOne({ where: { id: STUDENT } })).toBeNull();
        expect(await users.findOne({ where: { id: STUDENT }, withDeleted: true }))
            .toMatchObject({ deletedAt: expect.any(Date) });
        await adminService.restoreUser(STUDENT);
        expect(await users.findOneBy({ id: STUDENT })).toBeDefined();
    });

    it('ADM-07/08/09/11 lista, baixa, desabilita e restaura arquivo privado', async () => {
        await expect(adminService.getFileDownloadUrl(FILE))
            .resolves.toBe('https://r2.test/pdfs/material.pdf');
        await adminService.deleteFile(FILE, false);

        const listed = await adminService.listFiles({
            page: 1,
            limit: 20,
            search: 'PRIVADO',
            includeDeleted: 'true',
        });
        expect(listed.data).toEqual([
            expect.objectContaining({
                id: FILE,
                uploaderUsername: 'ana',
                deletedAt: expect.any(Date),
            }),
        ]);
        expect(r2.deleteObject).not.toHaveBeenCalled();
        await adminService.restoreFile(FILE);
        expect(await files.findOneBy({ id: FILE })).toBeDefined();
    });

    it('ADM-09/10 preserva metadados se R2 falha e remove ambos quando funciona', async () => {
        r2.deleteObject.mockRejectedValueOnce(new Error('R2 unavailable'));
        await expect(adminService.deleteFile(FILE, true)).rejects.toThrow('R2 unavailable');
        expect(await files.findOneBy({ id: FILE })).toBeDefined();

        await adminService.deleteFile(FILE, true);
        expect(r2.deleteObject).toHaveBeenLastCalledWith('pdfs/material.pdf');
        expect(await files.findOne({ where: { id: FILE }, withDeleted: true })).toBeNull();
    });

    it('DEN-01/02/03 cria somente alvos válidos e consulta apenas as próprias denúncias', async () => {
        const userReport = await reportsService.create({
            targetType: ReportTargetTypeEnum.USER,
            targetUserId: TEACHER,
            reason: ReportReasonEnum.HARASSMENT,
        }, STUDENT);
        const fileReport = await reportsService.create({
            targetType: ReportTargetTypeEnum.FILE,
            targetFileId: FILE,
            reason: ReportReasonEnum.COPYRIGHT,
        }, STUDENT);
        await reportsService.create({
            targetType: ReportTargetTypeEnum.USER,
            targetUserId: TEACHER,
            reason: ReportReasonEnum.SPAM,
        }, OTHER_STUDENT);

        const mine = await reportsService.findMyReports(STUDENT);
        expect(mine.map(item => item.id).sort()).toEqual([userReport.id, fileReport.id].sort());
        expect(mine.every(item => item.reporterId === STUDENT)).toBe(true);
    });

    it('DEN-04 índice parcial impede corrida e permite nova pendência após revisão', async () => {
        const dto = {
            targetType: ReportTargetTypeEnum.USER,
            targetUserId: TEACHER,
            reason: ReportReasonEnum.HARASSMENT,
        };
        const attempts = await Promise.allSettled([
            reportsService.create(dto, STUDENT),
            reportsService.create(dto, STUDENT),
        ]);
        expect(attempts.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(attempts.filter(item => item.status === 'rejected')).toHaveLength(1);
        expect(await reports.countBy({ reporterId: STUDENT, status: ReportStatusEnum.PENDING })).toBe(1);

        const first = await reports.findOneByOrFail({
            reporterId: STUDENT,
            status: ReportStatusEnum.PENDING,
        });
        await adminService.updateReportStatus(
            first.id,
            { status: ReportStatusEnum.REVIEWED },
            ADMIN,
        );
        await expect(reportsService.create(dto, STUDENT)).resolves.toBeDefined();
    });

    it('DEN-06/07 filtra, enriquece e registra o administrador responsável', async () => {
        const created = await reportsService.create({
            targetType: ReportTargetTypeEnum.FILE,
            targetFileId: FILE,
            reason: ReportReasonEnum.COPYRIGHT,
        }, STUDENT);
        const listed = await adminService.listReports({
            page: 1,
            limit: 20,
            status: ReportStatusEnum.PENDING,
            targetType: ReportTargetTypeEnum.FILE,
        });
        expect(listed.data).toEqual([
            expect.objectContaining({
                reporter: { id: STUDENT, username: 'bruno' },
                targetFile: expect.objectContaining({
                    id: FILE,
                    uploader: expect.objectContaining({ id: TEACHER, username: 'ana' }),
                }),
            }),
        ]);
        await expect(adminService.updateReportStatus(
            created.id,
            { status: ReportStatusEnum.RESOLVED, resolutionNote: '  removido  ' },
            ADMIN,
        )).resolves.toMatchObject({
            status: ReportStatusEnum.RESOLVED,
            resolutionNote: 'removido',
            resolvedBy: ADMIN,
        });
    });

    it('ADM-12 calcula estatísticas reais de usuários, arquivos e denúncias', async () => {
        await users.softDelete(OTHER_STUDENT);
        await files.softDelete(FILE);
        await reports.save(reports.create({
            reporterId: STUDENT,
            targetType: ReportTargetTypeEnum.USER,
            targetUserId: TEACHER,
            targetFileId: null,
            reason: ReportReasonEnum.OTHER,
            status: ReportStatusEnum.PENDING,
        }));
        await expect(adminService.getStats()).resolves.toEqual({
            users: {
                total: 3,
                deleted: 1,
                byRole: { admins: 1, teachers: 1, students: 1 },
            },
            files: { total: 0, deleted: 1 },
            reports: { total: 1, pending: 1 },
        });
    });
});
