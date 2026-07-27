import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PublicUserDto, UserDto } from './users.dto';
import { ChangePasswordDto, UpdateProfileDto } from './update-profile.dto';
import { ListTeachersDto } from './list-teachers.dto';
import { UsersService } from './users.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';

@Controller('users')
export class UsersController {

    constructor(
        private readonly userService: UsersService,
    ){}

    @Post()
    async create(@Body() user: UserDto) {
        return await this.userService.create(user);
    }

    @UseGuards(AuthGuard, RolesGuard)
    @Roles(UserRoleEnum.ADMIN)
    @Get()
    async findAllUsers(): Promise<PublicUserDto[]> {
        return await this.userService.findAllUsers();
    }

    @UseGuards(AuthGuard)
    @Get('teachers')
    async listTeachers(@Query() query: ListTeachersDto, @Req() request: any) {
        return await this.userService.findTeachers(query, { userId: request.user.sub, role: request.user.role });
    }

    @UseGuards(AuthGuard)
    @Get('search')
    async searchTeachers(@Query('q') query: string, @Req() request: any) {
        if (!query || query.trim().length < 2) {
            return [];
        }
        return await this.userService.searchTeachers(query, { userId: request.user.sub, role: request.user.role });
    }

    /** Altera o próprio perfil. O `username` não é alterável — ver UpdateProfileDto. */
    @UseGuards(AuthGuard)
    @Patch('me')
    async updateMe(@Body() dto: UpdateProfileDto, @Req() request: any) {
        return await this.userService.updateProfile(request.user.sub, dto);
    }

    @UseGuards(AuthGuard)
    @HttpCode(HttpStatus.OK)
    @Patch('me/password')
    async changePassword(@Body() dto: ChangePasswordDto, @Req() request: any) {
        await this.userService.changePassword(request.user.sub, dto);
        return { message: 'Senha alterada com sucesso.' };
    }

    @UseGuards(AuthGuard)
    @Get(':username')
    async getProfile(@Param('username') username: string, @Req() request: any) {
        return await this.userService.getProfile(username, { userId: request.user.sub, role: request.user.role });
    }

    // Rota futura: /users/:username/:subjectName
    @Get(':username/:subjectName')
    async getSubjectFiles(@Param('username') username: string, @Param('subjectName') subjectName: string) {
        return {
            message: `Em breve: arquivos da disciplina ${subjectName} do usuário ${username}`,
            files: []
        };
    }
}
