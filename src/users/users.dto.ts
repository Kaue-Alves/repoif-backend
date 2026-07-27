import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

import { UserRoleEnum } from "src/common/enums/user-role.enum";

export class UserDto {

    @IsUUID()
    @IsOptional()
    id!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(144)
    username!: string;

    @IsString()
    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(8)
    password!: string;

    @IsIn([UserRoleEnum.TEACHER, UserRoleEnum.STUDENT], {
        message: 'O papel deve ser TEACHER ou STUDENT no cadastro público',
    })
    role!: UserRoleEnum;

    @IsBoolean()
    @IsOptional()
    emailVerified!: boolean
}

export interface PublicUserDto {
    id: string;
    username: string;
    name: string | null;
    role: UserRoleEnum;
}
