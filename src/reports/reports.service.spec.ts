import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ReportReasonEnum } from 'src/common/enums/report-reason.enum';
import { ReportStatusEnum } from 'src/common/enums/report-status.enum';
import { ReportTargetTypeEnum } from 'src/common/enums/report-target-type.enum';
import { FileEntity } from 'src/db/entities/file.entity';
import { ReportEntity } from 'src/db/entities/report.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { CreateReportDto } from './report.dto';
import { ReportsService } from './reports.service';

const REPORTER = '11111111-1111-4111-8111-111111111111';
const TARGET_USER = '22222222-2222-4222-8222-222222222222';
const TARGET_FILE = '33333333-3333-4333-8333-333333333333';

function buildService(options: {
    targetUser?: UserEntity | null;
    targetFile?: FileEntity | null;
    existing?: ReportEntity | null;
} = {}) {
    const reports: ReportEntity[] = [];
    const reportRepository = {
        findOne: jest.fn(async () => options.existing ?? null),
        create: jest.fn((data: Partial<ReportEntity>) => data as ReportEntity),
        save: jest.fn(async (report: ReportEntity) => {
            if (!report.id) report.id = 'created-report';
            reports.push(report);
            return report;
        }),
        find: jest.fn(async ({ where }: { where: { reporterId: string } }) =>
            reports.filter(report => report.reporterId === where.reporterId)),
    };
    const userRepository = {
        findOne: jest.fn(async ({ where }: { where: { id: string } }) => {
            if (where.id === TARGET_USER) {
                return options.targetUser === undefined
                    ? ({ id: TARGET_USER, username: 'alvo' } as UserEntity)
                    : options.targetUser;
            }
            if (where.id === REPORTER) return { id: REPORTER, username: 'autor' } as UserEntity;
            return null;
        }),
    };
    const fileRepository = {
        findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
            where.id === TARGET_FILE
                ? options.targetFile === undefined
                    ? ({ id: TARGET_FILE } as FileEntity)
                    : options.targetFile
                : null),
    };
    const service = new ReportsService(
        reportRepository as never,
        userRepository as never,
        fileRepository as never,
    );
    return { service, reportRepository, reports };
}

const userReport = {
    targetType: ReportTargetTypeEnum.USER,
    targetUserId: TARGET_USER,
    reason: ReportReasonEnum.HARASSMENT,
    description: '  comportamento inadequado  ',
};

const fileReport = {
    targetType: ReportTargetTypeEnum.FILE,
    targetFileId: TARGET_FILE,
    reason: ReportReasonEnum.COPYRIGHT,
};

describe('CreateReportDto', () => {
    it('DEN-03 rejeita alvo, motivo e UUID inválidos no contrato HTTP', () => {
        const errors = validateSync(plainToInstance(CreateReportDto, {
            targetType: 'OTHER',
            targetUserId: 'invalid',
            reason: 'INVALID',
        }));
        expect(errors.map(error => error.property)).toEqual(
            expect.arrayContaining(['targetType', 'targetUserId', 'reason']),
        );
    });
});

describe('ReportsService - criação', () => {
    it('DEN-01 cria denúncia de usuário existente, pendente e normalizada', async () => {
        const { service } = buildService();
        await expect(service.create(userReport, REPORTER)).resolves.toMatchObject({
            id: 'created-report',
            reporterId: REPORTER,
            targetType: ReportTargetTypeEnum.USER,
            targetUserId: TARGET_USER,
            targetFileId: null,
            description: 'comportamento inadequado',
            status: ReportStatusEnum.PENDING,
        });
    });

    it('DEN-01 rejeita usuário inexistente e autodenúncia', async () => {
        const missing = buildService({ targetUser: null });
        const self = buildService({ targetUser: { id: REPORTER } as UserEntity });
        await expect(missing.service.create(userReport, REPORTER))
            .rejects.toBeInstanceOf(NotFoundException);
        await expect(self.service.create(
            { ...userReport, targetUserId: REPORTER },
            REPORTER,
        )).rejects.toBeInstanceOf(BadRequestException);
    });

    it('DEN-02 cria denúncia de arquivo existente e rejeita inexistente', async () => {
        const found = buildService();
        const missing = buildService({ targetFile: null });
        await expect(found.service.create(fileReport, REPORTER)).resolves.toMatchObject({
            targetFileId: TARGET_FILE,
            targetUserId: null,
            status: ReportStatusEnum.PENDING,
        });
        await expect(missing.service.create(fileReport, REPORTER))
            .rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
        [{ ...userReport, targetUserId: undefined }],
        [{ ...userReport, targetFileId: TARGET_FILE }],
        [{ ...fileReport, targetFileId: undefined }],
        [{ ...fileReport, targetUserId: TARGET_USER }],
    ])('DEN-03 exige exatamente o identificador correspondente ao tipo: %o', async dto => {
        const { service } = buildService();
        await expect(service.create(dto as never, REPORTER)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('DEN-04 rejeita denúncia pendente já existente', async () => {
        const { service, reportRepository } = buildService({
            existing: { id: 'existing', status: ReportStatusEnum.PENDING } as ReportEntity,
        });
        await expect(service.create(userReport, REPORTER)).rejects.toBeInstanceOf(ConflictException);
        expect(reportRepository.save).not.toHaveBeenCalled();
    });

    it('DEN-04 converte colisão concorrente do índice em conflito controlado', async () => {
        const { service, reportRepository } = buildService();
        reportRepository.save.mockRejectedValueOnce({ driverError: { code: '23505' } });
        await expect(service.create(userReport, REPORTER)).rejects.toBeInstanceOf(ConflictException);
    });

    it('DEN-04 preserva falhas de banco que não são duplicidade', async () => {
        const { service, reportRepository } = buildService();
        reportRepository.save.mockRejectedValueOnce(new Error('database unavailable'));
        await expect(service.create(userReport, REPORTER)).rejects.toThrow('database unavailable');
    });
});

describe('ReportsService - consulta', () => {
    it('DEN-05 consulta somente denúncias do autor autenticado em ordem decrescente', async () => {
        const { service, reportRepository } = buildService();
        await service.findMyReports(REPORTER);
        expect(reportRepository.find).toHaveBeenCalledWith({
            where: { reporterId: REPORTER },
            order: { createdAt: 'DESC' },
        });
    });
});
