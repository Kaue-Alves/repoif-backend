import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

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

    @IsEnum(UserRoleEnum)
    role!: UserRoleEnum;
}