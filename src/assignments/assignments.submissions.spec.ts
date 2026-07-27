import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';

import { AssignmentEntity } from 'src/db/entities/assignment.entity';
import { AssignmentSubmissionEntity } from 'src/db/entities/assignment-submission.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { AssignmentsService } from './assignments.service';

const TEACHER = 'teacher-id';
const OTHER = 'other-id';
const STUDENT = 'student-id';
const FORMER_STUDENT = 'former-student-id';
const SUBJECT = 'subject-id';
const ASSIGNMENT = 'assignment-id';

function assignment(overrides: Partial<AssignmentEntity> = {}): AssignmentEntity {
    return {
        id: ASSIGNMENT,
        subjectId: SUBJECT,
        teacherId: TEACHER,
        title: 'Trabalho final',
        dueDate: new Date(Date.now() + 86_400_000),
        ...overrides,
    } as AssignmentEntity;
}

function submission(overrides: Partial<AssignmentSubmissionEntity> = {}): AssignmentSubmissionEntity {
    return {
        id: 'submission-id',
        assignmentId: ASSIGNMENT,
        studentId: STUDENT,
        key: 'old/resposta.pdf',
        originalName: 'resposta.pdf',
        mimeType: 'application/pdf',
        size: 100,
        resubmitAllowed: false,
        submittedAt: new Date(),
        ...overrides,
    } as AssignmentSubmissionEntity;
}

function student(id = STUDENT): UserEntity {
    return {
        id,
        username: id === STUDENT ? 'aluno' : 'ex-aluno',
        email: `${id}@ifpi.edu.br`,
    } as UserEntity;
}

function buildService({
    currentAssignment = assignment(),
    existingSubmission = null as AssignmentSubmissionEntity | null,
    memberAccess = true,
    roster = [student()],
}: {
    currentAssignment?: AssignmentEntity | null;
    existingSubmission?: AssignmentSubmissionEntity | null;
    memberAccess?: boolean;
    roster?: UserEntity[];
} = {}) {
    const assignmentRepository = {
        findOne: jest.fn(async () => currentAssignment),
        save: jest.fn(async (item: AssignmentEntity) => item),
        delete: jest.fn(async () => ({ affected: 1 })),
    };

    const submissionRepository = {
        findOne: jest.fn(async ({ where }: { where: { id?: string; assignmentId?: string; studentId?: string } }) => {
            if (!existingSubmission) return null;
            if (where.id && where.id !== existingSubmission.id) return null;
            if (where.assignmentId && where.assignmentId !== existingSubmission.assignmentId) return null;
            if (where.studentId && where.studentId !== existingSubmission.studentId) return null;
            return existingSubmission;
        }),
        find: jest.fn(async () => existingSubmission ? [existingSubmission] : []),
        save: jest.fn(async (item: AssignmentSubmissionEntity) => {
            if (!item.id) item.id = 'created-submission';
            return item;
        }),
    };

    const subjectRepository = {
        findOne: jest.fn(async () => ({
            id: SUBJECT,
            name: 'Algoritmos',
            teacherId: TEACHER,
            isPublic: false,
        } as SubjectEntity)),
    };

    const allUsers = [student(), student(FORMER_STUDENT), {
        id: TEACHER,
        username: 'professor',
        email: 'professor@ifpi.edu.br',
    } as UserEntity];
    const userRepository = {
        findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
            allUsers.find(item => item.id === where.id) ?? null,
        ),
        find: jest.fn(async ({ where }: { where: { id: string }[] }) =>
            allUsers.filter(item => where.some(criteria => criteria.id === item.id)),
        ),
    };

    const r2Service = {
        buildKey: jest.fn(() => 'new/generated-key'),
        getPresignedUploadUrl: jest.fn(async () => 'https://r2.test/upload'),
        createUploadProof: jest.fn(() => 'signed-upload-proof'),
        verifyUploadedObject: jest.fn(async () => undefined),
        getPresignedDownloadUrl: jest.fn(async () => 'https://r2.test/download'),
        deleteObject: jest.fn(async () => undefined),
    };
    const storageCleanupService = {
        enqueue: jest.fn(async () => undefined),
        processKeys: jest.fn(async (keys: string[]) => {
            await Promise.all(keys.map(key => r2Service.deleteObject(key).catch(() => {})));
            return { processed: keys.length, failed: 0 };
        }),
    };
    const mailService = {
        sendSubmissionEmail: jest.fn(async () => undefined),
        sendNewAssignmentEmail: jest.fn(async () => undefined),
    };
    const classroomService = {
        isSubjectAccessibleToMember: jest.fn(async () => memberAccess),
        getActiveStudentsForSubject: jest.fn(async () => roster),
    };
    const dataSource = {
        transaction: jest.fn(async (callback: (manager: {
            getRepository: (entity: unknown) =>
                typeof assignmentRepository | typeof submissionRepository;
        }) => Promise<unknown>) => callback({
            getRepository: entity =>
                entity === AssignmentSubmissionEntity
                    ? submissionRepository
                    : assignmentRepository,
        })),
    };

    const service = new AssignmentsService(
        assignmentRepository as never,
        submissionRepository as never,
        subjectRepository as never,
        userRepository as never,
        r2Service as never,
        storageCleanupService as never,
        mailService as never,
        classroomService as never,
        dataSource as never,
    );

    return {
        service,
        assignmentRepository,
        submissionRepository,
        r2Service,
        storageCleanupService,
        mailService,
        classroomService,
    };
}

const uploadDto = {
    filename: 'resposta.pdf',
    contentType: 'application/pdf',
    size: 1024,
};

const confirmDto = {
    uploadProof: 'signed-upload-proof',
    key: 'new/resposta.pdf',
    originalName: 'resposta.pdf',
    mimeType: 'application/pdf',
    size: 1024,
};

describe('AssignmentsService - permissão para entregar', () => {
    it('ATV-08 aluno ativo solicita URL assinada', async () => {
        const { service, r2Service } = buildService();

        await expect(service.requestSubmissionUploadUrl(ASSIGNMENT, uploadDto, STUDENT))
            .resolves.toEqual({
                uploadUrl: 'https://r2.test/upload',
                key: 'new/generated-key',
                uploadProof: 'signed-upload-proof',
            });
        expect(r2Service.getPresignedUploadUrl).toHaveBeenCalledWith(
            'new/generated-key',
            'application/pdf',
            1024,
        );
        expect(r2Service.createUploadProof).toHaveBeenCalledWith({
            userId: STUDENT,
            purpose: 'assignment-submission',
            scopeId: ASSIGNMENT,
            key: 'new/generated-key',
            filename: 'resposta.pdf',
            contentType: 'application/pdf',
            size: 1024,
        });
    });

    it('ATV-08 rejeita usuário sem vínculo antes de gerar URL', async () => {
        const { service, r2Service } = buildService({ memberAccess: false });

        await expect(service.requestSubmissionUploadUrl(ASSIGNMENT, uploadDto, OTHER))
            .rejects.toBeInstanceOf(ForbiddenException);
        expect(r2Service.getPresignedUploadUrl).not.toHaveBeenCalled();
    });

    it('ATV-02 rejeita entrega após o prazo, mesmo com reenvio autorizado', async () => {
        const old = submission({ resubmitAllowed: true });
        const { service } = buildService({
            currentAssignment: assignment({ dueDate: new Date(Date.now() - 1) }),
            existingSubmission: old,
        });

        await expect(service.confirmSubmission(ASSIGNMENT, confirmDto, STUDENT))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('ATV-10 rejeita segundo envio sem autorização', async () => {
        const old = submission({ resubmitAllowed: false });
        const { service, submissionRepository, r2Service } = buildService({ existingSubmission: old });

        await expect(service.confirmSubmission(ASSIGNMENT, confirmDto, STUDENT))
            .rejects.toBeInstanceOf(ConflictException);
        expect(submissionRepository.save).not.toHaveBeenCalled();
        expect(r2Service.deleteObject).not.toHaveBeenCalled();
    });
});

describe('AssignmentsService - confirmação e reenvio', () => {
    it('FIL-06 não persiste entrega quando a prova ou o objeto é inválido', async () => {
        const { service, submissionRepository, r2Service } = buildService();
        r2Service.verifyUploadedObject.mockRejectedValueOnce(
            new BadRequestException('O arquivo enviado não foi encontrado no armazenamento'),
        );

        await expect(service.confirmSubmission(ASSIGNMENT, confirmDto, STUDENT))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(submissionRepository.save).not.toHaveBeenCalled();
    });

    it('ATV-09 persiste a primeira entrega bloqueada para novo envio', async () => {
        const { service, submissionRepository } = buildService();
        const before = Date.now();

        const result = await service.confirmSubmission(ASSIGNMENT, confirmDto, STUDENT);

        expect(submissionRepository.save).toHaveBeenCalledWith(expect.objectContaining({
            assignmentId: ASSIGNMENT,
            studentId: STUDENT,
            key: confirmDto.key,
            originalName: confirmDto.originalName,
            resubmitAllowed: false,
        }));
        expect(result).toMatchObject({
            id: 'created-submission',
            assignmentId: ASSIGNMENT,
            studentId: STUDENT,
            size: 1024,
            resubmitAllowed: false,
            late: false,
        });
        expect(result.submittedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('ATV-09 converte colisão concorrente da entrega única em conflito controlado', async () => {
        const { service, submissionRepository, r2Service } = buildService();
        submissionRepository.save.mockRejectedValueOnce({ driverError: { code: '23505' } });

        await expect(service.confirmSubmission(ASSIGNMENT, confirmDto, STUDENT))
            .rejects.toBeInstanceOf(ConflictException);
        expect(r2Service.deleteObject).not.toHaveBeenCalled();
    });

    it('ATV-09 não apaga chave não vinculada quando a primeira persistência falha', async () => {
        const { service, submissionRepository, r2Service } = buildService();
        submissionRepository.save.mockRejectedValueOnce(new Error('database unavailable'));

        await expect(service.confirmSubmission(ASSIGNMENT, confirmDto, STUDENT))
            .rejects.toThrow('database unavailable');
        expect(r2Service.deleteObject).not.toHaveBeenCalled();
    });

    it('ATV-12 reenvio autorizado persiste o novo arquivo, volta a false e só depois apaga o anterior', async () => {
        const old = submission({ resubmitAllowed: true });
        const { service, submissionRepository, r2Service } = buildService({ existingSubmission: old });

        const result = await service.confirmSubmission(ASSIGNMENT, confirmDto, STUDENT);

        expect(result).toMatchObject({
            id: old.id,
            originalName: confirmDto.originalName,
            resubmitAllowed: false,
        });
        expect(r2Service.deleteObject).toHaveBeenCalledWith('old/resposta.pdf');
        expect(submissionRepository.save.mock.invocationCallOrder[0])
            .toBeLessThan(r2Service.deleteObject.mock.invocationCallOrder[0]);
    });

    it('ATV-12 mantém o objeto anterior quando a persistência do reenvio falha', async () => {
        const old = submission({ resubmitAllowed: true });
        const { service, submissionRepository, r2Service } = buildService({ existingSubmission: old });
        submissionRepository.save.mockRejectedValueOnce(new Error('database unavailable'));

        await expect(service.confirmSubmission(ASSIGNMENT, confirmDto, STUDENT))
            .rejects.toThrow('database unavailable');
        expect(r2Service.deleteObject).not.toHaveBeenCalled();
    });

    it('notificação por e-mail é best-effort e não altera o resultado salvo', async () => {
        const { service, mailService } = buildService();
        mailService.sendSubmissionEmail.mockRejectedValueOnce(new Error('mail unavailable'));

        await expect(service.confirmSubmission(ASSIGNMENT, confirmDto, STUDENT))
            .resolves.toMatchObject({ id: 'created-submission' });
    });
});

describe('AssignmentsService - consulta e download de entregas', () => {
    it('ATV-13 aluno consulta somente a entrega identificada pelo próprio ID', async () => {
        const own = submission();
        const { service, submissionRepository } = buildService({ existingSubmission: own });

        await expect(service.getMySubmission(ASSIGNMENT, STUDENT))
            .resolves.toMatchObject({ id: own.id, studentId: STUDENT });
        expect(submissionRepository.findOne).toHaveBeenCalledWith({
            where: { assignmentId: ASSIGNMENT, studentId: STUDENT },
        });
    });

    it('ATV-14 professor vê alunos que entregaram, pendentes e ex-aluno que entregou', async () => {
        const formerSubmission = submission({ studentId: FORMER_STUDENT });
        const { service } = buildService({
            existingSubmission: formerSubmission,
            roster: [student()],
        });

        const result = await service.listSubmissions(ASSIGNMENT, TEACHER);

        expect(result).toMatchObject({
            totalStudents: 1,
            submittedCount: 1,
            notSubmittedCount: 1,
            submitted: [expect.objectContaining({
                studentId: FORMER_STUDENT,
                username: 'ex-aluno',
            })],
            notSubmitted: [expect.objectContaining({ studentId: STUDENT })],
        });
    });

    it.each([TEACHER, STUDENT])('ATV-14 permite download ao professor ou autor: %s', async userId => {
        const own = submission();
        const { service } = buildService({ existingSubmission: own });
        await expect(service.getSubmissionDownloadUrl(ASSIGNMENT, own.id, userId))
            .resolves.toBe('https://r2.test/download');
    });

    it('ATV-15 impede terceiro de baixar a entrega', async () => {
        const own = submission();
        const { service, r2Service } = buildService({ existingSubmission: own });

        await expect(service.getSubmissionDownloadUrl(ASSIGNMENT, own.id, OTHER))
            .rejects.toBeInstanceOf(ForbiddenException);
        expect(r2Service.getPresignedDownloadUrl).not.toHaveBeenCalled();
    });
});

describe('AssignmentsService.allowResubmit()', () => {
    it('ATV-11 professor proprietário libera exatamente a entrega do aluno', async () => {
        const own = submission();
        const { service, submissionRepository } = buildService({ existingSubmission: own });

        const result = await service.allowResubmit(ASSIGNMENT, STUDENT, TEACHER);

        expect(result.resubmitAllowed).toBe(true);
        expect(submissionRepository.save).toHaveBeenCalledWith(own);
    });

    it('ATV-11 outro professor não libera reenvio', async () => {
        const { service } = buildService({ existingSubmission: submission() });
        await expect(service.allowResubmit(ASSIGNMENT, STUDENT, OTHER))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ATV-11 não libera aluno que ainda não entregou', async () => {
        const { service } = buildService();
        await expect(service.allowResubmit(ASSIGNMENT, STUDENT, TEACHER))
            .rejects.toBeInstanceOf(NotFoundException);
    });
});
