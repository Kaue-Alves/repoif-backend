import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersModule } from 'src/users/users.module';

@Module({
  providers: [AuthService],
  imports: [JwtModule.registerAsync({
    global: true,
    imports: [],
    useFactory: async (configService: ConfigService) => ({
      secret: configService.get<string>('JWT_SECRET'),
      signOptions: {
        expiresIn: (() => {
          const expirationTime = configService.get<string>('JWT_EXPIRATION_TIME');
          const expirationTimeInSeconds = parseInt(expirationTime ?? '', 10);

          if (isNaN(expirationTimeInSeconds) || expirationTimeInSeconds <= 0) {
            throw new Error(
              `JWT_EXPIRATION_TIME inválido: "${expirationTime}". Use um número > 0 (em segundos).`,
            );
          }

          return expirationTimeInSeconds;
        })(),
      },
    }),
    inject: [ConfigService]
  }), UsersModule],
  controllers: [AuthController]
})
export class AuthModule {}
