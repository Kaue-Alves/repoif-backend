import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Campos que o próprio usuário pode alterar no seu perfil. */
export class UpdateProfileDto {
    /**
     * Nome de exibição. String vazia é como se apaga o nome (a UI volta a mostrar o
     * `username`), por isso o mínimo é 0 e não 1.
     */
    @IsOptional()
    @IsString()
    @MaxLength(120)
    name?: string;
}

export class ChangePasswordDto {
    /**
     * Exigir a senha atual é o que impede que uma aba esquecida aberta vire uma
     * tomada de conta: sem isso, bastaria alcançar o formulário.
     */
    @IsString()
    @MinLength(1)
    currentPassword!: string;

    @IsString()
    @MinLength(8)
    @MaxLength(72) // bcrypt trunca acima de 72 bytes; recusar é melhor que truncar em silêncio.
    newPassword!: string;
}
