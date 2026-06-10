import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { MailModule } from './mail/mail.module';
import { TesteGuardaModule } from './teste-guarda/teste-guarda.module';
import { R2Module } from './r2/r2.module';
import { SubjectModule } from './subject/subject.module';

@Module({
  imports: [UsersModule, AuthModule, ConfigModule.forRoot({isGlobal: true, ignoreEnvFile: true}), DbModule, MailModule, TesteGuardaModule, R2Module, SubjectModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
