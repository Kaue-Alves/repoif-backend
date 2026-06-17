import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UserDto } from './users.dto';
import { UsersService } from './users.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Controller('users')
export class UsersController {

    constructor(
        private readonly userService: UsersService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService
    ){}
    
    @Post()
    async create(@Body() user: UserDto) {
        return await this.userService.create(user);
    }

    @UseGuards(AuthGuard)
    @Get()
    async findAllUsers(): Promise<UserDto[] | null> {
        return await this.userService.findAllUsers();
    }

    @Get('search')
    async searchTeachers(@Query('q') query: string) {
        if (!query || query.trim().length < 2) {
            return [];
        }
        return await this.userService.searchTeachers(query);
    }

    @Get(':username')
    async getProfile(@Param('username') username: string, @Req() request: any) {
        let requestingUserId: string | undefined;

        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            try {
                const payload = await this.jwtService.verifyAsync(token, {
                    secret: this.configService.get<string>('JWT_SECRET'),
                });
                requestingUserId = payload.sub;
            } catch (e) {
                // Ignore invalid token, treat as guest
            }
        }

        return await this.userService.getProfile(username, requestingUserId);
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
