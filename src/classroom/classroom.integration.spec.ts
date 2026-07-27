import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ClassroomMemberStatusEnum } from 'src/common/enums/classroom-member-status.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { ClassroomEntity } from 'src/db/entities/classroom.entity';
import { ClassroomInviteEntity } from 'src/db/entities/classroom-invite.entity';
import { ClassroomMemberEntity } from 'src/db/entities/classroom-member.entity';
import { ClassroomSubjectEntity } from 'src/db/entities/classroom-subject.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { MailService } from 'src/mail/mail.service';
import { ClassroomService } from './classroom.service';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

const TEACHER = '11111111-1111-4111-8111-111111111111';
const OTHER_TEACHER = '22222222-2222-4222-8222-222222222222';
const ACTIVE_STUDENT = '33333333-3333-4333-8333-333333333333';
const PENDING_STUDENT = '44444444-4444-4444-8444-444444444444';
const SECOND_STUDENT = '55555555-5555-4555-8555-555555555555';

describeIfDb('ClassroomService - integração com PostgreSQL', () => {
    let service: ClassroomService;
    let dataSource: DataSource;
    let users: Repository<UserEntity>;
    let classrooms: Repository<ClassroomEntity>;
    let members: Repository<ClassroomMemberEntity>;
    let subjects: Repository<SubjectEntity>;
    let links: Repository<ClassroomSubjectEntity>;
    let invites: Repository<ClassroomInviteEntity>;
    let firstClassroom: ClassroomEntity;
    let secondClassroom: ClassroomEntity;
    let ownSubject: SubjectEntity;

    const mail = {
        sendJoinRequestEmail: jest.fn(async () => undefined),
        sendJoinAcceptedEmail: jest.fn(async () => undefined),
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    url: TEST_DATABASE_URL,
                    entities: [
                        UserEntity,
                        ClassroomEntity,
                        ClassroomMemberEntity,
                        ClassroomSubjectEntity,
                        ClassroomInviteEntity,
                        SubjectEntity,
                    ],
                    synchronize: true,
                    dropSchema: true,
                }),
                TypeOrmModule.forFeature([
                    ClassroomEntity,
                    ClassroomMemberEntity,
                    ClassroomSubjectEntity,
                    ClassroomInviteEntity,
                    SubjectEntity,
                    UserEntity,
                ]),
            ],
            providers: [
                ClassroomService,
                {
                    provide: ConfigService,
                    useValue: { get: jest.fn(() => 'https://repoif.example') },
                },
                { provide: MailService, useValue: mail },
            ],
        }).compile();

        service = moduleRef.get(ClassroomService);
        dataSource = moduleRef.get(DataSource);
        users = moduleRef.get(getRepositoryToken(UserEntity));
        classrooms = moduleRef.get(getRepositoryToken(ClassroomEntity));
        members = moduleRef.get(getRepositoryToken(ClassroomMemberEntity));
        subjects = moduleRef.get(getRepositoryToken(SubjectEntity));
        links = moduleRef.get(getRepositoryToken(ClassroomSubjectEntity));
        invites = moduleRef.get(getRepositoryToken(ClassroomInviteEntity));
    });

    afterAll(async () => {
        await dataSource?.destroy();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await invites.clear();
        await links.clear();
        await members.clear();
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
            }),
            users.create({
                id: OTHER_TEACHER,
                username: 'bia',
                email: 'bia@ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.TEACHER,
            }),
            users.create({
                id: ACTIVE_STUDENT,
                username: 'carlos',
                email: 'carlos@aluno.ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.STUDENT,
            }),
            users.create({
                id: PENDING_STUDENT,
                username: 'dora',
                email: 'dora@aluno.ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.STUDENT,
            }),
            users.create({
                id: SECOND_STUDENT,
                username: 'edu',
                email: 'edu@aluno.ifpi.edu.br',
                password: 'hash',
                role: UserRoleEnum.STUDENT,
            }),
        ]);

        [firstClassroom, secondClassroom] = await classrooms.save([
            classrooms.create({ name: 'Algoritmos 2026.1', teacherId: TEACHER }),
            classrooms.create({ name: 'Banco de Dados', teacherId: TEACHER }),
            classrooms.create({ name: 'Turma alheia', teacherId: OTHER_TEACHER }),
        ]).then(saved => [saved[0], saved[1]]);

        await members.save([
            members.create({
                classroomId: firstClassroom.id,
                studentId: ACTIVE_STUDENT,
                status: ClassroomMemberStatusEnum.ACTIVE,
            }),
            members.create({
                classroomId: firstClassroom.id,
                studentId: PENDING_STUDENT,
                status: ClassroomMemberStatusEnum.PENDING,
            }),
        ]);

        ownSubject = await subjects.save(subjects.create({
            name: 'Estruturas de Dados',
            teacherId: TEACHER,
            isPublic: false,
        }));
    });

    it('TUR-01 lista turmas do proprietário com ILIKE e paginação reais', async () => {
        const result = await service.listForUser(TEACHER, UserRoleEnum.TEACHER, {
            page: 1,
            limit: 1,
            search: 'ALGORITMOS',
        });
        expect(result.data).toHaveLength(1);
        expect(result.data[0].id).toBe(firstClassroom.id);
        expect(result.meta).toMatchObject({ page: 1, limit: 1, total: 1, totalPages: 1 });
    });

    it('TUR-02/03 aluno ACTIVE lista e acessa; PENDING não lista nem acessa', async () => {
        const active = await service.listForUser(ACTIVE_STUDENT, UserRoleEnum.STUDENT, {});
        const pending = await service.listForUser(PENDING_STUDENT, UserRoleEnum.STUDENT, {});
        expect(active.data.map(item => item.id)).toEqual([firstClassroom.id]);
        expect(pending.data).toEqual([]);
        await expect(service.findOne(firstClassroom.id, ACTIVE_STUDENT)).resolves.toBeDefined();
        await expect(service.findOne(firstClassroom.id, PENDING_STUDENT))
            .rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.findOne(firstClassroom.id, SECOND_STUDENT))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('TUR-04/05 vincula disciplina própria uma vez e remove somente da própria turma', async () => {
        await expect(service.addSubject(
            firstClassroom.id,
            { subjectId: ownSubject.id },
            TEACHER,
        )).resolves.toMatchObject({ id: ownSubject.id });
        await expect(service.addSubject(
            firstClassroom.id,
            { subjectId: ownSubject.id },
            TEACHER,
        )).rejects.toMatchObject({ status: 409 });
        await expect(service.removeSubject(firstClassroom.id, ownSubject.id, OTHER_TEACHER))
            .rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.removeSubject(firstClassroom.id, ownSubject.id, TEACHER))
            .resolves.toBeUndefined();
        expect(await links.count()).toBe(0);
    });

    it('TUR-06/07 adiciona por email, impede duplicidade e promove pedido pendente', async () => {
        await expect(service.addMember(
            secondClassroom.id,
            { email: ' EDU@ALUNO.IFPI.EDU.BR ' },
            TEACHER,
        )).resolves.toMatchObject({ studentId: SECOND_STUDENT, status: 'ACTIVE' });
        await expect(service.addMember(
            secondClassroom.id,
            { username: 'edu' },
            TEACHER,
        )).rejects.toMatchObject({ status: 409 });
        await expect(service.addMember(
            firstClassroom.id,
            { username: 'dora' },
            TEACHER,
        )).resolves.toMatchObject({ studentId: PENDING_STUDENT, status: 'ACTIVE' });
    });

    it('TUR-08 lista e remove somente membros ativos da turma própria', async () => {
        await expect(service.listMembers(firstClassroom.id, TEACHER)).resolves.toEqual([
            expect.objectContaining({ studentId: ACTIVE_STUDENT, username: 'carlos' }),
        ]);
        await expect(service.removeMember(firstClassroom.id, ACTIVE_STUDENT, OTHER_TEACHER))
            .rejects.toBeInstanceOf(ForbiddenException);
        await service.removeMember(firstClassroom.id, ACTIVE_STUDENT, TEACHER);
        expect(await members.countBy({ classroomId: firstClassroom.id, studentId: ACTIVE_STUDENT })).toBe(0);
    });

    it('TUR-09/11 convite UUID permanece reutilizável até expirar', async () => {
        const generated = await service.createInvite(firstClassroom.id, TEACHER);
        expect(generated.token).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );

        await service.joinByInvite(generated.token, SECOND_STUDENT, UserRoleEnum.STUDENT);
        await members.delete({ classroomId: firstClassroom.id, studentId: PENDING_STUDENT });
        await service.joinByInvite(generated.token, PENDING_STUDENT, UserRoleEnum.STUDENT);

        expect(await members.countBy({
            classroomId: firstClassroom.id,
            status: ClassroomMemberStatusEnum.PENDING,
        })).toBe(2);
        expect(await invites.count()).toBe(1);
    });

    it('TUR-10/12 rejeita convite expirado e pedido duplicado', async () => {
        const expired = await invites.save(invites.create({
            classroomId: firstClassroom.id,
            token: 'expired-token',
            expiresAt: new Date(Date.now() - 1),
        }));
        await expect(service.joinByInvite(expired.token, SECOND_STUDENT, UserRoleEnum.STUDENT))
            .rejects.toMatchObject({ status: 400 });

        const generated = await service.createInvite(firstClassroom.id, TEACHER);
        await service.joinByInvite(generated.token, SECOND_STUDENT, UserRoleEnum.STUDENT);
        await expect(service.joinByInvite(generated.token, SECOND_STUDENT, UserRoleEnum.STUDENT))
            .rejects.toMatchObject({ status: 409 });
    });

    it('TUR-13 aceita e rejeita solicitações apenas como proprietário', async () => {
        await expect(service.acceptRequest(firstClassroom.id, PENDING_STUDENT, OTHER_TEACHER))
            .rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.acceptRequest(firstClassroom.id, PENDING_STUDENT, TEACHER))
            .resolves.toMatchObject({ status: ClassroomMemberStatusEnum.ACTIVE });

        await members.save(members.create({
            classroomId: secondClassroom.id,
            studentId: SECOND_STUDENT,
            status: ClassroomMemberStatusEnum.PENDING,
        }));
        await service.rejectRequest(secondClassroom.id, SECOND_STUDENT, TEACHER);
        expect(await members.countBy({
            classroomId: secondClassroom.id,
            studentId: SECOND_STUDENT,
        })).toBe(0);
    });

    it('TUR-04 valida no PostgreSQL acesso à disciplina por vínculo ACTIVE e alunos distintos', async () => {
        await links.save(links.create({ classroomId: firstClassroom.id, subjectId: ownSubject.id }));
        expect(await service.isSubjectAccessibleToMember(ownSubject.id, ACTIVE_STUDENT)).toBe(true);
        expect(await service.isSubjectAccessibleToMember(ownSubject.id, PENDING_STUDENT)).toBe(false);
        await expect(service.getActiveStudentsForSubject(ownSubject.id))
            .resolves.toEqual([expect.objectContaining({ id: ACTIVE_STUDENT })]);
    });
});
