import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PublicUserDto, UserDto } from './users.dto';
import { ChangePasswordDto, UpdateProfileDto } from './update-profile.dto';
import { compareSync, hashSync } from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from 'src/db/entities/user.entity';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { TokenEntity } from 'src/db/entities/token.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { ClassroomMemberEntity } from 'src/db/entities/classroom-member.entity';
import { ClassroomEntity } from 'src/db/entities/classroom.entity';
import { FileEntity } from 'src/db/entities/file.entity';
import { AssignmentEntity } from 'src/db/entities/assignment.entity';
import { AssignmentSubmissionEntity } from 'src/db/entities/assignment-submission.entity';
import { TokenTypeEnum } from 'src/common/enums/token-type.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { ClassroomMemberStatusEnum } from 'src/common/enums/classroom-member-status.enum';
import { MailService } from 'src/mail/mail.service';
import { SubjectService } from 'src/subject/subject.service';
import { ListTeachersDto, PaginatedTeachers } from './list-teachers.dto';

/** Usuário autenticado que faz a requisição. */
export interface RequestingUser {
    userId: string;
    role: UserRoleEnum;
}

/** Contadores de atividade exibidos no próprio perfil. Vazio para o admin, que não tem nem disciplina nem turma. */
export type ProfileStats =
    | { role: UserRoleEnum.TEACHER; subjects: number; classrooms: number; materials: number; assignments: number }
    | { role: UserRoleEnum.STUDENT; classrooms: number; submissions: number; pendingAssignments: number }
    | { role: UserRoleEnum.ADMIN };

/**
 * Validade do link de verificação de e-mail. Os 10 minutos originais venciam antes
 * de muita gente sequer abrir a caixa de entrada; como o link só confirma um endereço
 * (não dá acesso a nada), 24 horas é o intervalo usual e não afrouxa a segurança.
 * O token de redefinição de senha continua curto — lá o risco é outro.
 */
export const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;

@Injectable()
export class UsersService {

    constructor(
        @InjectRepository(UserEntity)
        private readonly usersRepository: Repository<UserEntity>,

        @InjectRepository(TokenEntity)
        private readonly tokenRepository: Repository<TokenEntity>,

        @InjectRepository(SubjectEntity)
        private readonly subjectRepository: Repository<SubjectEntity>,

        @InjectRepository(ClassroomMemberEntity)
        private readonly classroomMemberRepository: Repository<ClassroomMemberEntity>,

        @InjectRepository(ClassroomEntity)
        private readonly classroomRepository: Repository<ClassroomEntity>,

        @InjectRepository(FileEntity)
        private readonly fileRepository: Repository<FileEntity>,

        @InjectRepository(AssignmentEntity)
        private readonly assignmentRepository: Repository<AssignmentEntity>,

        @InjectRepository(AssignmentSubmissionEntity)
        private readonly submissionRepository: Repository<AssignmentSubmissionEntity>,

        private readonly mailService: MailService,

        private readonly subjectService: SubjectService
    ) {}

    // ----------------------------------------------------------------
    // Perfil próprio
    // ----------------------------------------------------------------

    /**
     * Altera o nome de exibição. O `username` não entra aqui de propósito: ele é a
     * identidade (URL do perfil, JWT), e trocá-lo quebraria links já compartilhados.
     */
    async updateProfile(userId: string, dto: UpdateProfileDto) {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('Usuário não encontrado');
        }

        if (dto.name !== undefined) {
            const nome = dto.name.trim();
            // Nome em branco apaga o nome: a UI volta a exibir o @username.
            user.name = nome.length > 0 ? nome : null;
        }

        await this.usersRepository.save(user);
        return { id: user.id, username: user.username, name: user.name, role: user.role };
    }

    /** Troca a senha de quem está logado, conferindo a senha atual. */
    async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('Usuário não encontrado');
        }

        if (!compareSync(dto.currentPassword.trim(), user.password)) {
            throw new BadRequestException('Senha atual incorreta.');
        }

        const nova = dto.newPassword.trim();
        if (compareSync(nova, user.password)) {
            throw new BadRequestException('A nova senha deve ser diferente da atual.');
        }

        user.password = hashSync(nova, 10);
        await this.usersRepository.save(user);

        // Um pedido de redefinição pendente vira uma segunda chave para a conta.
        await this.tokenRepository.delete({ userId: user.id, type: TokenTypeEnum.PASSWORD_RESET });
    }

    /** Contadores de atividade do próprio perfil, exaustivos por papel. */
    private async getProfileStats(user: UserEntity): Promise<ProfileStats> {
        switch (user.role) {
            case UserRoleEnum.ADMIN:
                return { role: UserRoleEnum.ADMIN };

            case UserRoleEnum.TEACHER: {
                const [subjects, classrooms, materials, assignments] = await Promise.all([
                    this.subjectRepository.count({ where: { teacherId: user.id } }),
                    this.classroomRepository.count({ where: { teacherId: user.id } }),
                    this.fileRepository.count({ where: { uploadedBy: user.id } }),
                    this.assignmentRepository.count({ where: { teacherId: user.id } }),
                ]);
                return { role: UserRoleEnum.TEACHER, subjects, classrooms, materials, assignments };
            }

            case UserRoleEnum.STUDENT: {
                const [classrooms, submissions, pendingAssignments] = await Promise.all([
                    this.classroomMemberRepository.count({
                        where: { studentId: user.id, status: ClassroomMemberStatusEnum.ACTIVE },
                    }),
                    this.submissionRepository.count({ where: { studentId: user.id } }),
                    this.countPendingAssignments(user.id),
                ]);
                return { role: UserRoleEnum.STUDENT, classrooms, submissions, pendingAssignments };
            }
        }
    }

    /**
     * Trabalhos das turmas ativas do aluno que ele ainda não entregou.
     * O `NOT EXISTS` é o que faz "pendente" significar "sem entrega minha", e não
     * "sem entrega de ninguém".
     */
    private async countPendingAssignments(studentId: string): Promise<number> {
        return this.assignmentRepository
            .createQueryBuilder('a')
            .innerJoin('classroom_subjects', 'cs', 'cs.subjectId = a.subjectId')
            .innerJoin('classroom_members', 'm', 'm.classroomId = cs.classroomId')
            .where('m.studentId = :studentId', { studentId })
            .andWhere('m.status = :status', { status: ClassroomMemberStatusEnum.ACTIVE })
            .andWhere(
                'NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s."assignmentId" = a.id AND s."studentId" = :studentId)',
            )
            .getCount();
    }

    /**
     * Retorna os IDs dos professores com quem o aluno possui algum vínculo,
     * ou seja, professores donos de turmas em que o aluno é membro ativo.
     */
    private async getLinkedTeacherIds(studentId: string): Promise<string[]> {
        const rows = await this.classroomMemberRepository
            .createQueryBuilder('member')
            .innerJoin('classrooms', 'classroom', 'classroom.id = member.classroomId')
            .where('member.studentId = :studentId', { studentId })
            .andWhere('member.status = :status', { status: ClassroomMemberStatusEnum.ACTIVE })
            .select('DISTINCT classroom.teacherId', 'teacherId')
            .getRawMany<{ teacherId: string }>();

        return rows.map(r => r.teacherId);
    }
    
    /**
     * Invalida os tokens de verificação anteriores do usuário, emite um novo e o
     * envia por e-mail. Único ponto que cria token de verificação — cadastro,
     * recadastro de conta não verificada e reenvio passam todos por aqui.
     */
    private async issueEmailVerification(user: Pick<UserEntity, 'id' | 'email' | 'username'>): Promise<void> {
        await this.tokenRepository.delete({ userId: user.id, type: TokenTypeEnum.EMAIL_VERIFICATION });

        const tokenEntity = new TokenEntity();
        tokenEntity.userId = user.id;
        tokenEntity.token = randomUUID();
        tokenEntity.type = TokenTypeEnum.EMAIL_VERIFICATION;
        tokenEntity.expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

        await this.tokenRepository.save(tokenEntity);

        this.mailService.sendVerificationEmail(user.email, user.username, tokenEntity.token).catch(() => {});
    }

    async create(newUser: UserDto) {
        const username = newUser.username.trim();
        const email = newUser.email.trim();

        // O papel ADMIN só pode ser concedido pelo módulo administrativo.
        if (newUser.role === UserRoleEnum.ADMIN) {
            throw new BadRequestException('O papel ADMIN não é permitido no cadastro público');
        }

        // Conta não verificada continua pertencendo a quem controla o e-mail original.
        // O fluxo correto para ela é o reenvio de verificação, nunca a sobrescrita.
        const existingUser = await this.usersRepository.findOne({
            where: [{ username }, { email }],
            withDeleted: true,
        });
        if (existingUser) {
            throw new ConflictException('Já existe um usuário com este username ou e-mail');
        }

        const dbUser = new UserEntity()
        dbUser.username = username
        dbUser.email = email
        dbUser.password = hashSync(newUser.password.trim(), 10)
        dbUser.role = newUser.role
        dbUser.emailVerified = false

        let savedUser: UserEntity;
        try {
            savedUser = await this.usersRepository.save(dbUser);
        } catch (error) {
            // A consulta anterior melhora a mensagem, mas o índice do banco é a proteção
            // definitiva contra dois cadastros concorrentes.
            const details = error as { code?: string; driverError?: { code?: string } };
            if (details.code === '23505' || details.driverError?.code === '23505') {
                throw new ConflictException('Já existe um usuário com este username ou e-mail');
            }
            throw error;
        }

        const { id } = savedUser;

        await this.issueEmailVerification({ id, username, email })

        return {id, username}
    }

    /**
     * Reenvia o link de verificação. Sem isto, quem perde o e-mail (spam) ou deixa o
     * token vencer fica trancado para sempre: o login barra não verificado e o
     * recadastro esbarra no username/e-mail já tomados.
     *
     * Silencioso quando o e-mail não existe ou a conta já está verificada — responder
     * coisas diferentes revelaria quais contas existem.
     */
    async resendEmailVerification(email: string): Promise<void> {
        const normalizedEmail = email?.trim();
        if (!normalizedEmail) {
            throw new BadRequestException('O campo e-mail é obrigatório.');
        }

        const user = await this.usersRepository.findOne({ where: { email: normalizedEmail } });
        if (!user || user.emailVerified) {
            return;
        }

        await this.issueEmailVerification(user);
    }

    async findAllUsers(): Promise<PublicUserDto[]> {
        const users = await this.usersRepository.find();
        return users.map(user => ({
            id: user.id,
            username: user.username,
            name: user.name ?? null,
            role: user.role,
        }));
    }

    async searchTeachers(query: string, requester: RequestingUser): Promise<{ id: string; username: string; role: string }[]> {
        // Alunos só podem buscar professores com quem possuem vínculo.
        let linkedTeacherIds: string[] | null = null;
        if (requester.role === UserRoleEnum.STUDENT) {
            linkedTeacherIds = await this.getLinkedTeacherIds(requester.userId);
            if (linkedTeacherIds.length === 0) {
                return [];
            }
        }

        const qb = this.usersRepository
            .createQueryBuilder('user')
            .where('user.role = :role', { role: 'TEACHER' })
            .andWhere('user.emailVerified = true')
            .andWhere('user.username ILIKE :query', { query: `%${query.trim()}%` })
            .select(['user.id', 'user.username', 'user.role']);

        if (linkedTeacherIds) {
            qb.andWhere('user.id IN (:...linkedTeacherIds)', { linkedTeacherIds });
        }

        const users = await qb.getMany();

        return users.map(u => ({ id: u.id, username: u.username, role: u.role }));
    }

    async findTeachers(params: ListTeachersDto, requester: RequestingUser): Promise<PaginatedTeachers> {
        const page = params.page ?? 1;
        const limit = params.limit ?? 12;
        const search = params.search?.trim();

        // Alunos só enxergam professores com quem possuem vínculo.
        let linkedTeacherIds: string[] | null = null;
        if (requester.role === UserRoleEnum.STUDENT) {
            linkedTeacherIds = await this.getLinkedTeacherIds(requester.userId);
            if (linkedTeacherIds.length === 0) {
                return {
                    data: [],
                    meta: {
                        page,
                        limit,
                        total: 0,
                        totalPages: 0,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                };
            }
        }

        const queryBuilder = this.usersRepository
            .createQueryBuilder('user')
            .where('user.role = :role', { role: UserRoleEnum.TEACHER })
            .andWhere('user.emailVerified = true')
            .select(['user.id', 'user.username', 'user.role'])
            .orderBy('user.username', 'ASC')
            .skip((page - 1) * limit)
            .take(limit);

        if (linkedTeacherIds) {
            queryBuilder.andWhere('user.id IN (:...linkedTeacherIds)', { linkedTeacherIds });
        }

        if (search && search.length >= 2) {
            queryBuilder.andWhere('user.username ILIKE :search', { search: `%${search}%` });
        }

        const [users, total] = await queryBuilder.getManyAndCount();

        // Conta as disciplinas públicas de cada professor em uma única query.
        const publicSubjectsByTeacher = new Map<string, number>();
        if (users.length > 0) {
            const counts = await this.subjectRepository
                .createQueryBuilder('subject')
                .select('subject.teacherId', 'teacherId')
                .addSelect('COUNT(subject.id)', 'count')
                .where('subject.teacherId IN (:...ids)', { ids: users.map(u => u.id) })
                .andWhere('subject.isPublic = true')
                .groupBy('subject.teacherId')
                .getRawMany<{ teacherId: string; count: string }>();

            for (const row of counts) {
                publicSubjectsByTeacher.set(row.teacherId, Number(row.count));
            }
        }

        const totalPages = Math.ceil(total / limit);

        return {
            data: users.map(u => ({
                id: u.id,
                username: u.username,
                role: u.role,
                publicSubjectsCount: publicSubjectsByTeacher.get(u.id) ?? 0,
            })),
            meta: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        };
    }

    async getProfile(username: string, requester: RequestingUser) {
        const user = await this.usersRepository.findOne({ where: { username } });

        if (!user) {
            throw new NotFoundException(`User ${username} not found`);
        }

        const isOwner = requester.userId === user.id;

        // Alunos só podem acessar o perfil de professores com quem têm vínculo.
        if (!isOwner && requester.role === UserRoleEnum.STUDENT && user.role === UserRoleEnum.TEACHER) {
            const linkedTeacherIds = await this.getLinkedTeacherIds(requester.userId);
            if (!linkedTeacherIds.includes(user.id)) {
                throw new ForbiddenException('Você não possui vínculo com este professor');
            }
        }

        const subjects = await this.subjectService.findVisibleInTeacherProfile(user.id, requester, isOwner);

        // Contadores só para o dono: o número de disciplinas privadas ou de turmas de um
        // professor não é da conta de quem visita o perfil dele.
        const stats = isOwner ? await this.getProfileStats(user) : undefined;

        return {
            id: user.id,
            username: user.username,
            name: user.name ?? null,
            role: user.role,
            stats,
            subjects: subjects.map(s => ({
                id: s.id,
                name: s.name,
                description: s.description,
                isPublic: s.isPublic,
            })),
        };
    }

    async findByUsername(username: string): Promise<UserDto | null> {
        const userFound = await this.usersRepository.findOne({ where: { username } })
        if (!userFound) return null
        return {
            id: userFound.id,
            username: userFound.username,
            email: userFound.email,
            password: userFound.password,
            role: userFound.role,
            emailVerified: userFound.emailVerified
        }
    }

    async findByEmail(email: string): Promise<UserDto | null> {
        const userFound = await this.usersRepository.findOne({ where: { email } })
        if (!userFound) return null
        return {
            id: userFound.id,
            username: userFound.username,
            email: userFound.email,
            password: userFound.password,
            role: userFound.role,
            emailVerified: userFound.emailVerified
        }
    }

    async verifyEmail(token: string): Promise<void> {

        const normalizedToken = token?.trim();
        if (!normalizedToken) {
            throw new BadRequestException('Token é obrigatório');
        }

        const tokenEntity = await this.tokenRepository.findOne({
            where: {
                token: normalizedToken,
                type: TokenTypeEnum.EMAIL_VERIFICATION,
            },
        });

        if (!tokenEntity) {
            throw new BadRequestException('Token inválido');
        }

        if (tokenEntity.expiresAt.getTime() < Date.now()) {
            await this.tokenRepository.delete({ id: tokenEntity.id });
            throw new BadRequestException('Token expirado');
        }

        const user = await this.usersRepository.findOne({ where: { id: tokenEntity.userId } });
        if (!user) {
            await this.tokenRepository.delete({ id: tokenEntity.id });
            throw new BadRequestException('Usuário não encontrado');
        }

        if (!user.emailVerified) {
            user.emailVerified = true;
            await this.usersRepository.save(user);
        }

        await this.tokenRepository.delete({
            userId: user.id,
            type: TokenTypeEnum.EMAIL_VERIFICATION,
        });
    }

    async requestPasswordReset(email: string): Promise<void> {
        const normalizedEmail = email?.trim();
        if (!normalizedEmail) {
            throw new BadRequestException('Email é obrigatório');
        }

        const user = await this.usersRepository.findOne({ where: { email: normalizedEmail } });

        // Não revelar se o usuário existe
        if (!user) {
            return;
        }

        // Invalida tokens antigos de redefinição
        await this.tokenRepository.delete({
            userId: user.id,
            type: TokenTypeEnum.PASSWORD_RESET,
        });

        const tokenEntity = new TokenEntity();
        tokenEntity.userId = user.id;
        tokenEntity.token = randomUUID();
        tokenEntity.type = TokenTypeEnum.PASSWORD_RESET;
        tokenEntity.expiresAt = new Date(Date.now() + 1000 * 60 * 10); // 10 minutos

        await this.tokenRepository.save(tokenEntity);
        this.mailService.sendPasswordResetEmail(user.email, user.username, tokenEntity.token).catch(() => {});
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
        const normalizedToken = token?.trim();
        const normalizedPassword = newPassword?.trim();

        if (!normalizedToken) {
            throw new BadRequestException('Token é obrigatório');
        }

        if (!normalizedPassword) {
            throw new BadRequestException('Nova senha é obrigatória');
        }

        if (normalizedPassword.length < 8) {
            throw new BadRequestException('A senha deve ter no mínimo 8 caracteres');
        }

        const tokenEntity = await this.tokenRepository.findOne({
            where: {
                token: normalizedToken,
                type: TokenTypeEnum.PASSWORD_RESET,
            },
        });

        if (!tokenEntity) {
            throw new BadRequestException('Token inválido');
        }

        if (tokenEntity.expiresAt.getTime() < Date.now()) {
            await this.tokenRepository.delete({ id: tokenEntity.id });
            throw new BadRequestException('Token expirado');
        }

        const user = await this.usersRepository.findOne({ where: { id: tokenEntity.userId } });
        if (!user) {
            await this.tokenRepository.delete({ id: tokenEntity.id });
            throw new BadRequestException('Usuário não encontrado');
        }

        user.password = hashSync(normalizedPassword, 10);
        await this.usersRepository.save(user);

        // one-time use
        await this.tokenRepository.delete({ id: tokenEntity.id });
    }
}
