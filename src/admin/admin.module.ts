import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { UserEntity } from 'src/db/entities/user.entity';
import { FileEntity } from 'src/db/entities/file.entity';
import { ReportEntity } from 'src/db/entities/report.entity';
import { R2Module } from 'src/r2/r2.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([UserEntity, FileEntity, ReportEntity]),
        R2Module,
        ConfigModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [AdminService],
    controllers: [AdminController],
})
export class AdminModule {}
