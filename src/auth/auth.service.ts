import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthResponseDto } from './auth.dto';
import { compareSync } from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';

@Injectable()
export class AuthService {
    private jwtExpirationTimeInSeconds: number;

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService
    ) {
        const expirationTime = this.configService.get<string>('JWT_EXPIRATION_TIME');
        const expirationTimeInSeconds = parseInt(expirationTime ?? '', 10);

        if (isNaN(expirationTimeInSeconds) || expirationTimeInSeconds <= 0) {
            throw new Error(
                `JWT_EXPIRATION_TIME inválido: "${expirationTime}". Use um número > 0 (em segundos).`,
            );
        }

        this.jwtExpirationTimeInSeconds = expirationTimeInSeconds;
    }
    
    async verifyEmail(token: string) {
        await this.usersService.verifyEmail(token);
    }

    async forgotPassword(email: string): Promise<void> {
        await this.usersService.requestPasswordReset(email);
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
        await this.usersService.resetPassword(token, newPassword);
    }
    
    async signIn(username: string, email: string, password: string): Promise<AuthResponseDto> {

        if (!username && !email) {
            throw new UnauthorizedException();
        }

        const foundUser = username
            ? await this.usersService.findByUsername(username.trim())
            : await this.usersService.findByEmail(email.trim());

        if (!foundUser || !compareSync(password.trim(), foundUser.password)) {
            throw new UnauthorizedException();
        }

        if (!foundUser.emailVerified) {
            throw new UnauthorizedException('Email not verified');
        }

        const payload = {sub: foundUser.id, username: foundUser.username, email: foundUser.email, role: foundUser.role};

        const token = this.jwtService.sign(payload)

        return {token, expiresIn: this.jwtExpirationTimeInSeconds}
    }
}
