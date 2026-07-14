import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';

import { ClassroomEntity } from 'src/db/entities/classroom.entity';
import { ClassroomInviteEntity } from 'src/db/entities/classroom-invite.entity';
import { ClassroomMemberEntity } from 'src/db/entities/classroom-member.entity';
import { ClassroomSubjectEntity } from 'src/db/entities/classroom-subject.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { ClassroomMemberStatusEnum } from 'src/common/enums/classroom-member-status.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { buildPaginationMeta, Paginated, PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { MailService } from 'src/mail/mail.service';

import {
    AddMemberDto,
    AddSubjectToClassroomDto,
    CreateClassroomDto,
    CreateInviteDto,
    DEFAULT_INVITE_TTL_MINUTES,
    UpdateClassroomDto,
} from './classroom.dto';

@Injectable()
export class ClassroomService {
    constructor(
        @InjectRepository(ClassroomEntity)
        private readonly classroomRepository: Repository<ClassroomEntity>,

        @InjectRepository(ClassroomMemberEntity)
        private readonly memberRepository: Repository<ClassroomMemberEntity>,

        @InjectRepository(ClassroomSubjectEntity)
        private readonly classroomSubjectRepository: Repository<ClassroomSubjectEntity>,

        @InjectRepository(ClassroomInviteEntity)
        private readonly inviteRepository: Repository<ClassroomInviteEntity>,

        @InjectRepository(SubjectEntity)
        private readonly subjectRepository: Repository<SubjectEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,

        private readonly configService: ConfigService,

        private readonly mailService: MailService,
    ) {}

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    /**
     * Avisa o professor de que há um pedido pendente.
     * Best-effort: falha de e-mail não pode derrubar o pedido do aluno.
     */
    private async notifyTeacherOfJoinRequest(classroom: ClassroomEntity, studentId: string) {
        try {
            const [teacher, student] = await Promise.all([
                this.userRepository.findOne({ where: { id: classroom.teacherId } }),
                this.userRepository.findOne({ where: { id: studentId } }),
            ]);
            if (!teacher || !student) return;

            await this.mailService.sendJoinRequestEmail(
                teacher.email,
                teacher.username,
                student.username,
                classroom.name,
                classroom.id,
            );
        } catch {
            // Notificação é acessória: o pedido já está registrado.
        }
    }

    /**
     * Avisa o aluno de que entrou na turma — por aceite do pedido dele ou por
     * adição direta do professor.
     * Best-effort: falha de e-mail não pode derrubar a ativação do membro.
     */
    private async notifyStudentOfMembership(
        classroom: ClassroomEntity,
        student: UserEntity,
        origem: 'pedido-aceito' | 'adicionado-pelo-professor',
    ) {
        try {
            await this.mailService.sendJoinAcceptedEmail(
                student.email,
                student.username,
                classroom.name,
                classroom.id,
                origem,
            );
        } catch {
            // Notificação é acessória: o aluno já está ativo na turma.
        }
    }

    /** Retorna a turma garantindo que o professor informado é o dono. */
    private async getOwnedClassroom(classroomId: string, teacherId: string): Promise<ClassroomEntity> {
        const classroom = await this.classroomRepository.findOne({ where: { id: classroomId } });
        if (!classroom) {
            throw new NotFoundException(`Turma ${classroomId} não encontrada`);
        }
        if (classroom.teacherId !== teacherId) {
            throw new ForbiddenException('Você não tem acesso a esta turma');
        }
        return classroom;
    }

    /**
     * Indica se a disciplina está vinculada a alguma turma em que o usuário
     * é aluno ativo — ou seja, se ele pode ler a disciplina e seus arquivos.
     */
    async isSubjectAccessibleToMember(subjectId: string, userId?: string): Promise<boolean> {
        if (!userId) {
            return false;
        }
        const count = await this.classroomSubjectRepository
            .createQueryBuilder('cs')
            .innerJoin('classroom_members', 'm', 'm.classroomId = cs.classroomId')
            .where('cs.subjectId = :subjectId', { subjectId })
            .andWhere('m.studentId = :userId', { userId })
            .andWhere('m.status = :status', { status: ClassroomMemberStatusEnum.ACTIVE })
            .getCount();
        return count > 0;
    }

    /**
     * Retorna os alunos ativos de todas as turmas que contêm a disciplina —
     * ou seja, os alunos de quem se espera a entrega de trabalhos da disciplina.
     */
    async getActiveStudentsForSubject(subjectId: string): Promise<UserEntity[]> {
        const rows = await this.classroomSubjectRepository
            .createQueryBuilder('cs')
            .innerJoin('classroom_members', 'm', 'm.classroomId = cs.classroomId')
            .where('cs.subjectId = :subjectId', { subjectId })
            .andWhere('m.status = :status', { status: ClassroomMemberStatusEnum.ACTIVE })
            .select('DISTINCT m.studentId', 'studentId')
            .getRawMany<{ studentId: string }>();

        const ids = rows.map(r => r.studentId);
        if (ids.length === 0) {
            return [];
        }
        return this.userRepository.find({ where: ids.map(id => ({ id })) });
    }

    /** Garante que o usuário é o dono (professor) ou um aluno ativo da turma. */
    private async getAccessibleClassroom(classroomId: string, userId: string): Promise<ClassroomEntity> {
        const classroom = await this.classroomRepository.findOne({ where: { id: classroomId } });
        if (!classroom) {
            throw new NotFoundException(`Turma ${classroomId} não encontrada`);
        }
        if (classroom.teacherId === userId) {
            return classroom;
        }
        const member = await this.memberRepository.findOne({
            where: { classroomId, studentId: userId, status: ClassroomMemberStatusEnum.ACTIVE },
        });
        if (!member) {
            throw new ForbiddenException('Você não tem acesso a esta turma');
        }
        return classroom;
    }

    // ----------------------------------------------------------------
    // Turmas
    // ----------------------------------------------------------------

    async create(dto: CreateClassroomDto, teacherId: string): Promise<ClassroomEntity> {
        const teacher = await this.userRepository.findOne({
            where: { id: teacherId, role: UserRoleEnum.TEACHER },
        });
        if (!teacher) {
            throw new ForbiddenException('Apenas professores podem criar turmas');
        }

        const classroom = new ClassroomEntity();
        classroom.name = dto.name.trim();
        classroom.description = dto.description?.trim();
        classroom.teacherId = teacherId;

        return await this.classroomRepository.save(classroom);
    }

    /** Lista as turmas do professor (dono) ou as turmas em que o aluno é membro ativo. */
    async listForUser(
        userId: string,
        role: UserRoleEnum,
        query: PaginationQueryDto,
    ): Promise<Paginated<ClassroomEntity>> {
        const page = query.page ?? 1;
        const limit = query.limit ?? 12;
        const search = query.search?.trim();

        const qb = this.classroomRepository
            .createQueryBuilder('classroom')
            .orderBy('classroom.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        if (role === UserRoleEnum.TEACHER) {
            qb.where('classroom.teacherId = :userId', { userId });
        } else {
            const memberships = await this.memberRepository.find({
                where: { studentId: userId, status: ClassroomMemberStatusEnum.ACTIVE },
            });
            const ids = memberships.map(m => m.classroomId);
            if (ids.length === 0) {
                return { data: [], meta: buildPaginationMeta(page, limit, 0) };
            }
            qb.where('classroom.id IN (:...ids)', { ids });
        }

        if (search) {
            qb.andWhere('classroom.name ILIKE :search', { search: `%${search}%` });
        }

        const [data, total] = await qb.getManyAndCount();
        return { data, meta: buildPaginationMeta(page, limit, total) };
    }

    async findOne(classroomId: string, userId: string): Promise<ClassroomEntity> {
        return await this.getAccessibleClassroom(classroomId, userId);
    }

    async update(classroomId: string, dto: UpdateClassroomDto, teacherId: string): Promise<ClassroomEntity> {
        const classroom = await this.getOwnedClassroom(classroomId, teacherId);
        if (dto.name !== undefined) classroom.name = dto.name.trim();
        if (dto.description !== undefined) classroom.description = dto.description?.trim();
        return await this.classroomRepository.save(classroom);
    }

    async remove(classroomId: string, teacherId: string): Promise<void> {
        await this.getOwnedClassroom(classroomId, teacherId);
        await this.classroomRepository.delete(classroomId);
    }

    // ----------------------------------------------------------------
    // Disciplinas da turma
    // ----------------------------------------------------------------

    async addSubject(classroomId: string, dto: AddSubjectToClassroomDto, teacherId: string) {
        await this.getOwnedClassroom(classroomId, teacherId);

        let subject: SubjectEntity;

        if (dto.subjectId) {
            const existing = await this.subjectRepository.findOne({ where: { id: dto.subjectId } });
            if (!existing) {
                throw new NotFoundException(`Disciplina ${dto.subjectId} não encontrada`);
            }
            if (existing.teacherId !== teacherId) {
                throw new ForbiddenException('Você só pode vincular disciplinas suas');
            }
            subject = existing;
        } else {
            if (!dto.name || !dto.name.trim()) {
                throw new BadRequestException('Informe subjectId de uma disciplina existente ou o name de uma nova');
            }
            const newSubject = new SubjectEntity();
            newSubject.name = dto.name.trim();
            newSubject.description = dto.description?.trim();
            newSubject.teacherId = teacherId;
            newSubject.isPublic = false; // disciplina de turma privada
            subject = await this.subjectRepository.save(newSubject);
        }

        const alreadyLinked = await this.classroomSubjectRepository.findOne({
            where: { classroomId, subjectId: subject.id },
        });
        if (alreadyLinked) {
            throw new ConflictException('Esta disciplina já está vinculada à turma');
        }

        const link = new ClassroomSubjectEntity();
        link.classroomId = classroomId;
        link.subjectId = subject.id;
        await this.classroomSubjectRepository.save(link);

        return subject;
    }

    async listSubjects(
        classroomId: string,
        userId: string,
        query: PaginationQueryDto,
    ): Promise<Paginated<{ id: string; name: string; description?: string }>> {
        await this.getAccessibleClassroom(classroomId, userId);

        const page = query.page ?? 1;
        const limit = query.limit ?? 12;
        const search = query.search?.trim();

        const dataQb = this.classroomSubjectRepository
            .createQueryBuilder('cs')
            .innerJoin('subjects', 's', 's.id = cs.subjectId')
            .where('cs.classroomId = :classroomId', { classroomId })
            .select('s.id', 'id')
            .addSelect('s.name', 'name')
            .addSelect('s.description', 'description')
            .orderBy('s.name', 'ASC')
            .offset((page - 1) * limit)
            .limit(limit);

        const countQb = this.classroomSubjectRepository
            .createQueryBuilder('cs')
            .innerJoin('subjects', 's', 's.id = cs.subjectId')
            .where('cs.classroomId = :classroomId', { classroomId });

        if (search) {
            dataQb.andWhere('s.name ILIKE :search', { search: `%${search}%` });
            countQb.andWhere('s.name ILIKE :search', { search: `%${search}%` });
        }

        const [data, total] = await Promise.all([
            dataQb.getRawMany<{ id: string; name: string; description?: string }>(),
            countQb.getCount(),
        ]);

        return { data, meta: buildPaginationMeta(page, limit, total) };
    }

    async removeSubject(classroomId: string, subjectId: string, teacherId: string): Promise<void> {
        await this.getOwnedClassroom(classroomId, teacherId);
        const result = await this.classroomSubjectRepository.delete({ classroomId, subjectId });
        if (result.affected === 0) {
            throw new NotFoundException('Disciplina não está vinculada a esta turma');
        }
    }

    // ----------------------------------------------------------------
    // Membros (alunos)
    // ----------------------------------------------------------------

    async addMember(classroomId: string, dto: AddMemberDto, teacherId: string) {
        const classroom = await this.getOwnedClassroom(classroomId, teacherId);

        const username = dto.username?.trim();
        const email = dto.email?.trim();
        if (!username && !email) {
            throw new BadRequestException('Informe o nome de usuário ou o email do aluno');
        }

        const student = username
            ? await this.userRepository.findOne({ where: { username } })
            : await this.userRepository.findOne({ where: { email } });

        if (!student) {
            throw new NotFoundException('Aluno não encontrado');
        }
        if (student.role !== UserRoleEnum.STUDENT) {
            throw new BadRequestException('Apenas alunos podem ser adicionados à turma');
        }

        const existing = await this.memberRepository.findOne({
            where: { classroomId, studentId: student.id },
        });
        if (existing) {
            if (existing.status === ClassroomMemberStatusEnum.ACTIVE) {
                throw new ConflictException('Este aluno já é membro da turma');
            }
            // Havia um pedido pendente: o professor adicionou diretamente, então ativa.
            existing.status = ClassroomMemberStatusEnum.ACTIVE;
            await this.memberRepository.save(existing);
            // O aluno tinha pedido para entrar — para ele, o pedido foi aceito.
            await this.notifyStudentOfMembership(classroom, student, 'pedido-aceito');
            return this.toMemberView(existing, student);
        }

        const member = new ClassroomMemberEntity();
        member.classroomId = classroomId;
        member.studentId = student.id;
        member.status = ClassroomMemberStatusEnum.ACTIVE;
        const saved = await this.memberRepository.save(member);
        await this.notifyStudentOfMembership(classroom, student, 'adicionado-pelo-professor');
        return this.toMemberView(saved, student);
    }

    async listMembers(classroomId: string, teacherId: string) {
        await this.getOwnedClassroom(classroomId, teacherId);
        return await this.getMembersByStatus(classroomId, ClassroomMemberStatusEnum.ACTIVE);
    }

    async listPendingRequests(classroomId: string, teacherId: string) {
        await this.getOwnedClassroom(classroomId, teacherId);
        return await this.getMembersByStatus(classroomId, ClassroomMemberStatusEnum.PENDING);
    }

    async removeMember(classroomId: string, studentId: string, teacherId: string): Promise<void> {
        await this.getOwnedClassroom(classroomId, teacherId);
        const result = await this.memberRepository.delete({ classroomId, studentId });
        if (result.affected === 0) {
            throw new NotFoundException('Aluno não é membro desta turma');
        }
    }

    async acceptRequest(classroomId: string, studentId: string, teacherId: string) {
        const classroom = await this.getOwnedClassroom(classroomId, teacherId);
        const member = await this.memberRepository.findOne({
            where: { classroomId, studentId, status: ClassroomMemberStatusEnum.PENDING },
        });
        if (!member) {
            throw new NotFoundException('Não há pedido pendente deste aluno');
        }
        member.status = ClassroomMemberStatusEnum.ACTIVE;
        await this.memberRepository.save(member);
        const student = await this.userRepository.findOne({ where: { id: studentId } });
        if (student) {
            await this.notifyStudentOfMembership(classroom, student, 'pedido-aceito');
        }
        return this.toMemberView(member, student);
    }

    async rejectRequest(classroomId: string, studentId: string, teacherId: string): Promise<void> {
        await this.getOwnedClassroom(classroomId, teacherId);
        const result = await this.memberRepository.delete({
            classroomId,
            studentId,
            status: ClassroomMemberStatusEnum.PENDING,
        });
        if (result.affected === 0) {
            throw new NotFoundException('Não há pedido pendente deste aluno');
        }
    }

    // ----------------------------------------------------------------
    // Convites por link
    // ----------------------------------------------------------------

    async createInvite(classroomId: string, teacherId: string, dto: CreateInviteDto = {}) {
        await this.getOwnedClassroom(classroomId, teacherId);

        const ttlMinutes = dto.expiresInMinutes ?? DEFAULT_INVITE_TTL_MINUTES;

        const invite = new ClassroomInviteEntity();
        invite.classroomId = classroomId;
        invite.token = randomUUID();
        invite.expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
        const saved = await this.inviteRepository.save(invite);

        const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? '';
        return {
            token: saved.token,
            expiresAt: saved.expiresAt,
            inviteUrl: `${frontendUrl}/classrooms/join/${saved.token}`,
        };
    }

    /** Aluno entra pelo link: cria um pedido pendente que aguarda aceite do professor. */
    async joinByInvite(token: string, userId: string, role: UserRoleEnum) {
        if (role !== UserRoleEnum.STUDENT) {
            throw new BadRequestException('Apenas alunos podem entrar em turmas por convite');
        }

        const invite = await this.inviteRepository.findOne({ where: { token } });
        if (!invite) {
            throw new NotFoundException('Convite inválido');
        }
        if (invite.expiresAt.getTime() < Date.now()) {
            throw new BadRequestException('Convite expirado');
        }

        const classroom = await this.classroomRepository.findOne({ where: { id: invite.classroomId } });
        if (!classroom) {
            throw new NotFoundException('Turma não encontrada');
        }

        const existing = await this.memberRepository.findOne({
            where: { classroomId: invite.classroomId, studentId: userId },
        });
        if (existing) {
            if (existing.status === ClassroomMemberStatusEnum.ACTIVE) {
                throw new ConflictException('Você já é membro desta turma');
            }
            throw new ConflictException('Seu pedido para entrar nesta turma já está pendente');
        }

        const member = new ClassroomMemberEntity();
        member.classroomId = invite.classroomId;
        member.studentId = userId;
        member.status = ClassroomMemberStatusEnum.PENDING;
        await this.memberRepository.save(member);

        await this.notifyTeacherOfJoinRequest(classroom, userId);

        return {
            status: ClassroomMemberStatusEnum.PENDING,
            classroom: { id: classroom.id, name: classroom.name },
            message: 'Pedido enviado. Aguarde o professor aceitar sua entrada na turma.',
        };
    }

    // ----------------------------------------------------------------
    // Views auxiliares
    // ----------------------------------------------------------------

    private async getMembersByStatus(classroomId: string, status: ClassroomMemberStatusEnum) {
        const members = await this.memberRepository.find({
            where: { classroomId, status },
            order: { createdAt: 'ASC' },
        });
        if (members.length === 0) {
            return [];
        }
        const studentIds = members.map(m => m.studentId);
        const students = await this.userRepository.find({ where: studentIds.map(id => ({ id })) });
        const byId = new Map(students.map(s => [s.id, s]));
        return members.map(m => this.toMemberView(m, byId.get(m.studentId)));
    }

    private toMemberView(member: ClassroomMemberEntity, student?: UserEntity | null) {
        return {
            id: member.id,
            studentId: member.studentId,
            username: student?.username ?? null,
            email: student?.email ?? null,
            status: member.status,
            createdAt: member.createdAt,
        };
    }
}
