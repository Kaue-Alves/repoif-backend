import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ReportEntity } from 'src/db/entities/report.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { FileEntity } from 'src/db/entities/file.entity';
import { ReportStatusEnum } from 'src/common/enums/report-status.enum';
import { ReportTargetTypeEnum } from 'src/common/enums/report-target-type.enum';
import { CreateReportDto } from './report.dto';

@Injectable()
export class ReportsService {

    constructor(
        @InjectRepository(ReportEntity)
        private readonly reportRepository: Repository<ReportEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,

        @InjectRepository(FileEntity)
        private readonly fileRepository: Repository<FileEntity>,
    ) {}

    private isUniqueViolation(error: unknown): boolean {
        const details = error as { code?: string; driverError?: { code?: string } };
        return details?.code === '23505' || details?.driverError?.code === '23505';
    }

    async create(dto: CreateReportDto, reporterId: string): Promise<ReportEntity> {
        let targetUserId: string | null = null;
        let targetFileId: string | null = null;

        if (dto.targetType === ReportTargetTypeEnum.USER) {
            if (!dto.targetUserId || dto.targetFileId) {
                throw new BadRequestException(
                    'Denúncia de usuário exige somente targetUserId',
                );
            }

            const target = await this.userRepository.findOne({ where: { id: dto.targetUserId } });
            if (!target) {
                throw new NotFoundException('Usuário denunciado não encontrado');
            }

            if (target.id === reporterId) {
                throw new BadRequestException('Você não pode denunciar a si mesmo');
            }

            targetUserId = target.id;
        } else {
            if (!dto.targetFileId || dto.targetUserId) {
                throw new BadRequestException(
                    'Denúncia de arquivo exige somente targetFileId',
                );
            }

            const target = await this.fileRepository.findOne({ where: { id: dto.targetFileId } });
            if (!target) {
                throw new NotFoundException('Arquivo denunciado não encontrado');
            }

            targetFileId = target.id;
        }

        // Evita denúncias duplicadas pendentes do mesmo usuário sobre o mesmo alvo
        const existing = await this.reportRepository.findOne({
            where: {
                reporterId,
                status: ReportStatusEnum.PENDING,
                ...(targetUserId ? { targetUserId } : { targetFileId: targetFileId as string }),
            },
        });

        if (existing) {
            throw new ConflictException('Você já possui uma denúncia pendente para este alvo');
        }

        const report = this.reportRepository.create({
            reporterId,
            targetType: dto.targetType,
            targetUserId,
            targetFileId,
            reason: dto.reason,
            description: dto.description?.trim() || null,
            status: ReportStatusEnum.PENDING,
        });

        try {
            return await this.reportRepository.save(report);
        } catch (error) {
            if (this.isUniqueViolation(error)) {
                throw new ConflictException('Você já possui uma denúncia pendente para este alvo');
            }
            throw error;
        }
    }

    async findMyReports(reporterId: string): Promise<ReportEntity[]> {
        return this.reportRepository.find({
            where: { reporterId },
            order: { createdAt: 'DESC' },
        });
    }
}
