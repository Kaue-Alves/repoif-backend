import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { ClassroomModule } from 'src/classroom/classroom.module';
import { FileEntity } from 'src/db/entities/file.entity';
import { AssignmentEntity } from 'src/db/entities/assignment.entity';
import { AssignmentSubmissionEntity } from 'src/db/entities/assignment-submission.entity';
import { ClassroomSubjectEntity } from 'src/db/entities/classroom-subject.entity';
import { StorageCleanupModule } from 'src/storage-cleanup/storage-cleanup.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubjectEntity,
      UserEntity,
      FileEntity,
      AssignmentEntity,
      AssignmentSubmissionEntity,
      ClassroomSubjectEntity,
    ]),
    ClassroomModule,
    StorageCleanupModule,
  ],
  controllers: [SubjectController],
  providers: [SubjectService],
  exports: [SubjectService],
})
export class SubjectModule {}
