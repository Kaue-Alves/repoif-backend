import { IsDate, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class SubjectDto {
    @IsUUID()
    @IsOptional()
    id!: string;

    @IsString()
    @MaxLength(255)
    name!: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsUUID()
    @IsOptional()
    teacherId!: string;

    @IsDate()
    @IsOptional()
    createdAt!: Date;

    @IsDate()
    @IsOptional()
    updatedAt!: Date;
}