import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { ReportReasonEnum } from 'src/common/enums/report-reason.enum';
import { ReportTargetTypeEnum } from 'src/common/enums/report-target-type.enum';

export class CreateReportDto {
    @IsEnum(ReportTargetTypeEnum)
    targetType!: ReportTargetTypeEnum;

    @IsUUID()
    @IsOptional()
    targetUserId?: string;

    @IsUUID()
    @IsOptional()
    targetFileId?: string;

    @IsEnum(ReportReasonEnum)
    reason!: ReportReasonEnum;

    @IsString()
    @IsOptional()
    @MaxLength(1000)
    description?: string;
}
