import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ClassroomController } from './classroom.controller';
import { ClassroomService } from './classroom.service';
import { ClassroomEntity } from 'src/db/entities/classroom.entity';
import { ClassroomMemberEntity } from 'src/db/entities/classroom-member.entity';
import { ClassroomSubjectEntity } from 'src/db/entities/classroom-subject.entity';
import { ClassroomInviteEntity } from 'src/db/entities/classroom-invite.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassroomEntity,
      ClassroomMemberEntity,
      ClassroomSubjectEntity,
      ClassroomInviteEntity,
      SubjectEntity,
      UserEntity,
    ]),
    MailModule,
  ],
  controllers: [ClassroomController],
  providers: [ClassroomService],
  exports: [ClassroomService],
})
export class ClassroomModule {}
