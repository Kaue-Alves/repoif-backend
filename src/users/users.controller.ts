import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserDto } from './users.dto';
import { UsersService } from './users.service';
import { AuthGuard } from 'src/auth/auth.guard';

@Controller('users')
export class UsersController {

    constructor(private readonly userService: UsersService){}
    
    @Post()
    async create(@Body() user: UserDto) {
        return await this.userService.create(user);
    }

    @UseGuards(AuthGuard)
    @Get()
    async findAllUsers(): Promise<UserDto[] | null> {
        return await this.userService.findAllUsers();
    }
}
