import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { Type } from "class-transformer";

export class CreateClassroomDto {
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    name!: string;

    @IsString()
    @IsOptional()
    description?: string;
}

export class UpdateClassroomDto {
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;
}

/**
 * Adiciona uma disciplina à turma. Pode-se vincular uma disciplina
 * existente (subjectId) ou criar uma nova informando o nome.
 */
export class AddSubjectToClassroomDto {
    @IsUUID()
    @IsOptional()
    subjectId?: string;

    @IsString()
    @MaxLength(255)
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    description?: string;
}

/** Validades aceitas para o link de convite, em minutos. */
export const INVITE_TTL_OPTIONS_MINUTES = [15, 30, 60, 360, 1440, 10080] as const;

export const DEFAULT_INVITE_TTL_MINUTES = 30;

/**
 * Gera o link de convite. O professor escolhe a validade entre as opções
 * fixas — valor livre viraria um convite eterno digitado sem querer.
 */
export class CreateInviteDto {
    @IsInt()
    @IsIn([...INVITE_TTL_OPTIONS_MINUTES])
    @Type(() => Number)
    @IsOptional()
    expiresInMinutes?: number;
}

/**
 * Adiciona um aluno à turma por nome de usuário OU email.
 */
export class AddMemberDto {
    @IsString()
    @IsOptional()
    username?: string;

    @IsEmail()
    @IsOptional()
    email?: string;
}
