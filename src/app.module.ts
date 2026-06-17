import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { MailModule } from './mail/mail.module';
import { R2Module } from './r2/r2.module';
import { SubjectModule } from './subject/subject.module';
import { FilesModule } from './files/files.module';

@Module({
  imports: [UsersModule, AuthModule, ConfigModule.forRoot({isGlobal: true, ignoreEnvFile: true}), DbModule, MailModule, R2Module, SubjectModule, FilesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
