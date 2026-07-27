import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ClassroomMemberStatusEnum } from 'src/common/enums/classroom-member-status.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { AssignmentEntity } from 'src/db/entities/assignment.entity';
import { AssignmentSubmissionEntity } from 'src/db/entities/assignment-submission.entity';
import { ClassroomSubjectEntity } from 'src/db/entities/classroom-subject.entity';
import { FileEntity } from 'src/db/entities/file.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { SubjectDto, UpdateSubjectDto } from './subject.dto';
import { SubjectService } from './subject.service';

const TEACHER = 'teacher-id';
const OTHER = 'other-id';
const STUDENT = 'student-id';
const SUBJECT = 'subject-id';

function subject(overrides: Partial<SubjectEntity> = {}): SubjectEntity {
    return {
        id: SUBJECT,
        name: 'Algoritmos',
        description: 'Lógica e estruturas',
        teacherId: TEACHER,
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as SubjectEntity;
}

function user(overrides: Partial<UserEntity> = {}): UserEntity {
    return {
        id: TEACHER,
        username: 'professor',
        email: 'professor@ifpi.edu.br',
        password: 'hash',
        role: UserRoleEnum.TEACHER,
        emailVerified: true,
        ...overrides,
    } as UserEntity;
}

function buildQueryBuilder(result: SubjectEntity[] = [], total = result.length) {
    return {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        distinct: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => result),
        getManyAndCount: jest.fn(async () => [result, total] as [SubjectEntity[], number]),
    };
}

function buildService({
    subjects = [subject()],
    users = [user()],
    files = [] as FileEntity[],
    assignments = [] as AssignmentEntity[],
    submissions = [] as AssignmentSubmissionEntity[],
    memberAccess = true,
}: {
    subjects?: SubjectEntity[];
    users?: UserEntity[];
    files?: FileEntity[];
    assignments?: AssignmentEntity[];
    submissions?: AssignmentSubmissionEntity[];
    memberAccess?: boolean;
} = {}) {
    const qb = buildQueryBuilder(subjects);
    const subjectRepository = {
        findOne: jest.fn(async ({ where }: { where: { id: string; teacherId?: string } }) =>
            subjects.find(item =>
                item.id === where.id && (!where.teacherId || item.teacherId === where.teacherId),
            ) ?? null,
        ),
        find: jest.fn(async () => subjects),
        save: jest.fn(async (item: SubjectEntity) => {
            if (!item.id) item.id = 'created-subject';
            return item;
        }),
        createQueryBuilder: jest.fn(() => qb),
        delete: jest.fn(async () => ({ affected: 1 })),
    };
    const userRepository = {
        findOne: jest.fn(async ({ where }: { where: { id: string; role?: UserRoleEnum } }) =>
            users.find(item => item.id === where.id && (!where.role || item.role === where.role)) ?? null,
        ),
    };
    const fileRepository = {
        find: jest.fn(async () => files),
        delete: jest.fn(async () => ({ affected: files.length })),
    };
    const assignmentRepository = {
        find: jest.fn(async () => assignments),
        delete: jest.fn(async () => ({ affected: assignments.length })),
    };
    const submissionRepository = {
        find: jest.fn(async () => submissions),
        delete: jest.fn(async () => ({ affected: submissions.length })),
    };
    const classroomSubjectRepository = {
        delete: jest.fn(async () => ({ affected: 1 })),
    };
    const classroomService = {
        isSubjectAccessibleToMember: jest.fn(async () => memberAccess),
    };
    const r2Service = {
        deleteObject: jest.fn(async () => undefined),
    };
    const storageCleanupService = {
        enqueue: jest.fn(async () => undefined),
        processKeys: jest.fn(async (keys: string[]) => {
            await Promise.all(keys.map(key => r2Service.deleteObject(key).catch(() => {})));
            return { processed: keys.length, failed: 0 };
        }),
    };

    const repoByEntity = new Map<unknown, unknown>([
        [SubjectEntity, subjectRepository],
        [FileEntity, fileRepository],
        [AssignmentEntity, assignmentRepository],
        [AssignmentSubmissionEntity, submissionRepository],
        [ClassroomSubjectEntity, classroomSubjectRepository],
    ]);
    const manager = {
        getRepository: jest.fn((entity: unknown) => repoByEntity.get(entity)),
    };
    const dataSource = {
        transaction: jest.fn(async (callback: (entityManager: typeof manager) => Promise<unknown>) =>
            callback(manager),
        ),
    };

    const service = new SubjectService(
        subjectRepository as never,
        userRepository as never,
        fileRepository as never,
        assignmentRepository as never,
        submissionRepository as never,
        classroomSubjectRepository as never,
        classroomService as never,
        storageCleanupService as never,
        dataSource as never,
    );

    return {
        service,
        qb,
        subjectRepository,
        userRepository,
        fileRepository,
        assignmentRepository,
        submissionRepository,
        classroomSubjectRepository,
        classroomService,
        r2Service,
        storageCleanupService,
        dataSource,
    };
}

describe('DTOs de disciplina', () => {
    it('SUB-01 aceita criação privada por padrão e visibilidade booleana', async () => {
        const dto = plainToInstance(SubjectDto, { name: 'Algoritmos', isPublic: false });
        await expect(validate(dto)).resolves.toEqual([]);
    });

    it('SUB-01 rejeita visibilidade textual', async () => {
        const dto = plainToInstance(SubjectDto, { name: 'Algoritmos', isPublic: 'true' });
        const errors = await validate(dto);
        expect(errors.find(item => item.property === 'isPublic')?.constraints?.isBoolean).toBeDefined();
    });

    it('SUB-06 UpdateSubjectDto valida somente campos editáveis', async () => {
        const dto = plainToInstance(UpdateSubjectDto, { isPublic: 'false', teacherId: OTHER });
        const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

        expect(errors.map(item => item.property)).toEqual(expect.arrayContaining(['isPublic', 'teacherId']));
    });
});

describe('SubjectService - criação, listagem e edição', () => {
    it('SUB-01 cria disciplina normalizada e privada por padrão', async () => {
        const { service } = buildService({ subjects: [] });

        const result = await service.create({
            name: '  Banco de Dados  ',
            description: '  Modelagem relacional  ',
        }, TEACHER);

        expect(result).toMatchObject({
            id: 'created-subject',
            name: 'Banco de Dados',
            description: 'Modelagem relacional',
            teacherId: TEACHER,
            isPublic: false,
        });
    });

    it('SUB-01 recusa usuário que não é professor', async () => {
        const student = user({ id: STUDENT, role: UserRoleEnum.STUDENT });
        const { service } = buildService({ subjects: [], users: [student] });

        await expect(service.create({ name: 'Algoritmos' }, STUDENT))
            .rejects.toBeInstanceOf(NotFoundException);
    });

    it('SUB-01 recusa nome composto apenas por espaços no service', async () => {
        const { service } = buildService({ subjects: [] });
        await expect(service.create({ name: '   ' }, TEACHER))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('SUB-03 aplica propriedade, busca normalizada, ordenação e paginação', async () => {
        const item = subject();
        const { service, qb } = buildService({ subjects: [item] });

        const result = await service.findAll(TEACHER, { page: 2, limit: 5, search: '  algo  ' });

        expect(qb.where).toHaveBeenCalledWith('subject.teacherId = :teacherId', { teacherId: TEACHER });
        expect(qb.andWhere).toHaveBeenCalledWith('subject.name ILIKE :search', { search: '%algo%' });
        expect(qb.orderBy).toHaveBeenCalledWith('subject.name', 'ASC');
        expect(qb.skip).toHaveBeenCalledWith(5);
        expect(qb.take).toHaveBeenCalledWith(5);
        expect(result.meta).toMatchObject({ page: 2, limit: 5, total: 1, hasPrevPage: true });
    });

    it('SUB-02 findByTeacherId mostra privadas apenas ao proprietário', async () => {
        const { service, subjectRepository } = buildService();

        await service.findByTeacherId(TEACHER, true);
        expect(subjectRepository.find).toHaveBeenLastCalledWith({ where: { teacherId: TEACHER } });

        await service.findByTeacherId(TEACHER, false);
        expect(subjectRepository.find).toHaveBeenLastCalledWith({
            where: { teacherId: TEACHER, isPublic: true },
        });
    });

    it('SUB-02 atualiza somente disciplina própria e permite limpar descrição', async () => {
        const item = subject();
        const { service } = buildService({ subjects: [item] });

        const result = await service.update(SUBJECT, {
            name: '  Algoritmos II  ',
            description: '   ',
            isPublic: true,
        }, TEACHER);

        expect(result).toMatchObject({
            name: 'Algoritmos II',
            description: null,
            isPublic: true,
            teacherId: TEACHER,
        });
    });

    it('SUB-02 oculta disciplina alheia como não encontrada', async () => {
        const { service } = buildService();
        await expect(service.update(SUBJECT, { name: 'Ataque' }, OTHER))
            .rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('SubjectService - visibilidade', () => {
    it('SUB-04 proprietário acessa disciplina privada sem consultar vínculo', async () => {
        const { service, classroomService } = buildService({ memberAccess: false });

        await expect(service.findOneForViewer(SUBJECT, TEACHER)).resolves.toMatchObject({
            id: SUBJECT,
            teacherUsername: 'professor',
        });
        expect(classroomService.isSubjectAccessibleToMember).not.toHaveBeenCalled();
    });

    it('SUB-04 qualquer usuário autenticado acessa disciplina pública', async () => {
        const { service, classroomService } = buildService({
            subjects: [subject({ isPublic: true })],
            memberAccess: false,
        });

        await expect(service.findOneForViewer(SUBJECT, OTHER)).resolves.toMatchObject({ isPublic: true });
        expect(classroomService.isSubjectAccessibleToMember).not.toHaveBeenCalled();
    });

    it('SUB-04 aluno ativo acessa disciplina privada vinculada', async () => {
        const { service } = buildService({ memberAccess: true });
        await expect(service.findOneForViewer(SUBJECT, STUDENT)).resolves.toMatchObject({ id: SUBJECT });
    });

    it('SUB-05 usuário sem vínculo não acessa disciplina privada', async () => {
        const { service } = buildService({ memberAccess: false });
        await expect(service.findOneForViewer(SUBJECT, OTHER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('USR-04 perfil do aluno filtra por públicas ou vínculo ACTIVE', async () => {
        const { service, qb } = buildService();

        await service.findVisibleInTeacherProfile(
            TEACHER,
            { userId: STUDENT, role: UserRoleEnum.STUDENT },
            false,
        );

        expect(qb.leftJoin).toHaveBeenCalledWith(
            'classroom_subjects',
            'cs',
            'cs.subjectId = subject.id',
        );
        expect(qb.leftJoin).toHaveBeenCalledWith(
            'classroom_members',
            'member',
            expect.stringContaining('member.status = :status'),
            { studentId: STUDENT, status: ClassroomMemberStatusEnum.ACTIVE },
        );
        expect(qb.andWhere).toHaveBeenCalledWith('(subject.isPublic = true OR member.id IS NOT NULL)');
    });

    it('USR-05 outro visitante do perfil recebe somente disciplinas públicas', async () => {
        const { service, qb } = buildService();

        await service.findVisibleInTeacherProfile(
            TEACHER,
            { userId: OTHER, role: UserRoleEnum.TEACHER },
            false,
        );

        expect(qb.andWhere).toHaveBeenCalledWith('subject.isPublic = true');
        expect(qb.leftJoin).not.toHaveBeenCalled();
    });
});

describe('SubjectService.remove() - consistência', () => {
    const file = { id: 'file-id', subjectId: SUBJECT, key: 'files/material.pdf' } as FileEntity;
    const work = {
        id: 'assignment-id',
        subjectId: SUBJECT,
        attachmentKey: 'assignments/enunciado.pdf',
    } as AssignmentEntity;
    const delivery = {
        id: 'submission-id',
        assignmentId: work.id,
        key: 'submissions/resposta.pdf',
    } as AssignmentSubmissionEntity;

    it('SUB-08 remove dependências em transação e depois limpa somente chaves persistidas', async () => {
        const {
            service,
            fileRepository,
            assignmentRepository,
            submissionRepository,
            classroomSubjectRepository,
            subjectRepository,
            r2Service,
        } = buildService({ files: [file], assignments: [work], submissions: [delivery] });

        await service.remove(SUBJECT, TEACHER);

        expect(submissionRepository.delete).toHaveBeenCalled();
        expect(assignmentRepository.delete).toHaveBeenCalledWith({ subjectId: SUBJECT });
        expect(classroomSubjectRepository.delete).toHaveBeenCalledWith({ subjectId: SUBJECT });
        expect(fileRepository.delete).toHaveBeenCalledWith({ subjectId: SUBJECT });
        expect(subjectRepository.delete).toHaveBeenCalledWith({ id: SUBJECT, teacherId: TEACHER });
        expect(r2Service.deleteObject).toHaveBeenCalledWith(file.key);
        expect(r2Service.deleteObject).toHaveBeenCalledWith(work.attachmentKey);
        expect(r2Service.deleteObject).toHaveBeenCalledWith(delivery.key);
        expect(subjectRepository.delete.mock.invocationCallOrder[0])
            .toBeLessThan(r2Service.deleteObject.mock.invocationCallOrder[0]);
    });

    it('SUB-08 inclui arquivos desabilitados na limpeza', async () => {
        const { service, fileRepository } = buildService({
            files: [{ ...file, deletedAt: new Date() } as FileEntity],
        });

        await service.remove(SUBJECT, TEACHER);

        expect(fileRepository.find).toHaveBeenCalledWith({
            where: { subjectId: SUBJECT },
            withDeleted: true,
        });
    });

    it('SUB-08 não apaga objetos quando a transação falha', async () => {
        const { service, dataSource, r2Service } = buildService({
            files: [file],
            assignments: [work],
            submissions: [delivery],
        });
        dataSource.transaction.mockRejectedValueOnce(new Error('database unavailable'));

        await expect(service.remove(SUBJECT, TEACHER)).rejects.toThrow('database unavailable');
        expect(r2Service.deleteObject).not.toHaveBeenCalled();
    });

    it('SUB-08 falha do R2 após o commit não restaura metadados já excluídos', async () => {
        const { service, dataSource, r2Service } = buildService({ files: [file] });
        r2Service.deleteObject.mockRejectedValueOnce(new Error('R2 unavailable'));

        await expect(service.remove(SUBJECT, TEACHER)).resolves.toBeUndefined();
        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('SUB-02 outro professor não inicia limpeza da disciplina', async () => {
        const { service, dataSource, r2Service } = buildService({ files: [file] });

        await expect(service.remove(SUBJECT, OTHER)).rejects.toBeInstanceOf(NotFoundException);
        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(r2Service.deleteObject).not.toHaveBeenCalled();
    });
});
