import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStorageCleanupJobs1781860000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "storage_cleanup_jobs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "key" VARCHAR(512) NOT NULL,
                "attempts" INTEGER NOT NULL DEFAULT 0,
                "last_error" TEXT,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "storage_cleanup_jobs_pk_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "storage_cleanup_jobs_uq_key"
            ON "storage_cleanup_jobs" ("key")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "storage_cleanup_jobs"');
    }
}
