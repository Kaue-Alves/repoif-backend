import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Metadados de um anexo já enviado ao R2 (key obtida via upload-url). */
export class AttachmentDto {
    @IsString()
    @MaxLength(512)
    attachmentKey!: string;

    @IsString()
    @MaxLength(255)
    attachmentName!: string;

    @IsString()
    @MaxLength(100)
    attachmentMimeType!: string;

    @IsNumber()
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
    @IsString()
    @MaxLength(255)
    filename!: string;

    @IsString()
    @MaxLength(100)
    contentType!: string;
}

export class RequestSubmissionUploadUrlDto {
    @IsString()
    @MaxLength(255)
    filename!: string;

    @IsString()
    @MaxLength(100)
    contentType!: string;
}

export class ConfirmSubmissionDto {
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
}
