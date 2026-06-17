import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
    imports: [TypeOrmModule.forRootAsync({
        useFactory: async (ConfigService: ConfigService) => ({
            type: 'postgres',
            url: ConfigService.get<string>('DATABASE_URL'),
            entities: [__dirname + '/entities/**'],
            migrations: [__dirname + '/migrations/*.ts'],
            synchronize: false,
            ssl: { rejectUnauthorized: false }
        }),
        inject: [ConfigService]
    })]
})
export class DbModule {}
