import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileEntity } from 'src/db/entities/file.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { R2Service } from 'src/r2/r2.service';
import { ConfirmUploadDto, RequestUploadUrlDto, UpdateFileDto } from './file.dto';

@Injectable()
export class FilesService {

    constructor(
        @InjectRepository(FileEntity)
        private readonly fileRepository: Repository<FileEntity>,

        @InjectRepository(SubjectEntity)
        private readonly subjectRepository: Repository<SubjectEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,

        private readonly r2Service: R2Service,
    ) {}

    private async assertTeacher(userId: string): Promise<UserEntity> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user || user.role !== UserRoleEnum.TEACHER) {
            throw new ForbiddenException('Apenas professores podem realizar esta ação');
        }
        return user;
    }

    private async assertSubjectOwner(subjectId: string, teacherId: string): Promise<SubjectEntity> {
        const subject = await this.subjectRepository.findOne({ where: { id: subjectId, teacherId } });
        if (!subject) {
            throw new NotFoundException(`Disciplina não encontrada ou você não é o dono`);
        }
        return subject;
    }

    async requestUploadUrl(dto: RequestUploadUrlDto, userId: string) {
        await this.assertTeacher(userId);
        await this.assertSubjectOwner(dto.subjectId, userId);

        const key = this.r2Service.buildKey(dto.contentType, dto.filename);
        const uploadUrl = await this.r2Service.getPresignedUploadUrl(key, dto.contentType);

        return { uploadUrl, key };
    }

    async confirmUpload(dto: ConfirmUploadDto, userId: string): Promise<FileEntity> {
        await this.assertTeacher(userId);
        await this.assertSubjectOwner(dto.subjectId, userId);

        const file = new FileEntity();
        file.originalName = dto.originalName;
        file.key = dto.key;
        file.mimeType = dto.mimeType;
        file.size = dto.size;
        file.subjectId = dto.subjectId;
        file.uploadedBy = userId;
        file.isPublic = dto.isPublic ?? false;

        return this.fileRepository.save(file);
    }

    async findBySubject(subjectId: string, requestingUserId?: string): Promise<FileEntity[]> {
        const subject = await this.subjectRepository.findOne({ where: { id: subjectId } });
        if (!subject) throw new NotFoundException('Disciplina não encontrada');

        const isOwner = requestingUserId === subject.teacherId;

        if (isOwner) {
            return this.fileRepository.find({ where: { subjectId } });
        }

        return this.fileRepository.find({ where: { subjectId, isPublic: true } });
    }

    async getDownloadUrl(fileId: string, requestingUserId?: string): Promise<string> {
        const file = await this.fileRepository.findOne({ where: { id: fileId } });
        if (!file) throw new NotFoundException('Arquivo não encontrado');

        const isOwner = requestingUserId === file.uploadedBy;

        if (!file.isPublic && !isOwner) {
            throw new ForbiddenException('Este arquivo é privado');
        }

        return this.r2Service.getPresignedDownloadUrl(file.key);
    }

    async update(fileId: string, dto: UpdateFileDto, userId: string): Promise<FileEntity> {
        await this.assertTeacher(userId);

        const file = await this.fileRepository.findOne({ where: { id: fileId, uploadedBy: userId } });
        if (!file) throw new NotFoundException('Arquivo não encontrado ou você não é o dono');

        if (dto.originalName !== undefined) file.originalName = dto.originalName;
        if (dto.isPublic !== undefined) file.isPublic = dto.isPublic;

        return this.fileRepository.save(file);
    }

    async remove(fileId: string, userId: string): Promise<void> {
        await this.assertTeacher(userId);

        const file = await this.fileRepository.findOne({ where: { id: fileId, uploadedBy: userId } });
        if (!file) throw new NotFoundException('Arquivo não encontrado ou você não é o dono');

        await this.r2Service.deleteObject(file.key);
        await this.fileRepository.delete(fileId);
    }
}
