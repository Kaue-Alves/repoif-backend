import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
        const uploadUrl = await this.r2Service.getPresignedUploadUrl(key, dto.contentType, dto.size);
        const uploadProof = this.r2Service.createUploadProof({
            userId,
            purpose: 'subject-file',
            scopeId: dto.subjectId,
            key,
            filename: dto.filename,
            contentType: dto.contentType,
            size: dto.size,
        });

        return { uploadUrl, key, uploadProof };
    }

    async confirmUpload(dto: ConfirmUploadDto, userId: string): Promise<FileEntity> {
        await this.assertTeacher(userId);
        await this.assertSubjectOwner(dto.subjectId, userId);
        await this.r2Service.verifyUploadedObject(dto.uploadProof, {
            userId,
            purpose: 'subject-file',
            scopeId: dto.subjectId,
            key: dto.key,
            filename: dto.originalName,
            contentType: dto.mimeType,
            size: dto.size,
        });

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

    /**
     * Arquivo privado é privado para todo mundo, inclusive para os alunos das turmas
     * que contêm a disciplina: "privado" é o rascunho do professor, não o material da
     * turma. Para entregar um arquivo privado a alguém, o dono compartilha o QR code —
     * que embute uma URL pré-assinada do R2 e não passa mais por esta autorização.
     *
     * `search` filtra pelo nome do arquivo. O filtro é aplicado **depois** do recorte de
     * visibilidade: buscar nunca revela um arquivo que a listagem esconderia.
     *
     * Arquivo **desabilitado** (`deletedAt` preenchido) some para todos, menos para o dono,
     * que precisa vê-lo para reabilitá-lo. O `withDeleted()` só entra no ramo do dono.
     */
    async findBySubject(
        subjectId: string,
        requestingUserId?: string,
        search?: string,
    ): Promise<FileEntity[]> {
        const subject = await this.subjectRepository.findOne({ where: { id: subjectId } });
        if (!subject) throw new NotFoundException('Disciplina não encontrada');

        const isOwner = !!requestingUserId && requestingUserId === subject.teacherId;

        const qb = this.fileRepository
            .createQueryBuilder('file')
            .where('file.subjectId = :subjectId', { subjectId })
            .orderBy('file.createdAt', 'DESC');

        if (isOwner) {
            qb.withDeleted();
        } else {
            qb.andWhere('file.isPublic = true');
        }

        const term = search?.trim();
        if (term) {
            qb.andWhere('file.originalName ILIKE :term', { term: `%${term}%` });
        }

        return qb.getMany();
    }

    async getDownloadUrl(fileId: string, requestingUserId?: string): Promise<string> {
        const file = await this.fileRepository.findOne({ where: { id: fileId }, withDeleted: true });
        if (!file) throw new NotFoundException('Arquivo não encontrado');

        const isOwner = !!requestingUserId && requestingUserId === file.uploadedBy;

        // Para quem não é dono, um arquivo desabilitado não existe — nem 403, que já
        // confirmaria a existência do arquivo a quem tem o id.
        if (file.deletedAt && !isOwner) {
            throw new NotFoundException('Arquivo não encontrado');
        }

        if (!file.isPublic && !isOwner) {
            throw new ForbiddenException('Este arquivo é privado');
        }

        return this.r2Service.getPresignedDownloadUrl(file.key);
    }

    /** Busca um arquivo do próprio usuário, desabilitado ou não. */
    private async findOwnedFile(fileId: string, userId: string): Promise<FileEntity> {
        const file = await this.fileRepository.findOne({
            where: { id: fileId, uploadedBy: userId },
            withDeleted: true,
        });
        if (!file) throw new NotFoundException('Arquivo não encontrado ou você não é o dono');
        return file;
    }

    async update(fileId: string, dto: UpdateFileDto, userId: string): Promise<FileEntity> {
        await this.assertTeacher(userId);

        const file = await this.findOwnedFile(fileId, userId);

        if (dto.originalName !== undefined) file.originalName = dto.originalName;
        if (dto.isPublic !== undefined) file.isPublic = dto.isPublic;

        return this.fileRepository.save(file);
    }

    /**
     * Desabilita o arquivo: ele some para alunos e para qualquer um que não seja o dono,
     * mas continua no R2 e pode voltar. É a exclusão lógica (`deletedAt`) — reversível,
     * ao contrário de `remove()`.
     */
    async disable(fileId: string, userId: string): Promise<FileEntity> {
        await this.assertTeacher(userId);

        const file = await this.findOwnedFile(fileId, userId);
        if (file.deletedAt) throw new BadRequestException('Arquivo já está desabilitado');

        await this.fileRepository.softDelete(fileId);
        return this.findOwnedFile(fileId, userId);
    }

    /** Reabilita um arquivo desabilitado, devolvendo-o à listagem. */
    async enable(fileId: string, userId: string): Promise<FileEntity> {
        await this.assertTeacher(userId);

        const file = await this.findOwnedFile(fileId, userId);
        if (!file.deletedAt) throw new BadRequestException('Arquivo não está desabilitado');

        await this.fileRepository.restore(fileId);
        return this.findOwnedFile(fileId, userId);
    }

    /**
     * Exclusão definitiva: apaga o objeto no R2 e o registro. Alcança também um arquivo
     * desabilitado — daí o `withDeleted` em `findOwnedFile`, sem o qual excluir de vez um
     * arquivo já desabilitado devolveria 404.
     */
    async remove(fileId: string, userId: string): Promise<void> {
        await this.assertTeacher(userId);

        const file = await this.findOwnedFile(fileId, userId);

        await this.r2Service.deleteObject(file.key);
        await this.fileRepository.delete(fileId);
    }
}
