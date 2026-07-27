import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ClassroomMemberStatusEnum } from 'src/common/enums/classroom-member-status.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { ClassroomService } from 'src/classroom/classroom.service';
import { AssignmentEntity } from 'src/db/entities/assignment.entity';
import { AssignmentSubmissionEntity } from 'src/db/entities/assignment-submission.entity';
import { ClassroomEntity } from 'src/db/entities/classroom.entity';
import { ClassroomMemberEntity } from 'src/db/entities/classroom-member.entity';
import { ClassroomSubjectEntity } from 'src/db/entities/classroom-subject.entity';
import { FileEntity } from 'src/db/entities/file.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { StorageCleanupEntity } from 'src/db/entities/storage-cleanup.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { R2Service } from 'src/r2/r2.service';
import { StorageCleanupService } from 'src/storage-cleanup/storage-cleanup.service';
import { SubjectService } from './subject.service';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

const TEACHER = '11111111-1111-4111-8111-111111111111';
const ACTIVE_STUDENT = '22222222-2222-4222-8222-222222222222';
const PENDING_STUDENT = '33333333-3333-4333-8333-333333333333';
const OTHER_TEACHER = '44444444-4444-4444-8444-444444444444';
const PUBLIC_SUBJECT = '55555555-5555-4555-8555-555555555555';
const PRIVATE_SUBJECT = '66666666-6666-4666-8666-666666666666';
const CLASSROOM = '77777777-7777-4777-8777-777777777777';
const ASSIGNMENT = '88888888-8888-4888-8888-888888888888';

describeIfDb('SubjectService - integração com PostgreSQL', () => {
    let service: SubjectService;
    let dataSource: DataSource;
    let users: Repository<UserEntity>;
    let subjects: Repository<SubjectEntity>;
    let classrooms: Repository<ClassroomEntity>;
    let classroomSubjects: Repository<ClassroomSubjectEntity>;
    let members: Repository<ClassroomMemberEntity>;
    let files: Repository<FileEntity>;
    let assignments: Repository<AssignmentEntity>;
    let submissions: Repository<AssignmentSubmissionEntity>;
    let cleanupJobs: Repository<StorageCleanupEntity>;
    let storageCleanup: StorageCleanupService;

    const r2 = {
        deleteObject: jest.fn(async () => undefined),
    };
    const classroom = {
        isSubjectAccessibleToMember: jest.fn(async () => false),
    };

    beforeAll(async () => {
        const entities = [
            UserEntity,
            SubjectEntity,
            ClassroomEntity,
            ClassroomSubjectEntity,
            ClassroomMemberEntity,
            FileEntity,
            AssignmentEntity,
            AssignmentSubmissionEntity,
            StorageCleanupEntity,
        ];
        const moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    url: TEST_DATABASE_URL,
                    entities,
                    synchronize: true,
                    dropSchema: true,
                }),
                TypeOrmModule.forFeature(entities),
            ],
            providers: [
                SubjectService,
                StorageCleanupService,
                { provide: ClassroomService, useValue: classroom },
                { provide: R2Service, useValue: r2 },
            ],
        }).compile();

        service = moduleRef.get(SubjectService);
        dataSource = moduleRef.get(DataSource);
        users = moduleRef.get(getRepositoryToken(UserEntity));
        subjects = moduleRef.get(getRepositoryToken(SubjectEntity));
        classrooms = moduleRef.get(getRepositoryToken(ClassroomEntity));
        classroomSubjects = moduleRef.get(getRepositoryToken(ClassroomSubjectEntity));
        members = moduleRef.get(getRepositoryToken(ClassroomMemberEntity));
        files = moduleRef.get(getRepositoryToken(FileEntity));
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
        await files.clear();
        await members.clear();
        await classroomSubjects.clear();
        await classrooms.clear();
        await subjects.clear();
        await users.clear();

        await users.save([
            users.create({
                id: TEACHER,
                username: 'ana',
                email: 'ana@ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.TEACHER,
                emailVerified: true,
            }),
            users.create({
                id: ACTIVE_STUDENT,
                username: 'aluno-ativo',
                email: 'ativo@ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.STUDENT,
                emailVerified: true,
            }),
            users.create({
                id: PENDING_STUDENT,
                username: 'aluno-pendente',
                email: 'pendente@ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.STUDENT,
                emailVerified: true,
            }),
            users.create({
                id: OTHER_TEACHER,
                username: 'bruno',
                email: 'bruno@ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.TEACHER,
                emailVerified: true,
            }),
        ]);
        await subjects.save([
            subjects.create({
                id: PUBLIC_SUBJECT,
                name: 'Algoritmos',
                teacherId: TEACHER,
                isPublic: true,
            }),
            subjects.create({
                id: PRIVATE_SUBJECT,
                name: 'Banco de Dados',
                teacherId: TEACHER,
                isPublic: false,
            }),
        ]);
        await classrooms.save(classrooms.create({
            id: CLASSROOM,
            name: 'ADS 2026',
            teacherId: TEACHER,
        }));
        await classroomSubjects.save(classroomSubjects.create({
            classroomId: CLASSROOM,
            subjectId: PRIVATE_SUBJECT,
        }));
        await members.save([
            members.create({
                classroomId: CLASSROOM,
                studentId: ACTIVE_STUDENT,
                status: ClassroomMemberStatusEnum.ACTIVE,
            }),
            members.create({
                classroomId: CLASSROOM,
                studentId: PENDING_STUDENT,
                status: ClassroomMemberStatusEnum.PENDING,
            }),
        ]);
    });

    const names = async (viewer: { userId: string; role: UserRoleEnum }, isOwner = false) =>
        (await service.findVisibleInTeacherProfile(TEACHER, viewer, isOwner))
            .map(item => item.name)
            .sort();

    it('SUB-04/USR-04 proprietário e aluno ACTIVE veem pública e privada', async () => {
        await expect(names({ userId: TEACHER, role: UserRoleEnum.TEACHER }, true))
            .resolves.toEqual(['Algoritmos', 'Banco de Dados']);
        await expect(names({ userId: ACTIVE_STUDENT, role: UserRoleEnum.STUDENT }))
            .resolves.toEqual(['Algoritmos', 'Banco de Dados']);
    });

    it('SUB-05/USR-05 aluno PENDING e outro professor veem somente pública', async () => {
        await expect(names({ userId: PENDING_STUDENT, role: UserRoleEnum.STUDENT }))
            .resolves.toEqual(['Algoritmos']);
        await expect(names({ userId: OTHER_TEACHER, role: UserRoleEnum.TEACHER }))
            .resolves.toEqual(['Algoritmos']);
    });

    it('SUB-03 busca ILIKE e pagina somente disciplinas do proprietário', async () => {
        const result = await service.findAll(TEACHER, {
            page: 1,
            limit: 1,
            search: 'BANCO',
        });

        expect(result.data.map(item => item.name)).toEqual(['Banco de Dados']);
        expect(result.meta).toMatchObject({
            page: 1,
            limit: 1,
            total: 1,
            totalPages: 1,
        });
    });

    it('SUB-08 remove dependências e limpa todas as chaves R2 após a transação', async () => {
        const activeFile = await files.save(files.create({
            originalName: 'material.pdf',
            key: 'files/material.pdf',
            mimeType: 'application/pdf',
            size: 100,
            subjectId: PRIVATE_SUBJECT,
            uploadedBy: TEACHER,
            isPublic: true,
        }));
        const disabledFile = await files.save(files.create({
            originalName: 'rascunho.pdf',
            key: 'files/rascunho.pdf',
            mimeType: 'application/pdf',
            size: 100,
            subjectId: PRIVATE_SUBJECT,
            uploadedBy: TEACHER,
            isPublic: false,
        }));
        await files.softDelete(disabledFile.id);
        await assignments.save(assignments.create({
            id: ASSIGNMENT,
            subjectId: PRIVATE_SUBJECT,
            teacherId: TEACHER,
            title: 'Projeto',
            dueDate: new Date(Date.now() + 86_400_000),
            attachmentKey: 'assignments/enunciado.pdf',
            attachmentName: 'enunciado.pdf',
            attachmentMimeType: 'application/pdf',
            attachmentSize: 100,
        }));
        await submissions.save(submissions.create({
            assignmentId: ASSIGNMENT,
            studentId: ACTIVE_STUDENT,
            key: 'submissions/resposta.pdf',
            originalName: 'resposta.pdf',
            mimeType: 'application/pdf',
            size: 100,
            submittedAt: new Date(),
        }));

        await service.remove(PRIVATE_SUBJECT, TEACHER);

        expect(await subjects.findOneBy({ id: PRIVATE_SUBJECT })).toBeNull();
        expect(await files.findOne({ where: { id: activeFile.id }, withDeleted: true })).toBeNull();
        expect(await files.findOne({ where: { id: disabledFile.id }, withDeleted: true })).toBeNull();
        expect(await assignments.countBy({ subjectId: PRIVATE_SUBJECT })).toBe(0);
        expect(await submissions.countBy({ assignmentId: ASSIGNMENT })).toBe(0);
        expect(await classroomSubjects.countBy({ subjectId: PRIVATE_SUBJECT })).toBe(0);
        expect(r2.deleteObject).toHaveBeenCalledWith('files/material.pdf');
        expect(r2.deleteObject).toHaveBeenCalledWith('files/rascunho.pdf');
        expect(r2.deleteObject).toHaveBeenCalledWith('assignments/enunciado.pdf');
        expect(r2.deleteObject).toHaveBeenCalledWith('submissions/resposta.pdf');
    });

    it('FIL-16 preserva e reprocessa a limpeza quando o R2 falha após a transação', async () => {
        await files.save(files.create({
            originalName: 'material-pendente.pdf',
            key: 'files/material-pendente.pdf',
            mimeType: 'application/pdf',
            size: 100,
            subjectId: PRIVATE_SUBJECT,
            uploadedBy: TEACHER,
            isPublic: true,
        }));
        r2.deleteObject.mockRejectedValue(new Error('R2 unavailable'));

        await service.remove(PRIVATE_SUBJECT, TEACHER);

        expect(await subjects.findOneBy({ id: PRIVATE_SUBJECT })).toBeNull();
        expect(await files.count({ withDeleted: true })).toBe(0);
        expect(await cleanupJobs.findOneByOrFail({
            key: 'files/material-pendente.pdf',
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
        expect(r2.deleteObject).toHaveBeenCalledTimes(2);
    });
});
