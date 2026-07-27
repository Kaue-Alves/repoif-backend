import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SubjectDto {
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    name!: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    isPublic?: boolean;
}

export class UpdateSubjectDto {
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsBoolean()
    @IsOptional()
    isPublic?: boolean;
}
