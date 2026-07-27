import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ClassroomMemberStatusEnum } from 'src/common/enums/classroom-member-status.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { ClassroomEntity } from 'src/db/entities/classroom.entity';
import { ClassroomInviteEntity } from 'src/db/entities/classroom-invite.entity';
import { ClassroomMemberEntity } from 'src/db/entities/classroom-member.entity';
import { ClassroomSubjectEntity } from 'src/db/entities/classroom-subject.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { ClassroomService } from './classroom.service';

const TEACHER = 'teacher-id';
const OTHER_TEACHER = 'other-teacher-id';
const STUDENT = 'student-id';
const SECOND_STUDENT = 'second-student-id';
const CLASSROOM = 'classroom-id';
const SUBJECT = 'subject-id';
const TOKEN = 'invite-token';

const teacher = (id = TEACHER) => ({
    id,
    username: id === TEACHER ? 'ana' : 'bia',
    email: `${id}@ifpi.edu.br`,
    role: UserRoleEnum.TEACHER,
}) as UserEntity;

const student = (id = STUDENT) => ({
    id,
    username: id === STUDENT ? 'aluno' : 'aluna2',
    email: `${id}@aluno.ifpi.edu.br`,
    role: UserRoleEnum.STUDENT,
}) as UserEntity;

const classroom = (overrides: Partial<ClassroomEntity> = {}) => ({
    id: CLASSROOM,
    name: 'Algoritmos 2026.1',
    description: 'ADS',
    teacherId: TEACHER,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
}) as ClassroomEntity;

const subject = (overrides: Partial<SubjectEntity> = {}) => ({
    id: SUBJECT,
    name: 'Algoritmos',
    description: null,
    teacherId: TEACHER,
    isPublic: false,
    ...overrides,
}) as SubjectEntity;

const member = (
    status = ClassroomMemberStatusEnum.ACTIVE,
    studentId = STUDENT,
    classroomId = CLASSROOM,
) => ({
    id: `member-${studentId}`,
    classroomId,
    studentId,
    status,
    createdAt: new Date(),
}) as ClassroomMemberEntity;

function buildService(options: {
    classrooms?: ClassroomEntity[];
    users?: UserEntity[];
    members?: ClassroomMemberEntity[];
    subjects?: SubjectEntity[];
    links?: ClassroomSubjectEntity[];
    invites?: ClassroomInviteEntity[];
    listedClassrooms?: ClassroomEntity[];
} = {}) {
    const classrooms = [...(options.classrooms ?? [classroom()])];
    const users = [...(options.users ?? [teacher(), teacher(OTHER_TEACHER), student(), student(SECOND_STUDENT)])];
    const members = [...(options.members ?? [])];
    const subjects = [...(options.subjects ?? [subject()])];
    const links = [...(options.links ?? [])];
    const invites = [...(options.invites ?? [{
        id: 'invite-id',
        classroomId: CLASSROOM,
        token: TOKEN,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
    } as ClassroomInviteEntity])];

    const classroomQb = {
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [
            options.listedClassrooms ?? classrooms,
            (options.listedClassrooms ?? classrooms).length,
        ]),
    };
    const classroomRepository = {
        findOne: jest.fn(async ({ where }: { where: Partial<ClassroomEntity> }) =>
            classrooms.find(item =>
                (!where.id || item.id === where.id) &&
                (!where.teacherId || item.teacherId === where.teacherId),
            ) ?? null),
        save: jest.fn(async (item: ClassroomEntity) => {
            if (!item.id) item.id = 'created-classroom';
            return item;
        }),
        delete: jest.fn(async (id: string) => ({
            affected: classrooms.some(item => item.id === id) ? 1 : 0,
        })),
        createQueryBuilder: jest.fn(() => classroomQb),
    };

    const memberRepository = {
        findOne: jest.fn(async ({ where }: { where: Partial<ClassroomMemberEntity> }) =>
            members.find(item =>
                (!where.classroomId || item.classroomId === where.classroomId) &&
                (!where.studentId || item.studentId === where.studentId) &&
                (!where.status || item.status === where.status),
            ) ?? null),
        find: jest.fn(async ({ where }: { where: Partial<ClassroomMemberEntity> }) =>
            members.filter(item =>
                (!where.classroomId || item.classroomId === where.classroomId) &&
                (!where.studentId || item.studentId === where.studentId) &&
                (!where.status || item.status === where.status),
            )),
        save: jest.fn(async (item: ClassroomMemberEntity) => {
            if (!item.id) item.id = `saved-${item.studentId}`;
            if (!item.createdAt) item.createdAt = new Date();
            const index = members.findIndex(current =>
                current.classroomId === item.classroomId && current.studentId === item.studentId);
            if (index >= 0) members[index] = item;
            else members.push(item);
            return item;
        }),
        delete: jest.fn(async (where: Partial<ClassroomMemberEntity>) => {
            const index = members.findIndex(item =>
                (!where.classroomId || item.classroomId === where.classroomId) &&
                (!where.studentId || item.studentId === where.studentId) &&
                (!where.status || item.status === where.status));
            if (index < 0) return { affected: 0 };
            members.splice(index, 1);
            return { affected: 1 };
        }),
    };

    const classroomSubjectRepository = {
        findOne: jest.fn(async ({ where }: { where: Partial<ClassroomSubjectEntity> }) =>
            links.find(item => item.classroomId === where.classroomId && item.subjectId === where.subjectId) ?? null),
        save: jest.fn(async (item: ClassroomSubjectEntity) => {
            if (!item.id) item.id = 'saved-link';
            links.push(item);
            return item;
        }),
        delete: jest.fn(async (where: Partial<ClassroomSubjectEntity>) => {
            const index = links.findIndex(item =>
                item.classroomId === where.classroomId && item.subjectId === where.subjectId);
            if (index < 0) return { affected: 0 };
            links.splice(index, 1);
            return { affected: 1 };
        }),
    };

    const inviteRepository = {
        findOne: jest.fn(async ({ where }: { where: Partial<ClassroomInviteEntity> }) =>
            invites.find(item => item.token === where.token) ?? null),
        save: jest.fn(async (item: ClassroomInviteEntity) => {
            if (!item.id) item.id = `invite-${invites.length + 1}`;
            invites.push(item);
            return item;
        }),
    };
    const subjectRepository = {
        findOne: jest.fn(async ({ where }: { where: Partial<SubjectEntity> }) =>
            subjects.find(item => item.id === where.id) ?? null),
        save: jest.fn(async (item: SubjectEntity) => {
            if (!item.id) item.id = `subject-${subjects.length + 1}`;
            subjects.push(item);
            return item;
        }),
    };
    const userRepository = {
        findOne: jest.fn(async ({ where }: { where: Partial<UserEntity> }) =>
            users.find(item =>
                (!where.id || item.id === where.id) &&
                (!where.username || item.username === where.username) &&
                (!where.email || item.email === where.email) &&
                (!where.role || item.role === where.role),
            ) ?? null),
        find: jest.fn(async ({ where }: { where: Partial<UserEntity>[] }) =>
            users.filter(item => where.some(criteria => criteria.id === item.id))),
    };
    const configService = {
        get: jest.fn(() => 'https://repoif.example'),
    } as unknown as ConfigService;
    const mailService = {
        sendJoinRequestEmail: jest.fn(async () => undefined),
        sendJoinAcceptedEmail: jest.fn(async () => undefined),
    };

    const service = new ClassroomService(
        classroomRepository as never,
        memberRepository as never,
        classroomSubjectRepository as never,
        inviteRepository as never,
        subjectRepository as never,
        userRepository as never,
        configService,
        mailService as never,
    );
    return {
        service,
        classroomRepository,
        classroomQb,
        memberRepository,
        classroomSubjectRepository,
        subjectRepository,
        userRepository,
        mailService,
        members,
        links,
    };
}

describe('ClassroomService - CRUD, listagem e acesso', () => {
    it('TUR-01 cria turma para professor, normaliza os campos e define o proprietário', async () => {
        const { service } = buildService();
        await expect(service.create({ name: '  ADS  ', description: '  2026.1  ' }, TEACHER))
            .resolves.toMatchObject({ name: 'ADS', description: '2026.1', teacherId: TEACHER });
    });

    it('TUR-01 rejeita não professor e nome vazio após trim', async () => {
        const { service } = buildService();
        await expect(service.create({ name: 'Turma' }, STUDENT)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.create({ name: '   ' }, TEACHER)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('TUR-01 lista somente as turmas do professor com busca e paginação', async () => {
        const { service, classroomQb } = buildService();
        const result = await service.listForUser(TEACHER, UserRoleEnum.TEACHER, {
            page: 2,
            limit: 5,
            search: ' algoritmos ',
        });
        expect(classroomQb.where).toHaveBeenCalledWith('classroom.teacherId = :userId', { userId: TEACHER });
        expect(classroomQb.skip).toHaveBeenCalledWith(5);
        expect(classroomQb.take).toHaveBeenCalledWith(5);
        expect(classroomQb.andWhere).toHaveBeenCalledWith(
            'classroom.name ILIKE :search',
            { search: '%algoritmos%' },
        );
        expect(result.meta).toMatchObject({ page: 2, limit: 5 });
    });

    it('TUR-01 somente o proprietário edita e exclui a turma', async () => {
        const ownerCase = buildService();
        const otherCase = buildService();
        await expect(ownerCase.service.update(CLASSROOM, { name: '  Nova  ' }, TEACHER))
            .resolves.toMatchObject({ name: 'Nova' });
        await expect(ownerCase.service.remove(CLASSROOM, TEACHER)).resolves.toBeUndefined();
        await expect(otherCase.service.update(CLASSROOM, { name: 'Outra' }, OTHER_TEACHER))
            .rejects.toBeInstanceOf(ForbiddenException);
        await expect(otherCase.service.remove(CLASSROOM, OTHER_TEACHER))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('TUR-02 aluno lista somente vínculos ACTIVE; pendente não concede acesso', async () => {
        const { service, memberRepository, classroomQb } = buildService({
            members: [
                member(ClassroomMemberStatusEnum.ACTIVE),
                member(ClassroomMemberStatusEnum.PENDING, SECOND_STUDENT),
            ],
        });
        await service.listForUser(STUDENT, UserRoleEnum.STUDENT, {});
        expect(memberRepository.find).toHaveBeenCalledWith({
            where: { studentId: STUDENT, status: ClassroomMemberStatusEnum.ACTIVE },
        });
        expect(classroomQb.where).toHaveBeenCalledWith('classroom.id IN (:...ids)', { ids: [CLASSROOM] });
    });

    it('TUR-02 devolve página vazia sem gerar IN vazio e rejeita papel ADMIN', async () => {
        const { service, classroomQb } = buildService();
        await expect(service.listForUser(STUDENT, UserRoleEnum.STUDENT, {}))
            .resolves.toMatchObject({ data: [], meta: { total: 0 } });
        expect(classroomQb.getManyAndCount).not.toHaveBeenCalled();
        await expect(service.listForUser('admin', UserRoleEnum.ADMIN, {}))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('TUR-03 permite proprietário e aluno ativo, mas nega pendente e terceiro', async () => {
        const active = buildService({ members: [member()] });
        const pending = buildService({ members: [member(ClassroomMemberStatusEnum.PENDING)] });
        const outsider = buildService();
        await expect(active.service.findOne(CLASSROOM, TEACHER)).resolves.toBeDefined();
        await expect(active.service.findOne(CLASSROOM, STUDENT)).resolves.toBeDefined();
        await expect(pending.service.findOne(CLASSROOM, STUDENT)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(outsider.service.findOne(CLASSROOM, STUDENT)).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('ClassroomService - disciplinas da turma', () => {
    it('TUR-04 vincula disciplina própria e cria nova disciplina privada', async () => {
        const existingCase = buildService();
        const newCase = buildService({ subjects: [] });
        await expect(existingCase.service.addSubject(CLASSROOM, { subjectId: SUBJECT }, TEACHER))
            .resolves.toMatchObject({ id: SUBJECT });
        await expect(newCase.service.addSubject(CLASSROOM, { name: '  Banco de Dados  ' }, TEACHER))
            .resolves.toMatchObject({ name: 'Banco de Dados', isPublic: false, teacherId: TEACHER });
    });

    it('TUR-04 nega disciplina alheia, vínculo repetido e entrada ambígua', async () => {
        const foreign = buildService({ subjects: [subject({ teacherId: OTHER_TEACHER })] });
        const duplicate = buildService({
            links: [{ id: 'link', classroomId: CLASSROOM, subjectId: SUBJECT } as ClassroomSubjectEntity],
        });
        const ambiguous = buildService();
        await expect(foreign.service.addSubject(CLASSROOM, { subjectId: SUBJECT }, TEACHER))
            .rejects.toBeInstanceOf(ForbiddenException);
        await expect(duplicate.service.addSubject(CLASSROOM, { subjectId: SUBJECT }, TEACHER))
            .rejects.toBeInstanceOf(ConflictException);
        await expect(ambiguous.service.addSubject(
            CLASSROOM,
            { subjectId: SUBJECT, name: 'Outra' },
            TEACHER,
        )).rejects.toBeInstanceOf(BadRequestException);
    });

    it('TUR-04 converte colisão concorrente do banco em conflito controlado', async () => {
        const { service, classroomSubjectRepository } = buildService();
        classroomSubjectRepository.save.mockRejectedValueOnce({ driverError: { code: '23505' } });
        await expect(service.addSubject(CLASSROOM, { subjectId: SUBJECT }, TEACHER))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it('TUR-05 somente o dono remove vínculo existente', async () => {
        const linked = { id: 'link', classroomId: CLASSROOM, subjectId: SUBJECT } as ClassroomSubjectEntity;
        const owner = buildService({ links: [linked] });
        const missing = buildService();
        const other = buildService({ links: [linked] });
        await expect(owner.service.removeSubject(CLASSROOM, SUBJECT, TEACHER)).resolves.toBeUndefined();
        await expect(missing.service.removeSubject(CLASSROOM, SUBJECT, TEACHER))
            .rejects.toBeInstanceOf(NotFoundException);
        await expect(other.service.removeSubject(CLASSROOM, SUBJECT, OTHER_TEACHER))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('ClassroomService - membros e solicitações', () => {
    it('TUR-06 adiciona por username ou email normalizado', async () => {
        const byUsername = buildService();
        const byEmail = buildService();
        await expect(byUsername.service.addMember(CLASSROOM, { username: ' aluno ' }, TEACHER))
            .resolves.toMatchObject({ studentId: STUDENT, status: ClassroomMemberStatusEnum.ACTIVE });
        await expect(byEmail.service.addMember(
            CLASSROOM,
            { email: ' STUDENT-ID@ALUNO.IFPI.EDU.BR ' },
            TEACHER,
        )).resolves.toMatchObject({ studentId: STUDENT });
    });

    it('TUR-06/07 exige exatamente um identificador e somente papel STUDENT', async () => {
        const { service } = buildService();
        await expect(service.addMember(CLASSROOM, {}, TEACHER)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.addMember(
            CLASSROOM,
            { username: 'aluno', email: 'student-id@aluno.ifpi.edu.br' },
            TEACHER,
        )).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.addMember(CLASSROOM, { username: 'ana' }, TEACHER))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('TUR-07 rejeita ativo duplicado e promove pedido pendente', async () => {
        const active = buildService({ members: [member()] });
        const pending = buildService({ members: [member(ClassroomMemberStatusEnum.PENDING)] });
        await expect(active.service.addMember(CLASSROOM, { username: 'aluno' }, TEACHER))
            .rejects.toBeInstanceOf(ConflictException);
        await expect(pending.service.addMember(CLASSROOM, { username: 'aluno' }, TEACHER))
            .resolves.toMatchObject({ status: ClassroomMemberStatusEnum.ACTIVE });
    });

    it('TUR-07 converte duplicidade concorrente em conflito controlado', async () => {
        const { service, memberRepository } = buildService();
        memberRepository.save.mockRejectedValueOnce({ code: '23505' });
        await expect(service.addMember(CLASSROOM, { username: 'aluno' }, TEACHER))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it('TUR-08 lista ativos e remove somente da turma própria', async () => {
        const activeMember = member();
        const owner = buildService({ members: [activeMember] });
        const missing = buildService();
        await expect(owner.service.listMembers(CLASSROOM, TEACHER))
            .resolves.toEqual([expect.objectContaining({ username: 'aluno', status: 'ACTIVE' })]);
        await expect(owner.service.removeMember(CLASSROOM, STUDENT, TEACHER)).resolves.toBeUndefined();
        await expect(missing.service.removeMember(CLASSROOM, STUDENT, TEACHER))
            .rejects.toBeInstanceOf(NotFoundException);
    });

    it('TUR-13 aceita ou rejeita apenas pedido pendente da própria turma', async () => {
        const accept = buildService({ members: [member(ClassroomMemberStatusEnum.PENDING)] });
        const reject = buildService({ members: [member(ClassroomMemberStatusEnum.PENDING)] });
        const active = buildService({ members: [member()] });
        await expect(accept.service.acceptRequest(CLASSROOM, STUDENT, TEACHER))
            .resolves.toMatchObject({ status: ClassroomMemberStatusEnum.ACTIVE });
        await expect(reject.service.rejectRequest(CLASSROOM, STUDENT, TEACHER)).resolves.toBeUndefined();
        await expect(active.service.rejectRequest(CLASSROOM, STUDENT, TEACHER))
            .rejects.toBeInstanceOf(NotFoundException);
        await expect(active.service.acceptRequest(CLASSROOM, STUDENT, OTHER_TEACHER))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('ClassroomService - convites', () => {
    it('TUR-10 rejeita convite inexistente, expirado e papel não estudante', async () => {
        const missing = buildService({ invites: [] });
        const expired = buildService({ invites: [{
            id: 'expired',
            classroomId: CLASSROOM,
            token: TOKEN,
            expiresAt: new Date(Date.now() - 1),
            createdAt: new Date(),
        } as ClassroomInviteEntity] });
        await expect(missing.service.joinByInvite(TOKEN, STUDENT, UserRoleEnum.STUDENT))
            .rejects.toBeInstanceOf(NotFoundException);
        await expect(expired.service.joinByInvite(TOKEN, STUDENT, UserRoleEnum.STUDENT))
            .rejects.toBeInstanceOf(BadRequestException);
        await expect(missing.service.joinByInvite(TOKEN, TEACHER, UserRoleEnum.TEACHER))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('TUR-11 convite continua reutilizável para alunos diferentes até expirar', async () => {
        const { service, members } = buildService();
        await service.joinByInvite(TOKEN, STUDENT, UserRoleEnum.STUDENT);
        await service.joinByInvite(TOKEN, SECOND_STUDENT, UserRoleEnum.STUDENT);
        expect(members).toEqual([
            expect.objectContaining({ studentId: STUDENT, status: ClassroomMemberStatusEnum.PENDING }),
            expect.objectContaining({ studentId: SECOND_STUDENT, status: ClassroomMemberStatusEnum.PENDING }),
        ]);
    });

    it('TUR-12 cria pedido pendente e impede pedido duplicado', async () => {
        const fresh = buildService();
        const pending = buildService({ members: [member(ClassroomMemberStatusEnum.PENDING)] });
        await expect(fresh.service.joinByInvite(TOKEN, STUDENT, UserRoleEnum.STUDENT))
            .resolves.toMatchObject({
                status: ClassroomMemberStatusEnum.PENDING,
                classroom: { id: CLASSROOM },
            });
        await expect(pending.service.joinByInvite(TOKEN, STUDENT, UserRoleEnum.STUDENT))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it('TUR-12 exige usuário STUDENT atual e converte corrida de unicidade', async () => {
        const missingStudent = buildService({ users: [teacher()] });
        const race = buildService();
        race.memberRepository.save.mockRejectedValueOnce({ driverError: { code: '23505' } });
        await expect(missingStudent.service.joinByInvite(TOKEN, STUDENT, UserRoleEnum.STUDENT))
            .rejects.toBeInstanceOf(ForbiddenException);
        await expect(race.service.joinByInvite(TOKEN, STUDENT, UserRoleEnum.STUDENT))
            .rejects.toBeInstanceOf(ConflictException);
    });
});
