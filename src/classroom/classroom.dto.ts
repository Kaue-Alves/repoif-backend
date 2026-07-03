import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

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
