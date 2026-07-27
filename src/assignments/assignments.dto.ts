import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsSafeFilename } from 'src/common/validators/safe-filename.validator';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE } from 'src/common/upload-limits';

/** Metadados de um anexo já enviado ao R2 (key obtida via upload-url). */
export class AttachmentDto {
    @IsString()
    @MaxLength(2048)
    uploadProof!: string;

    @IsString()
    @MaxLength(512)
    attachmentKey!: string;

    @IsString()
    @MaxLength(255)
    @IsSafeFilename()
    attachmentName!: string;

    @IsString()
    @MaxLength(100)
    attachmentMimeType!: string;

    @IsInt()
    @Min(1)
    @Max(MAX_UPLOAD_BYTES, { message: MAX_UPLOAD_MESSAGE })
    attachmentSize!: number;
}

export class CreateAssignmentDto {
    @IsUUID()
    subjectId!: string;

    @IsString()
    @MaxLength(255)
    title!: string;

    @IsString()
    @IsOptional()
    description?: string;

    /** Data limite (ISO 8601). */
    @IsDateString()
    dueDate!: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => AttachmentDto)
    attachment?: AttachmentDto;
}

export class UpdateAssignmentDto {
    @IsString()
    @MaxLength(255)
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsDateString()
    @IsOptional()
    dueDate?: string;

    /** Novo anexo (substitui o anterior, se houver). */
    @IsOptional()
    @ValidateNested()
    @Type(() => AttachmentDto)
    attachment?: AttachmentDto;

    /** Remove o anexo atual. */
    @IsBoolean()
    @IsOptional()
    removeAttachment?: boolean;
}

export class RequestAttachmentUploadUrlDto {
    @IsUUID()
    subjectId!: string;

    @IsString()
    @MaxLength(255)
    @IsSafeFilename()
    filename!: string;

    @IsString()
    @MaxLength(100)
    contentType!: string;

    @IsInt()
    @Min(1)
    @Max(MAX_UPLOAD_BYTES, { message: MAX_UPLOAD_MESSAGE })
    size!: number;
}

export class RequestSubmissionUploadUrlDto {
    @IsString()
    @MaxLength(255)
    @IsSafeFilename()
    filename!: string;

    @IsString()
    @MaxLength(100)
    contentType!: string;

    @IsInt()
    @Min(1)
    @Max(MAX_UPLOAD_BYTES, { message: MAX_UPLOAD_MESSAGE })
    size!: number;
}

export class ConfirmSubmissionDto {
    @IsString()
    @MaxLength(2048)
    uploadProof!: string;

    @IsString()
    @MaxLength(512)
    key!: string;

    @IsString()
    @MaxLength(255)
    @IsSafeFilename()
    originalName!: string;

    @IsString()
    @MaxLength(100)
    mimeType!: string;

    @IsInt()
    @Min(1)
    @Max(MAX_UPLOAD_BYTES, { message: MAX_UPLOAD_MESSAGE })
    size!: number;
}
