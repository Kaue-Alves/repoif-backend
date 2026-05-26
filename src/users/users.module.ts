import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/db/entities/user.entity';
import { TokenEntity } from 'src/db/entities/token.entity';

@Module({
  controllers: [UsersController],
  imports: [TypeOrmModule.forFeature([UserEntity, TokenEntity])],
  exports: [UsersService],
  providers: [UsersService]
})
export class UsersModule {}
