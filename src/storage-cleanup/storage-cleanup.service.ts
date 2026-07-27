import {
    Injectable,
    OnApplicationBootstrap,
    OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { StorageCleanupEntity } from 'src/db/entities/storage-cleanup.entity';
import { R2Service } from 'src/r2/r2.service';

const RETRY_INTERVAL_MS = 60_000;

@Injectable()
export class StorageCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
    private retryTimer?: NodeJS.Timeout;
    private processing = false;

    constructor(
        @InjectRepository(StorageCleanupEntity)
        private readonly cleanupRepository: Repository<StorageCleanupEntity>,
        private readonly r2Service: R2Service,
    ) {}

    onApplicationBootstrap(): void {
        this.triggerProcessing();
        this.retryTimer = setInterval(() => this.triggerProcessing(), RETRY_INTERVAL_MS);
        this.retryTimer.unref();
    }

    onApplicationShutdown(): void {
        if (this.retryTimer) clearInterval(this.retryTimer);
    }

    async enqueue(keys: string[], manager?: EntityManager): Promise<void> {
        const uniqueKeys = [...new Set(keys.filter(Boolean))];
        if (uniqueKeys.length === 0) return;

        const repository = manager
            ? manager.getRepository(StorageCleanupEntity)
            : this.cleanupRepository;
        await repository
            .createQueryBuilder()
            .insert()
            .into(StorageCleanupEntity)
            .values(uniqueKeys.map(key => ({ key })))
            .orIgnore()
            .execute();
    }

    async processKeys(keys: string[]): Promise<{ processed: number; failed: number }> {
        const uniqueKeys = [...new Set(keys.filter(Boolean))];
        if (uniqueKeys.length === 0) return { processed: 0, failed: 0 };

        const jobs = await this.cleanupRepository.findBy({ key: In(uniqueKeys) });
        return this.processJobs(jobs);
    }

    async processPending(limit = 100): Promise<{ processed: number; failed: number }> {
        if (this.processing) return { processed: 0, failed: 0 };
        this.processing = true;
        try {
            const jobs = await this.cleanupRepository.find({
                order: { createdAt: 'ASC' },
                take: limit,
            });
            return await this.processJobs(jobs);
        } finally {
            this.processing = false;
        }
    }

    private triggerProcessing(): void {
        void this.processPending().catch(() => {
            // The next interval retries infrastructure-level failures.
        });
    }

    private async processJobs(
        jobs: StorageCleanupEntity[],
    ): Promise<{ processed: number; failed: number }> {
        let processed = 0;
        let failed = 0;

        for (const job of jobs) {
            try {
                await this.r2Service.deleteObject(job.key);
                await this.cleanupRepository.delete(job.id);
                processed += 1;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await this.cleanupRepository.increment({ id: job.id }, 'attempts', 1);
                await this.cleanupRepository.update(job.id, { lastError: message });
                failed += 1;
            }
        }

        return { processed, failed };
    }
}
