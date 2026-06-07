import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './auth.dto';

@Controller('auth')
export class AuthController {

    constructor(private readonly authService: AuthService){}
    
    @HttpCode(HttpStatus.OK)
    @Post('login')
    async signIn(
        @Body('username') username: string,
        @Body('email') email: string,
        @Body('password') password: string
    ): Promise<AuthResponseDto> {

        return await this.authService.signIn(username, email, password)
        
    }

    @Get('verify-email')
    async verifyEmail(@Query('token') token: string) {
        await this.authService.verifyEmail(token)
    }

    @HttpCode(HttpStatus.OK)
    @Post('forgot-password')
    async forgotPassword(@Body('email') email: string) {
        await this.authService.forgotPassword(email);
        return { message: 'Se o email existir, enviaremos instruções de redefinição.' };
    }

    @HttpCode(HttpStatus.OK)
    @Post('reset-password')
    async resetPassword(
        @Body('token') token: string,
        @Body('newPassword') newPassword: string,
    ) {
        await this.authService.resetPassword(token, newPassword);
        return { message: 'Senha redefinida com sucesso' };
    }
}
