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
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { ClassroomModule } from './classroom/classroom.module';
import { AssignmentsModule } from './assignments/assignments.module';

@Module({
  imports: [UsersModule, AuthModule, ConfigModule.forRoot({isGlobal: true}), DbModule, MailModule, R2Module, SubjectModule, FilesModule, ReportsModule, AdminModule, ClassroomModule, AssignmentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
