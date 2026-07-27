import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { ReportStatusEnum } from 'src/common/enums/report-status.enum';
import { ReportTargetTypeEnum } from 'src/common/enums/report-target-type.enum';

export class CreateUserByAdminDto {
    @IsString()
    @MinLength(3)
    @MaxLength(144)
    username!: string;

    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(8)
    password!: string;

    @IsEnum(UserRoleEnum)
    role!: UserRoleEnum;
}

export class UpdateUserRoleDto {
    @IsEnum(UserRoleEnum)
    role!: UserRoleEnum;
}

export class UpdateReportStatusDto {
    @IsEnum(ReportStatusEnum)
    status!: ReportStatusEnum;

    @IsString()
    @IsOptional()
    @MaxLength(1000)
    resolutionNote?: string;
}

export class ListUsersQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 20;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(UserRoleEnum)
    role?: UserRoleEnum;

    @IsOptional()
    @IsIn(['true', 'false'])
    includeDeleted?: string;
}

export class ListFilesQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 20;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsIn(['true', 'false'])
    includeDeleted?: string;
}

export class ListReportsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit: number = 20;

    @IsOptional()
    @IsEnum(ReportStatusEnum)
    status?: ReportStatusEnum;

    @IsOptional()
    @IsEnum(ReportTargetTypeEnum)
    targetType?: ReportTargetTypeEnum;
}
