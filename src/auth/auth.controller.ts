import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './auth.dto';
import { EMAIL_THROTTLE, LOGIN_THROTTLE } from 'src/common/security';

@Controller('auth')
export class AuthController {

    constructor(private readonly authService: AuthService){}

    @Throttle(LOGIN_THROTTLE)
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

    @Throttle(EMAIL_THROTTLE)
    @HttpCode(HttpStatus.OK)
    @Post('forgot-password')
    async forgotPassword(@Body('email') email: string) {
        await this.authService.forgotPassword(email);
        return { message: 'Se o email existir, enviaremos instruções de redefinição.' };
    }

    @Throttle(LOGIN_THROTTLE)
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
