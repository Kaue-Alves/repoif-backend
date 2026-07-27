import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthResponseDto } from './auth.dto';
import { compareSync } from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';

/**
 * Mensagens de login. O `httpClient` do frontend exibe `data.message` cru ao usuário
 * (regra 6f), então elas são texto de UI — precisam sair em português e sem jargão.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Usuário ou senha inválidos.';
export const EMAIL_NOT_VERIFIED_MESSAGE =
    'Sua conta ainda não foi verificada. Confira seu e-mail ou peça um novo link de verificação.';

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

    async resendVerification(email: string): Promise<void> {
        await this.usersService.resendEmailVerification(email);
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
        await this.usersService.resetPassword(token, newPassword);
    }
    
    async signIn(username: string, email: string, password: string): Promise<AuthResponseDto> {
        const normalizedUsername = username?.trim();
        const normalizedEmail = email?.trim();
        const normalizedPassword = password?.trim();

        if ((!normalizedUsername && !normalizedEmail) || !normalizedPassword) {
            throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
        }

        const foundUser = normalizedUsername
            ? await this.usersService.findByUsername(normalizedUsername)
            : await this.usersService.findByEmail(normalizedEmail);

        // Mensagem única para usuário inexistente e senha errada: dizer qual dos dois
        // falhou entregaria de brinde quais contas existem.
        if (!foundUser || !compareSync(normalizedPassword, foundUser.password)) {
            throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
        }

        if (!foundUser.emailVerified) {
            throw new UnauthorizedException(EMAIL_NOT_VERIFIED_MESSAGE);
        }

        const payload = {sub: foundUser.id, username: foundUser.username, email: foundUser.email, role: foundUser.role};

        const token = this.jwtService.sign(payload)

        return {token, expiresIn: this.jwtExpirationTimeInSeconds}
    }
}
