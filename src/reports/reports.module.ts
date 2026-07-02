import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ReportEntity } from 'src/db/entities/report.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { FileEntity } from 'src/db/entities/file.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([ReportEntity, UserEntity, FileEntity]),
        ConfigModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [ReportsService],
    controllers: [ReportsController],
})
export class ReportsModule {}
