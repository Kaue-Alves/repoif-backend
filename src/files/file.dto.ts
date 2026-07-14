import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { IsSafeFilename } from 'src/common/validators/safe-filename.validator';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MESSAGE } from 'src/common/upload-limits';

export class RequestUploadUrlDto {
    @IsString()
    @MaxLength(255)
    @IsSafeFilename()
    filename!: string;

    @IsString()
    @MaxLength(100)
    contentType!: string;

    /**
     * Tamanho declarado. Vira `ContentLength` na URL pré-assinada, então mentir aqui não
     * ajuda: o R2 recusa um corpo que não bata com o valor assinado.
     */
    @IsInt()
    @Min(1)
    @Max(MAX_UPLOAD_BYTES, { message: MAX_UPLOAD_MESSAGE })
    size!: number;

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
    @IsSafeFilename()
    originalName!: string;

    @IsString()
    @MaxLength(100)
    mimeType!: string;

    @IsInt()
    @Min(1)
    @Max(MAX_UPLOAD_BYTES, { message: MAX_UPLOAD_MESSAGE })
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
    @IsSafeFilename()
    @IsOptional()
    originalName?: string;

    @IsBoolean()
    @IsOptional()
    isPublic?: boolean;
}
