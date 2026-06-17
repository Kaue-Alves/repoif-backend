import { ConfigService } from '@nestjs/config';
import {config} from 'dotenv'
import { DataSource, DataSourceOptions } from 'typeorm';

config();

const configService = new ConfigService()

const dataSourceOptions: DataSourceOptions = {
    type: 'postgres',
    url: configService.get<string>('DATABASE_URL'),
    entities: [],
    migrations: [__dirname + '/migrations/*.ts'],
    synchronize: false
}

export default new DataSource(dataSourceOptions)