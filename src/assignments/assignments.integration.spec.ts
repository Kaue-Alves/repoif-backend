import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AssignmentEntity } from 'src/db/entities/assignment.entity';
import { AssignmentSubmissionEntity } from 'src/db/entities/assignment-submission.entity';
import { StorageCleanupEntity } from 'src/db/entities/storage-cleanup.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { ClassroomService } from 'src/classroom/classroom.service';
import { MailService } from 'src/mail/mail.service';
import { R2Service } from 'src/r2/r2.service';
import { StorageCleanupService } from 'src/storage-cleanup/storage-cleanup.service';
import { AssignmentsService } from './assignments.service';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

const ASSIGNMENT = '11111111-1111-4111-8111-111111111111';
const SUBJECT = '22222222-2222-4222-8222-222222222222';
const TEACHER = '33333333-3333-4333-8333-333333333333';
const STUDENT = '44444444-4444-4444-8444-444444444444';

describeIfDb('AssignmentsService - integração com PostgreSQL', () => {
    let service: AssignmentsService;
    let assignments: Repository<AssignmentEntity>;
    let submissions: Repository<AssignmentSubmissionEntity>;
    let cleanupJobs: Repository<StorageCleanupEntity>;
    let storageCleanup: StorageCleanupService;
    let dataSource: DataSource;

    const r2 = {
        deleteObject: jest.fn(async () => undefined),
        buildKey: jest.fn(() => 'generated/key'),
        getPresignedUploadUrl: jest.fn(async () => 'https://r2.test/upload'),
        createUploadProof: jest.fn(() => 'signed-upload-proof'),
        verifyUploadedObject: jest.fn(async () => undefined),
        getPresignedDownloadUrl: jest.fn(async () => 'https://r2.test/download'),
    };
    const classroom = {
        isSubjectAccessibleToMember: jest.fn(async () => true),
        getActiveStudentsForSubject: jest.fn(async () => []),
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    url: TEST_DATABASE_URL,
                    entities: [AssignmentEntity, AssignmentSubmissionEntity, StorageCleanupEntity],
                    synchronize: true,
                    dropSchema: true,
                }),
                TypeOrmModule.forFeature([
                    AssignmentEntity,
                    AssignmentSubmissionEntity,
                    StorageCleanupEntity,
                ]),
            ],
            providers: [
                AssignmentsService,
                StorageCleanupService,
                {
                    provide: getRepositoryToken(SubjectEntity),
                    useValue: {
                        findOne: jest.fn(async () => ({
                            id: SUBJECT,
                            name: 'Algoritmos',
                            teacherId: TEACHER,
                            isPublic: false,
                        })),
                    },
                },
                {
                    provide: getRepositoryToken(UserEntity),
                    useValue: { findOne: jest.fn(async () => null), find: jest.fn(async () => []) },
                },
                { provide: R2Service, useValue: r2 },
                { provide: MailService, useValue: { sendSubmissionEmail: jest.fn(async () => undefined) } },
                { provide: ClassroomService, useValue: classroom },
            ],
        })
            .compile();

        service = moduleRef.get(AssignmentsService);
        dataSource = moduleRef.get(DataSource);
        assignments = moduleRef.get(getRepositoryToken(AssignmentEntity));
        submissions = moduleRef.get(getRepositoryToken(AssignmentSubmissionEntity));
        cleanupJobs = moduleRef.get(getRepositoryToken(StorageCleanupEntity));
        storageCleanup = moduleRef.get(StorageCleanupService);
    });

    afterAll(async () => {
        await dataSource?.destroy();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        r2.deleteObject.mockResolvedValue(undefined);
        await cleanupJobs.clear();
        await submissions.clear();
        await assignments.clear();
        await assignments.save(assignments.create({
            id: ASSIGNMENT,
            subjectId: SUBJECT,
            teacherId: TEACHER,
            title: 'Trabalho final',
            dueDate: new Date(Date.now() + 86_400_000),
        }));
    });

    const confirmDto = (key: string) => ({
        uploadProof: 'signed-upload-proof',
        key,
        originalName: 'resposta.pdf',
        mimeType: 'application/pdf',
        size: 1024,
    });

    it('ATV-09 persiste uma entrega com valores padrão reais do PostgreSQL', async () => {
        const result = await service.confirmSubmission(
            ASSIGNMENT,
            confirmDto('submissions/first.pdf'),
            STUDENT,
        );

        expect(result).toMatchObject({
            assignmentId: ASSIGNMENT,
            studentId: STUDENT,
            size: 1024,
            resubmitAllowed: false,
            late: false,
        });
        expect(await submissions.count()).toBe(1);
    });

    it('ATV-10 a restrição única impede duas entregas do mesmo aluno', async () => {
        const first = submissions.create({
            assignmentId: ASSIGNMENT,
            studentId: STUDENT,
            key: 'submissions/first.pdf',
            originalName: 'first.pdf',
            mimeType: 'application/pdf',
            size: 100,
            submittedAt: new Date(),
        });
        const duplicate = submissions.create({
            ...first,
            id: undefined,
            key: 'submissions/duplicate.pdf',
        });

        await submissions.save(first);
        await expect(submissions.save(duplicate)).rejects.toMatchObject({
            driverError: expect.objectContaining({ code: '23505' }),
        });
        expect(await submissions.count()).toBe(1);
    });

    it('ATV-10 service rejeita segundo envio enquanto bloqueado', async () => {
        await service.confirmSubmission(ASSIGNMENT, confirmDto('submissions/first.pdf'), STUDENT);

        await expect(
            service.confirmSubmission(ASSIGNMENT, confirmDto('submissions/second.pdf'), STUDENT),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await submissions.count()).toBe(1);
    });

    it('ATV-11/12 autorização permite uma substituição e volta a bloquear', async () => {
        const first = await service.confirmSubmission(
            ASSIGNMENT,
            confirmDto('submissions/first.pdf'),
            STUDENT,
        );

        await service.allowResubmit(ASSIGNMENT, STUDENT, TEACHER);
        const resent = await service.confirmSubmission(
            ASSIGNMENT,
            confirmDto('submissions/second.pdf'),
            STUDENT,
        );

        expect(resent.id).toBe(first.id);
        expect(resent.resubmitAllowed).toBe(false);
        expect(await submissions.count()).toBe(1);
        expect((await submissions.findOneByOrFail({ id: first.id })).key)
            .toBe('submissions/second.pdf');
        expect(r2.deleteObject).toHaveBeenCalledWith('submissions/first.pdf');

        await expect(
            service.confirmSubmission(ASSIGNMENT, confirmDto('submissions/third.pdf'), STUDENT),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it('ATV-12 mantém a limpeza pendente e a reprocessa após falha do R2', async () => {
        await service.confirmSubmission(
            ASSIGNMENT,
            confirmDto('submissions/first.pdf'),
            STUDENT,
        );
        await service.allowResubmit(ASSIGNMENT, STUDENT, TEACHER);
        r2.deleteObject.mockRejectedValue(new Error('R2 unavailable'));

        await service.confirmSubmission(
            ASSIGNMENT,
            confirmDto('submissions/second.pdf'),
            STUDENT,
        );

        expect((await submissions.findOneByOrFail({
            assignmentId: ASSIGNMENT,
            studentId: STUDENT,
        })).key).toBe('submissions/second.pdf');
        expect(await cleanupJobs.findOneByOrFail({
            key: 'submissions/first.pdf',
        })).toMatchObject({
            attempts: 1,
            lastError: 'R2 unavailable',
        });

        r2.deleteObject.mockResolvedValue(undefined);
        await expect(storageCleanup.processPending()).resolves.toEqual({
            processed: 1,
            failed: 0,
        });
        expect(await cleanupJobs.count()).toBe(0);
    });
});
