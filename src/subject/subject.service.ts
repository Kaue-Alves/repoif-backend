import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { Repository } from 'typeorm';
import { SubjectDto } from './subject.dto';
import { UserEntity } from 'src/db/entities/user.entity';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';

@Injectable()
export class SubjectService {
    constructor(
        @InjectRepository(SubjectEntity)
        private readonly subjectRepository: Repository<SubjectEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>
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

    return await this.subjectRepository.save(subject);
}


    async findAll(): Promise<SubjectEntity[]> {
        return await this.subjectRepository.find();
    }

    async findOne(id: string): Promise<SubjectEntity> {
        const subject = await this.subjectRepository.findOne({ where: { id } });
        if (!subject) {
            throw new NotFoundException(`Subject with ID ${id} not found`);
        }
        return subject;
    }

    async update(id: string, subjectDto: Partial<SubjectDto>, teacherId: string): Promise<SubjectEntity> {
        const subject = await this.findOne(id);

        // Opcional: Validar se o professor que está tentando editar é o dono da disciplina
        if (subject.teacherId !== teacherId) {
            throw new NotFoundException(`Subject with ID ${id} not found for this teacher`);
        }
        
        if (subjectDto.name) subject.name = subjectDto.name;
        if (subjectDto.description) subject.description = subjectDto.description;
        
        // teacherId não é atualizado via body, ele é fixo do dono original ou alterado por lógica específica
        // mas se quiser permitir trocar de professor (ex: admin), a lógica seria diferente.

        return await this.subjectRepository.save(subject);
    }

    async remove(id: string): Promise<void> {
        const result = await this.subjectRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`Subject with ID ${id} not found`);
        }
    }
}

