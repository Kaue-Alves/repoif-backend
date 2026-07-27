import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StorageCleanupEntity } from 'src/db/entities/storage-cleanup.entity';
import { R2Module } from 'src/r2/r2.module';
import { StorageCleanupService } from './storage-cleanup.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([StorageCleanupEntity]),
        R2Module,
    ],
    providers: [StorageCleanupService],
    exports: [StorageCleanupService],
})
export class StorageCleanupModule {}
