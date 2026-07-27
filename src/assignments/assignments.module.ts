import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssignmentEntity } from 'src/db/entities/assignment.entity';
import { AssignmentSubmissionEntity } from 'src/db/entities/assignment-submission.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { R2Module } from 'src/r2/r2.module';
import { MailModule } from 'src/mail/mail.module';
import { ClassroomModule } from 'src/classroom/classroom.module';
import { StorageCleanupModule } from 'src/storage-cleanup/storage-cleanup.module';

import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssignmentEntity, AssignmentSubmissionEntity, SubjectEntity, UserEntity]),
    R2Module,
    MailModule,
    ClassroomModule,
    StorageCleanupModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
