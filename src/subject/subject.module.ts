import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SubjectEntity, UserEntity])],
  controllers: [SubjectController],
  providers: [SubjectService],
  exports: [SubjectService],
})
export class SubjectModule {}

