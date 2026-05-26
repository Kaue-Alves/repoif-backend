import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/db/entities/user.entity';
import { TokenEntity } from 'src/db/entities/token.entity';
import { MailModule } from 'src/mail/mail.module';

@Module({
  controllers: [UsersController],
  imports: [TypeOrmModule.forFeature([UserEntity, TokenEntity]), MailModule],
  exports: [UsersService],
  providers: [UsersService]
})
export class UsersModule {}
