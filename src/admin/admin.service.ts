import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { hashSync } from 'bcrypt';

import { UserEntity } from 'src/db/entities/user.entity';
import { FileEntity } from 'src/db/entities/file.entity';
import { ReportEntity } from 'src/db/entities/report.entity';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { ReportStatusEnum } from 'src/common/enums/report-status.enum';
import { R2Service } from 'src/r2/r2.service';
import {
    CreateUserByAdminDto,
    ListFilesQueryDto,
    ListReportsQueryDto,
    ListUsersQueryDto,
    UpdateReportStatusDto,
    UpdateUserRoleDto,
} from './admin.dto';

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

@Injectable()
export class AdminService {

    constructor(
        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,

        @InjectRepository(FileEntity)
        private readonly fileRepository: Repository<FileEntity>,

        @InjectRepository(ReportEntity)
        private readonly reportRepository: Repository<ReportEntity>,

        private readonly r2Service: R2Service,
    ) {}

    private buildMeta(page: number, limit: number, total: number): PaginationMeta {
        const totalPages = Math.ceil(total / limit) || 1;
        return {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        };
    }

    private sanitizeUser(user: UserEntity) {
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            emailVerified: user.emailVerified,
            deletedAt: user.deletedAt ?? null,
        };
    }

    // ---------------------------------------------------------------- USERS

    async listUsers(query: ListUsersQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const search = query.search?.trim();

        const qb = this.userRepository
            .createQueryBuilder('user')
            .orderBy('user.username', 'ASC')
            .skip((page - 1) * limit)
            .take(limit);

        if (query.includeDeleted === 'true') {
            qb.withDeleted();
        }

        if (query.role) {
            qb.andWhere('user.role = :role', { role: query.role });
        }

        if (search && search.length >= 1) {
            qb.andWhere('(user.username ILIKE :search OR user.email ILIKE :search)', {
                search: `%${search}%`,
            });
        }

        const [users, total] = await qb.getManyAndCount();

        return {
            data: users.map(u => this.sanitizeUser(u)),
            meta: this.buildMeta(page, limit, total),
        };
    }

    async createUser(dto: CreateUserByAdminDto) {
        const username = dto.username.trim();
        const email = dto.email.trim();

        const existing = await this.userRepository.findOne({
            where: [{ username }, { email }],
            withDeleted: true,
        });

        if (existing) {
            throw new ConflictException('Já existe um usuário com este username ou email');
        }

        const user = this.userRepository.create({
            username,
            email,
            password: hashSync(dto.password.trim(), 10),
            role: dto.role,
            emailVerified: true, // criado pelo admin já entra verificado
        });

        const saved = await this.userRepository.save(user);
        return this.sanitizeUser(saved);
    }

    async updateUserRole(id: string, dto: UpdateUserRoleDto, actingAdminId: string) {
        if (id === actingAdminId) {
            throw new ForbiddenException('Você não pode alterar seu próprio papel');
        }

        const user = await this.userRepository.findOne({ where: { id }, withDeleted: true });
        if (!user) {
            throw new NotFoundException('Usuário não encontrado');
        }

        user.role = dto.role;
        const saved = await this.userRepository.save(user);
        return this.sanitizeUser(saved);
    }

    async softDeleteUser(id: string, actingAdminId: string) {
        if (id === actingAdminId) {
            throw new ForbiddenException('Você não pode excluir a si mesmo');
        }

        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) {
            throw new NotFoundException('Usuário não encontrado ou já excluído');
        }

        await this.userRepository.softDelete(id);
        return { id, deleted: true };
    }

    async restoreUser(id: string) {
        const user = await this.userRepository.findOne({ where: { id }, withDeleted: true });
        if (!user) {
            throw new NotFoundException('Usuário não encontrado');
        }
        if (!user.deletedAt) {
            throw new BadRequestException('Usuário não está excluído');
        }

        await this.userRepository.restore(id);
        return { id, restored: true };
    }

    // ---------------------------------------------------------------- FILES

    async listFiles(query: ListFilesQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const search = query.search?.trim();

        const qb = this.fileRepository
            .createQueryBuilder('file')
            .orderBy('file.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        if (query.includeDeleted === 'true') {
            qb.withDeleted();
        }

        if (search && search.length >= 1) {
            qb.andWhere('file.originalName ILIKE :search', { search: `%${search}%` });
        }

        const [files, total] = await qb.getManyAndCount();

        // Resolve o username de quem enviou cada arquivo em uma única query.
        const uploaderIds = [...new Set(files.map(f => f.uploadedBy))];
        const uploaders = uploaderIds.length
            ? await this.userRepository.find({ where: { id: In(uploaderIds) }, withDeleted: true })
            : [];
        const uploaderById = new Map(uploaders.map(u => [u.id, u.username]));

        return {
            data: files.map(f => ({
                id: f.id,
                originalName: f.originalName,
                mimeType: f.mimeType,
                size: Number(f.size),
                subjectId: f.subjectId,
                uploadedBy: f.uploadedBy,
                uploaderUsername: uploaderById.get(f.uploadedBy) ?? null,
                isPublic: f.isPublic,
                createdAt: f.createdAt,
                deletedAt: f.deletedAt ?? null,
            })),
            meta: this.buildMeta(page, limit, total),
        };
    }

    async deleteFile(id: string, hard: boolean) {
        const file = await this.fileRepository.findOne({ where: { id }, withDeleted: true });
        if (!file) {
            throw new NotFoundException('Arquivo não encontrado');
        }

        if (hard) {
            // Remoção definitiva: apaga o objeto do R2 e o registro.
            await this.r2Service.deleteObject(file.key).catch(() => {});
            await this.fileRepository.delete(id);
            return { id, deleted: true, hard: true };
        }

        if (file.deletedAt) {
            throw new BadRequestException('Arquivo já está excluído');
        }

        // Soft delete: mantém o objeto no R2 para eventual restauração.
        await this.fileRepository.softDelete(id);
        return { id, deleted: true, hard: false };
    }

    /**
     * URL assinada para o admin visualizar qualquer arquivo (inclusive privado
     * ou soft-deleted), usada na moderação de denúncias.
     */
    async getFileDownloadUrl(id: string): Promise<string> {
        const file = await this.fileRepository.findOne({ where: { id }, withDeleted: true });
        if (!file) {
            throw new NotFoundException('Arquivo não encontrado');
        }
        return this.r2Service.getPresignedDownloadUrl(file.key);
    }

    async restoreFile(id: string) {
        const file = await this.fileRepository.findOne({ where: { id }, withDeleted: true });
        if (!file) {
            throw new NotFoundException('Arquivo não encontrado');
        }
        if (!file.deletedAt) {
            throw new BadRequestException('Arquivo não está excluído');
        }

        await this.fileRepository.restore(id);
        return { id, restored: true };
    }

    // -------------------------------------------------------------- REPORTS

    async listReports(query: ListReportsQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;

        const qb = this.reportRepository
            .createQueryBuilder('report')
            .orderBy('report.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        if (query.status) {
            qb.andWhere('report.status = :status', { status: query.status });
        }

        if (query.targetType) {
            qb.andWhere('report.targetType = :targetType', { targetType: query.targetType });
        }

        const [reports, total] = await qb.getManyAndCount();

        // Enriquecimento em lote: denunciantes, usuários-alvo e arquivos-alvo.
        const reporterIds = [...new Set(reports.map(r => r.reporterId))];
        const targetUserIds = [...new Set(reports.map(r => r.targetUserId).filter((v): v is string => !!v))];
        const targetFileIds = [...new Set(reports.map(r => r.targetFileId).filter((v): v is string => !!v))];

        const [reporters, targetUsers, targetFiles] = await Promise.all([
            reporterIds.length
                ? this.userRepository.find({ where: { id: In(reporterIds) }, withDeleted: true })
                : Promise.resolve([]),
            targetUserIds.length
                ? this.userRepository.find({ where: { id: In(targetUserIds) }, withDeleted: true })
                : Promise.resolve([]),
            targetFileIds.length
                ? this.fileRepository.find({ where: { id: In(targetFileIds) }, withDeleted: true })
                : Promise.resolve([]),
        ]);

        // Resolve os donos (uploaders) dos arquivos denunciados, para exibir o perfil.
        const uploaderIds = [...new Set(targetFiles.map(f => f.uploadedBy))];
        const uploaders = uploaderIds.length
            ? await this.userRepository.find({ where: { id: In(uploaderIds) }, withDeleted: true })
            : [];
        const uploaderById = new Map(uploaders.map(u => [u.id, u]));

        const reporterById = new Map(reporters.map(u => [u.id, u]));
        const targetUserById = new Map(targetUsers.map(u => [u.id, u]));
        const targetFileById = new Map(targetFiles.map(f => [f.id, f]));

        return {
            data: reports.map(r => {
                const reporter = reporterById.get(r.reporterId);
                const targetUser = r.targetUserId ? targetUserById.get(r.targetUserId) : undefined;
                const targetFile = r.targetFileId ? targetFileById.get(r.targetFileId) : undefined;

                return {
                    id: r.id,
                    targetType: r.targetType,
                    reason: r.reason,
                    description: r.description,
                    status: r.status,
                    resolutionNote: r.resolutionNote,
                    resolvedBy: r.resolvedBy,
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt,
                    reporter: reporter
                        ? { id: reporter.id, username: reporter.username }
                        : { id: r.reporterId, username: null },
                    targetUser: targetUser
                        ? { id: targetUser.id, username: targetUser.username, deletedAt: targetUser.deletedAt ?? null }
                        : null,
                    targetFile: targetFile
                        ? (() => {
                            const uploader = uploaderById.get(targetFile.uploadedBy);
                            return {
                                id: targetFile.id,
                                originalName: targetFile.originalName,
                                subjectId: targetFile.subjectId,
                                deletedAt: targetFile.deletedAt ?? null,
                                uploader: uploader
                                    ? { id: uploader.id, username: uploader.username, deletedAt: uploader.deletedAt ?? null }
                                    : null,
                            };
                        })()
                        : null,
                };
            }),
            meta: this.buildMeta(page, limit, total),
        };
    }

    async updateReportStatus(id: string, dto: UpdateReportStatusDto, adminId: string) {
        const report = await this.reportRepository.findOne({ where: { id } });
        if (!report) {
            throw new NotFoundException('Denúncia não encontrada');
        }

        report.status = dto.status;
        report.resolutionNote = dto.resolutionNote?.trim() || null;

        const isTerminal =
            dto.status === ReportStatusEnum.RESOLVED || dto.status === ReportStatusEnum.DISMISSED;
        report.resolvedBy = isTerminal ? adminId : null;

        return this.reportRepository.save(report);
    }

    // ---------------------------------------------------------------- STATS

    async getStats() {
        const [
            totalUsers,
            deletedUsers,
            admins,
            teachers,
            students,
            totalFiles,
            deletedFiles,
            pendingReports,
            totalReports,
        ] = await Promise.all([
            this.userRepository.count(),
            this.userRepository
                .createQueryBuilder('user')
                .withDeleted()
                .where('user.deleted_at IS NOT NULL')
                .getCount(),
            this.userRepository.count({ where: { role: UserRoleEnum.ADMIN } }),
            this.userRepository.count({ where: { role: UserRoleEnum.TEACHER } }),
            this.userRepository.count({ where: { role: UserRoleEnum.STUDENT } }),
            this.fileRepository.count(),
            this.fileRepository
                .createQueryBuilder('file')
                .withDeleted()
                .where('file.deleted_at IS NOT NULL')
                .getCount(),
            this.reportRepository.count({ where: { status: ReportStatusEnum.PENDING } }),
            this.reportRepository.count(),
        ]);

        return {
            users: {
                total: totalUsers,
                deleted: deletedUsers,
                byRole: { admins, teachers, students },
            },
            files: {
                total: totalFiles,
                deleted: deletedFiles,
            },
            reports: {
                total: totalReports,
                pending: pendingReports,
            },
        };
    }
}
