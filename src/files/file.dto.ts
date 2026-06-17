import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RequestUploadUrlDto {
    @IsString()
    @MaxLength(255)
    filename!: string;

    @IsString()
    @MaxLength(100)
    contentType!: string;

    @IsUUID()
    subjectId!: string;

    @IsBoolean()
    @IsOptional()
    isPublic?: boolean;
}

export class ConfirmUploadDto {
    @IsString()
    @MaxLength(512)
    key!: string;

    @IsString()
    @MaxLength(255)
    originalName!: string;

    @IsString()
    @MaxLength(100)
    mimeType!: string;

    @IsNumber()
    size!: number;

    @IsUUID()
    subjectId!: string;

    @IsBoolean()
    @IsOptional()
    isPublic?: boolean;
}

export class UpdateFileDto {
    @IsString()
    @MaxLength(255)
    @IsOptional()
    originalName?: string;

    @IsBoolean()
    @IsOptional()
    isPublic?: boolean;
}
