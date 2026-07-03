import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { FileEntity } from 'src/db/entities/file.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { R2Module } from 'src/r2/r2.module';
import { ClassroomModule } from 'src/classroom/classroom.module';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([FileEntity, SubjectEntity, UserEntity]),
        R2Module,
        ClassroomModule,
        ConfigModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [FilesService],
    controllers: [FilesController],
})
export class FilesModule {}
