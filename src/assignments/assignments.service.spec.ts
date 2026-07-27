import {
    BadRequestException,
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
const SUBJECT = 'subject-id';
const ASSIGNMENT = 'assignment-id';

function subject(overrides: Partial<SubjectEntity> = {}): SubjectEntity {
    return {
        id: SUBJECT,
        name: 'Algoritmos',
        description: null,
        teacherId: TEACHER,
        isPublic: false,
        ...overrides,
    } as SubjectEntity;
}

function assignment(overrides: Partial<AssignmentEntity> = {}): AssignmentEntity {
    return {
        id: ASSIGNMENT,
        subjectId: SUBJECT,
        teacherId: TEACHER,
        title: 'Lista de exercícios',
        description: 'Resolva as questões.',
        dueDate: new Date(Date.now() + 3 * 86_400_000),
        attachmentKey: null,
        attachmentName: null,
        attachmentMimeType: null,
        attachmentSize: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as AssignmentEntity;
}

function submission(overrides: Partial<AssignmentSubmissionEntity> = {}): AssignmentSubmissionEntity {
    return {
        id: 'submission-id',
        assignmentId: ASSIGNMENT,
        studentId: STUDENT,
        key: 'submissions/resposta.pdf',
        originalName: 'resposta.pdf',
        mimeType: 'application/pdf',
        size: 100,
        resubmitAllowed: false,
        submittedAt: new Date(),
        ...overrides,
    } as AssignmentSubmissionEntity;
}

function buildService({
    assignments = [assignment()],
    subjects = [subject()],
    submissions = [] as AssignmentSubmissionEntity[],
    memberAccess = true,
    activeStudents = [] as UserEntity[],
}: {
    assignments?: AssignmentEntity[];
    subjects?: SubjectEntity[];
    submissions?: AssignmentSubmissionEntity[];
    memberAccess?: boolean;
    activeStudents?: UserEntity[];
} = {}) {
    const assignmentRepository = {
        findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
            assignments.find(item => item.id === where.id) ?? null,
        ),
        find: jest.fn(async ({ where }: { where: { subjectId: string } }) =>
            assignments.filter(item => item.subjectId === where.subjectId),
        ),
        save: jest.fn(async (item: AssignmentEntity) => {
            if (!item.id) item.id = 'created-assignment';
            return item;
        }),
        delete: jest.fn(async () => ({ affected: 1 })),
    };

    const submissionRepository = {
        findOne: jest.fn(async ({ where }: { where: { id?: string; assignmentId?: string; studentId?: string } }) =>
            submissions.find(item =>
                (!where.id || item.id === where.id) &&
                (!where.assignmentId || item.assignmentId === where.assignmentId) &&
                (!where.studentId || item.studentId === where.studentId),
            ) ?? null,
        ),
        find: jest.fn(async () => submissions),
        save: jest.fn(async (item: AssignmentSubmissionEntity) => item),
        createQueryBuilder: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            groupBy: jest.fn().mockReturnThis(),
            getRawMany: jest.fn(async () => []),
        })),
    };

    const subjectRepository = {
        findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
            subjects.find(item => item.id === where.id) ?? null,
        ),
    };

    const userRepository = {
        findOne: jest.fn(async () => null),
        find: jest.fn(async () => []),
    };

    const r2Service = {
        buildKey: jest.fn(() => 'assignments/generated-key'),
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
        sendNewAssignmentEmail: jest.fn(async () => undefined),
        sendSubmissionEmail: jest.fn(async () => undefined),
    };

    const classroomService = {
        isSubjectAccessibleToMember: jest.fn(async () => memberAccess),
        getActiveStudentsForSubject: jest.fn(async () => activeStudents),
    };
    const dataSource = {
        transaction: jest.fn(async (callback: (manager: {
            getRepository: () => typeof assignmentRepository;
        }) => Promise<unknown>) => callback({
            getRepository: () => assignmentRepository,
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
        subjectRepository,
        r2Service,
        storageCleanupService,
        mailService,
        classroomService,
        dataSource,
    };
}

describe('AssignmentsService - criação e prazo', () => {
    afterEach(() => jest.useRealTimers());

    it('ATV-01 cria trabalho somente na disciplina do professor e normaliza textos', async () => {
        const { service, assignmentRepository } = buildService({ assignments: [] });
        const dueDate = new Date(Date.now() + 3 * 86_400_000).toISOString();

        const result = await service.create({
            subjectId: SUBJECT,
            title: '  Projeto final  ',
            description: '  Entregar relatório  ',
            dueDate,
        }, TEACHER);

        expect(result).toMatchObject({
            id: 'created-assignment',
            subjectId: SUBJECT,
            teacherId: TEACHER,
            title: 'Projeto final',
            description: 'Entregar relatório',
        });
        expect(assignmentRepository.save).toHaveBeenCalledTimes(1);
    });

    it('ATV-01 rejeita disciplina inexistente ou pertencente a outro professor', async () => {
        const missing = buildService({ subjects: [] });
        const otherOwner = buildService({ subjects: [subject({ teacherId: OTHER })] });
        const dto = {
            subjectId: SUBJECT,
            title: 'Projeto',
            dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        };

        await expect(missing.service.create(dto, TEACHER)).rejects.toBeInstanceOf(NotFoundException);
        await expect(otherOwner.service.create(dto, TEACHER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ATV-02 rejeita data inválida e prazo anterior ao início de amanhã', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00Z'));
        const { service } = buildService({ assignments: [] });
        const base = { subjectId: SUBJECT, title: 'Projeto' };

        await expect(service.create({ ...base, dueDate: 'invalida' }, TEACHER))
            .rejects.toMatchObject({ message: 'Data limite inválida' });
        await expect(service.create({ ...base, dueDate: '2026-07-25T23:59:59Z' }, TEACHER))
            .rejects.toBeInstanceOf(BadRequestException);
        await expect(service.create({ ...base, dueDate: '2026-07-26T23:59:59Z' }, TEACHER))
            .resolves.toBeDefined();
    });

    it('ATV-03 persiste os metadados do anexo informado', async () => {
        const { service } = buildService({ assignments: [] });

        const result = await service.create({
            subjectId: SUBJECT,
            title: 'Projeto',
            dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
            attachment: {
                uploadProof: 'signed-upload-proof',
                attachmentKey: 'assignments/enunciado.pdf',
                attachmentName: 'enunciado.pdf',
                attachmentMimeType: 'application/pdf',
                attachmentSize: 2048,
            },
        }, TEACHER);

        expect(result).toMatchObject({
            attachmentKey: 'assignments/enunciado.pdf',
            attachmentName: 'enunciado.pdf',
            attachmentMimeType: 'application/pdf',
            attachmentSize: 2048,
        });
    });

    it('ATV-03 não tenta apagar uma chave ainda não vinculada se a criação falhar', async () => {
        const { service, assignmentRepository, r2Service } = buildService({ assignments: [] });
        assignmentRepository.save.mockRejectedValueOnce(new Error('database unavailable'));

        await expect(service.create({
            subjectId: SUBJECT,
            title: 'Projeto',
            dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
            attachment: {
                uploadProof: 'signed-upload-proof',
                attachmentKey: 'assignments/enunciado.pdf',
                attachmentName: 'enunciado.pdf',
                attachmentMimeType: 'application/pdf',
                attachmentSize: 2048,
            },
        }, TEACHER)).rejects.toThrow('database unavailable');

        expect(r2Service.deleteObject).not.toHaveBeenCalled();
    });

    it('ATV-03 gera URL de upload usando nome, tipo e tamanho assinados', async () => {
        const { service, r2Service } = buildService();

        await expect(service.requestAttachmentUploadUrl({
            subjectId: SUBJECT,
            filename: 'enunciado.pdf',
            contentType: 'application/pdf',
            size: 2048,
        }, TEACHER)).resolves.toEqual({
            uploadUrl: 'https://r2.test/upload',
            key: 'assignments/generated-key',
            uploadProof: 'signed-upload-proof',
        });
        expect(r2Service.getPresignedUploadUrl).toHaveBeenCalledWith(
            'assignments/generated-key',
            'application/pdf',
            2048,
        );
        expect(r2Service.createUploadProof).toHaveBeenCalledWith({
            userId: TEACHER,
            purpose: 'assignment-attachment',
            scopeId: SUBJECT,
            key: 'assignments/generated-key',
            filename: 'enunciado.pdf',
            contentType: 'application/pdf',
            size: 2048,
        });
    });

    it('FIL-06 não cria atividade quando a prova do anexo é inválida', async () => {
        const { service, assignmentRepository, r2Service } = buildService({ assignments: [] });
        r2Service.verifyUploadedObject.mockRejectedValueOnce(
            new BadRequestException('A confirmação não corresponde ao upload solicitado'),
        );

        await expect(service.create({
            subjectId: SUBJECT,
            title: 'Projeto',
            dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
            attachment: {
                uploadProof: 'proof-from-other-upload',
                attachmentKey: 'assignments/enunciado.pdf',
                attachmentName: 'enunciado.pdf',
                attachmentMimeType: 'application/pdf',
                attachmentSize: 2048,
            },
        }, TEACHER)).rejects.toBeInstanceOf(BadRequestException);
        expect(assignmentRepository.save).not.toHaveBeenCalled();
    });
});

describe('AssignmentsService - leitura e autorização', () => {
    it('ATV-04 permite o professor proprietário', async () => {
        const { service, classroomService } = buildService({ memberAccess: false });

        const result = await service.findOne(ASSIGNMENT, TEACHER);

        expect(result).toMatchObject({ id: ASSIGNMENT, isOwner: true, subjectName: 'Algoritmos' });
        expect(classroomService.isSubjectAccessibleToMember).not.toHaveBeenCalled();
    });

    it('ATV-04 permite aluno ativo em disciplina privada', async () => {
        const { service } = buildService({ memberAccess: true });

        await expect(service.findOne(ASSIGNMENT, STUDENT)).resolves.toMatchObject({
            id: ASSIGNMENT,
            isOwner: false,
            canSubmit: true,
        });
    });

    it('ATV-04 nega disciplina privada a usuário sem vínculo', async () => {
        const { service } = buildService({ memberAccess: false });
        await expect(service.findOne(ASSIGNMENT, OTHER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ATV-05 permite ler atividade pública sem vínculo, mas não oferece entrega', async () => {
        const { service } = buildService({
            subjects: [subject({ isPublic: true })],
            memberAccess: false,
        });

        await expect(service.findOne(ASSIGNMENT, STUDENT)).resolves.toMatchObject({
            id: ASSIGNMENT,
            isOwner: false,
            canSubmit: false,
        });
    });

    it('ATV-04 não oferece entrega depois do prazo', async () => {
        const expired = assignment({ dueDate: new Date(Date.now() - 1) });
        const { service } = buildService({ assignments: [expired], memberAccess: true });

        await expect(service.findOne(ASSIGNMENT, STUDENT)).resolves.toMatchObject({
            canSubmit: false,
        });
    });

    it('ATV-04 lista contadores de entrega para o professor', async () => {
        const first = assignment();
        const second = assignment({ id: 'assignment-2' });
        const student = { id: STUDENT } as UserEntity;
        const { service, submissionRepository } = buildService({
            assignments: [first, second],
            activeStudents: [student, { id: 'student-2' } as UserEntity],
        });
        const qb = submissionRepository.createQueryBuilder();
        qb.getRawMany.mockResolvedValue([{ assignmentId: ASSIGNMENT, count: '1' }]);
        submissionRepository.createQueryBuilder.mockReturnValue(qb);

        const result = await service.listBySubject(SUBJECT, TEACHER);

        expect(result).toEqual([
            expect.objectContaining({ id: ASSIGNMENT, submissionsCount: 1, totalStudents: 2 }),
            expect.objectContaining({ id: 'assignment-2', submissionsCount: 0, totalStudents: 2 }),
        ]);
    });

    it('ATV-04 lista o estado da própria entrega para o aluno', async () => {
        const sub = submission({ resubmitAllowed: true });
        const { service, submissionRepository } = buildService({ submissions: [sub] });
        submissionRepository.find.mockResolvedValue([sub]);

        const result = await service.listBySubject(SUBJECT, STUDENT);

        expect(result).toEqual([
            expect.objectContaining({
                id: ASSIGNMENT,
                submitted: true,
                canSubmit: true,
                mySubmission: expect.objectContaining({ id: sub.id, resubmitAllowed: true }),
            }),
        ]);
    });

    it('ATV-05 lista trabalho público para não membro sem sugerir que pode entregar', async () => {
        const { service } = buildService({
            subjects: [subject({ isPublic: true })],
            memberAccess: false,
        });

        await expect(service.listBySubject(SUBJECT, STUDENT)).resolves.toEqual([
            expect.objectContaining({ id: ASSIGNMENT, canSubmit: false }),
        ]);
    });
});

describe('AssignmentsService - edição, exclusão e anexo', () => {
    afterEach(() => jest.useRealTimers());

    it('ATV-06 somente o proprietário edita ou exclui', async () => {
        const updateCase = buildService();
        const removeCase = buildService();

        await expect(updateCase.service.update(ASSIGNMENT, { title: 'Outro' }, OTHER))
            .rejects.toBeInstanceOf(ForbiddenException);
        await expect(removeCase.service.remove(ASSIGNMENT, OTHER))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ATV-02 permite editar outros campos de trabalho vencido sem mudar o dia do prazo', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00Z'));
        const old = assignment({ dueDate: new Date('2026-07-20T23:59:59Z') });
        const { service } = buildService({ assignments: [old] });

        const result = await service.update(ASSIGNMENT, {
            title: '  Título corrigido  ',
            dueDate: '2026-07-20T20:00:00Z',
        }, TEACHER);

        expect(result.title).toBe('Título corrigido');
        expect(result.dueDate.toISOString()).toBe('2026-07-20T20:00:00.000Z');
    });

    it('ATV-07 substitui o anexo no banco antes de apagar o objeto antigo', async () => {
        const current = assignment({ attachmentKey: 'old/key.pdf' });
        const { service, assignmentRepository, r2Service } = buildService({ assignments: [current] });

        await service.update(ASSIGNMENT, {
            attachment: {
                uploadProof: 'signed-upload-proof',
                attachmentKey: 'new/key.pdf',
                attachmentName: 'novo.pdf',
                attachmentMimeType: 'application/pdf',
                attachmentSize: 200,
            },
        }, TEACHER);

        expect(assignmentRepository.save).toHaveBeenCalled();
        expect(r2Service.deleteObject).toHaveBeenCalledWith('old/key.pdf');
        expect(assignmentRepository.save.mock.invocationCallOrder[0])
            .toBeLessThan(r2Service.deleteObject.mock.invocationCallOrder[0]);
    });

    it('ATV-07 não apaga o anexo antigo quando a persistência da substituição falha', async () => {
        const current = assignment({ attachmentKey: 'old/key.pdf' });
        const { service, assignmentRepository, r2Service } = buildService({ assignments: [current] });
        assignmentRepository.save.mockRejectedValueOnce(new Error('database unavailable'));

        await expect(service.update(ASSIGNMENT, {
            attachment: {
                uploadProof: 'signed-upload-proof',
                attachmentKey: 'new/key.pdf',
                attachmentName: 'novo.pdf',
                attachmentMimeType: 'application/pdf',
                attachmentSize: 200,
            },
        }, TEACHER)).rejects.toThrow('database unavailable');

        expect(r2Service.deleteObject).not.toHaveBeenCalled();
    });

    it('ATV-07 não apaga o objeto quando a edição mantém a mesma chave', async () => {
        const current = assignment({ attachmentKey: 'same/key.pdf' });
        const { service, r2Service } = buildService({ assignments: [current] });

        await service.update(ASSIGNMENT, {
            attachment: {
                uploadProof: 'signed-upload-proof',
                attachmentKey: 'same/key.pdf',
                attachmentName: 'renomeado.pdf',
                attachmentMimeType: 'application/pdf',
                attachmentSize: 200,
            },
        }, TEACHER);

        expect(r2Service.deleteObject).not.toHaveBeenCalled();
    });

    it('ATV-07 remove metadados do anexo e apaga o objeto antigo após persistir', async () => {
        const current = assignment({ attachmentKey: 'old/key.pdf', attachmentName: 'antigo.pdf' });
        const { service, assignmentRepository, r2Service } = buildService({ assignments: [current] });

        const result = await service.update(ASSIGNMENT, { removeAttachment: true }, TEACHER);

        expect(result.attachmentKey).toBeNull();
        expect(assignmentRepository.save.mock.invocationCallOrder[0])
            .toBeLessThan(r2Service.deleteObject.mock.invocationCallOrder[0]);
    });

    it('ATV-07 exclui metadados, anexo e arquivos das entregas', async () => {
        const current = assignment({ attachmentKey: 'attachment/key.pdf' });
        const sub = submission({ key: 'submission/key.pdf' });
        const { service, assignmentRepository, r2Service } = buildService({
            assignments: [current],
            submissions: [sub],
        });

        await service.remove(ASSIGNMENT, TEACHER);

        expect(r2Service.deleteObject).toHaveBeenCalledWith('attachment/key.pdf');
        expect(r2Service.deleteObject).toHaveBeenCalledWith('submission/key.pdf');
        expect(assignmentRepository.delete).toHaveBeenCalledWith(ASSIGNMENT);
        expect(assignmentRepository.delete.mock.invocationCallOrder[0])
            .toBeLessThan(r2Service.deleteObject.mock.invocationCallOrder[0]);
    });

    it('ATV-07 não apaga objetos quando a exclusão falha no banco', async () => {
        const current = assignment({ attachmentKey: 'attachment/key.pdf' });
        const { service, assignmentRepository, r2Service } = buildService({
            assignments: [current],
            submissions: [submission()],
        });
        assignmentRepository.delete.mockRejectedValueOnce(new Error('database unavailable'));

        await expect(service.remove(ASSIGNMENT, TEACHER)).rejects.toThrow('database unavailable');
        expect(r2Service.deleteObject).not.toHaveBeenCalled();
    });

    it('ATV-03 baixa anexo somente para quem pode visualizar a disciplina', async () => {
        const current = assignment({ attachmentKey: 'attachment/key.pdf' });
        const allowed = buildService({ assignments: [current], memberAccess: true });
        const denied = buildService({ assignments: [current], memberAccess: false });

        await expect(allowed.service.getAttachmentDownloadUrl(ASSIGNMENT, STUDENT))
            .resolves.toBe('https://r2.test/download');
        await expect(denied.service.getAttachmentDownloadUrl(ASSIGNMENT, STUDENT))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ATV-03 informa quando o trabalho não possui anexo', async () => {
        const { service } = buildService();
        await expect(service.getAttachmentDownloadUrl(ASSIGNMENT, STUDENT))
            .rejects.toBeInstanceOf(NotFoundException);
    });
});
