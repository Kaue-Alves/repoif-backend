import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserDto } from './users.dto';
import { hashSync } from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from 'src/db/entities/user.entity';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { TokenEntity } from 'src/db/entities/token.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { ClassroomMemberEntity } from 'src/db/entities/classroom-member.entity';
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

        private readonly mailService: MailService,

        private readonly subjectService: SubjectService
    ) {}

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
    
    async create(newUser: UserDto) {

        const existingUser = await this.usersRepository.findOne({ where: { username: newUser.username.trim() } })

        if (existingUser) {
            if (existingUser.emailVerified) {
                throw new ConflictException(`O username "${newUser.username}" já está em uso`)
            }

            // Conta existe mas não foi verificada: corrige o email e reenvia o token
            existingUser.email = newUser.email.trim()
            existingUser.password = hashSync(newUser.password.trim(), 10)
            await this.usersRepository.save(existingUser)

            await this.tokenRepository.delete({ userId: existingUser.id, type: TokenTypeEnum.EMAIL_VERIFICATION })

            const tokenEntity = new TokenEntity()
            tokenEntity.userId = existingUser.id
            tokenEntity.token = randomUUID()
            tokenEntity.type = TokenTypeEnum.EMAIL_VERIFICATION
            tokenEntity.expiresAt = new Date(Date.now() + 1000 * 60 * 10)

            await this.tokenRepository.save(tokenEntity)

            this.mailService.sendVerificationEmail(existingUser.email, existingUser.username, tokenEntity.token).catch(() => {})

            return { id: existingUser.id, username: existingUser.username }
        }

        const dbUser = new UserEntity()
        dbUser.username = newUser.username.trim()
        dbUser.email = newUser.email.trim()
        dbUser.password = hashSync(newUser.password.trim(), 10)
        dbUser.role = newUser.role

        const {id, username, email} = await this.usersRepository.save(dbUser)

        const tokenEntity = new TokenEntity()
        tokenEntity.userId = id
        tokenEntity.token = randomUUID()
        tokenEntity.type = TokenTypeEnum.EMAIL_VERIFICATION
        tokenEntity.expiresAt = new Date(Date.now() + 1000 * 60 * 10)

        await this.tokenRepository.save(tokenEntity)

        this.mailService.sendVerificationEmail(email, username, tokenEntity.token).catch(() => {});

        return {id, username}
    }

    async findAllUsers(): Promise<UserDto[] | null> {
        return await this.usersRepository.find()
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

        const subjects = await this.subjectService.findByTeacherId(user.id, isOwner);

        return {
            id: user.id,
            username: user.username,
            role: user.role,
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
