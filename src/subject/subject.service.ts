import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { Repository } from 'typeorm';
import { SubjectDto } from './subject.dto';
import { UserEntity } from 'src/db/entities/user.entity';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { ClassroomService } from 'src/classroom/classroom.service';
import { buildPaginationMeta, Paginated, PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

@Injectable()
export class SubjectService {
    constructor(
        @InjectRepository(SubjectEntity)
        private readonly subjectRepository: Repository<SubjectEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,

        private readonly classroomService: ClassroomService
    ) {}
async create(subjectDto: SubjectDto, teacherId: string): Promise<SubjectEntity> {

    const foundTeacher = await this.userRepository.findOne({ where: { id: teacherId, role: UserRoleEnum.TEACHER } });
    if (!foundTeacher) {
        throw new NotFoundException(`Teacher with ID ${teacherId} not found`);
    }

    const subject = new SubjectEntity();
    subject.name = subjectDto.name;
    subject.description = subjectDto.description;
    subject.teacherId = teacherId;
    subject.isPublic = subjectDto.isPublic ?? false;

    return await this.subjectRepository.save(subject);
}


    async findAll(teacherId: string, query: PaginationQueryDto): Promise<Paginated<SubjectEntity>> {
        const page = query.page ?? 1;
        const limit = query.limit ?? 12;
        const search = query.search?.trim();

        const qb = this.subjectRepository
            .createQueryBuilder('subject')
            .where('subject.teacherId = :teacherId', { teacherId })
            .orderBy('subject.name', 'ASC')
            .skip((page - 1) * limit)
            .take(limit);

        if (search) {
            qb.andWhere('subject.name ILIKE :search', { search: `%${search}%` });
        }

        const [data, total] = await qb.getManyAndCount();
        return { data, meta: buildPaginationMeta(page, limit, total) };
    }

    async findByTeacherId(teacherId: string, isOwner: boolean): Promise<SubjectEntity[]> {
        const query: any = { teacherId };
        if (!isOwner) {
            query.isPublic = true;
        }
        return await this.subjectRepository.find({ where: query });
    }

    async findOne(id: string, teacherId: string): Promise<SubjectEntity> {
        const subject = await this.subjectRepository.findOne({ where: { id, teacherId } });
        if (!subject) {
            throw new NotFoundException(`Subject with ID ${id} not found`);
        }
        return subject;
    }

    /**
     * Leitura da disciplina para um visualizador. Pode acessar:
     * - o professor dono;
     * - qualquer usuário logado se a disciplina for pública;
     * - alunos ativos de uma turma que contenha esta disciplina.
     * Inclui o username do docente para exibição.
     */
    async findOneForViewer(id: string, userId?: string) {
        const subject = await this.subjectRepository.findOne({ where: { id } });
        if (!subject) {
            throw new NotFoundException(`Subject with ID ${id} not found`);
        }

        const isOwner = !!userId && subject.teacherId === userId;
        if (!isOwner && !subject.isPublic) {
            const hasAccess = await this.classroomService.isSubjectAccessibleToMember(id, userId);
            if (!hasAccess) {
                throw new ForbiddenException('Você não tem acesso a esta disciplina');
            }
        }

        const teacher = await this.userRepository.findOne({ where: { id: subject.teacherId } });

        return {
            id: subject.id,
            name: subject.name,
            description: subject.description,
            isPublic: subject.isPublic,
            teacherId: subject.teacherId,
            teacherUsername: teacher?.username ?? null,
            createdAt: subject.createdAt,
            updatedAt: subject.updatedAt,
        };
    }

    async update(id: string, subjectDto: Partial<SubjectDto>, teacherId: string): Promise<SubjectEntity> {
        const subject = await this.findOne(id, teacherId);

        // Opcional: Validar se o professor que está tentando editar é o dono da disciplina
        if (subject.teacherId !== teacherId) {
            throw new NotFoundException(`Subject with ID ${id} not found for this teacher`);
        }
        
        if (subjectDto.name) subject.name = subjectDto.name;
        if (subjectDto.description) subject.description = subjectDto.description;
        if (subjectDto.isPublic !== undefined) subject.isPublic = subjectDto.isPublic;
        
        // teacherId não é atualizado via body, ele é fixo do dono original ou alterado por lógica específica
        // mas se quiser permitir trocar de professor (ex: admin), a lógica seria diferente.

        return await this.subjectRepository.save(subject);
    }

    async remove(id: string, teacherId: string): Promise<void> {
        const subject = await this.findOne(id, teacherId);

        if (subject.teacherId !== teacherId) {
            throw new NotFoundException(`Subject with ID ${id} not found for this teacher`);
        }

        const result = await this.subjectRepository.delete(id);

        if (result.affected === 0) {
            throw new NotFoundException(`Subject with ID ${id} not found`);
        }
    }
}

