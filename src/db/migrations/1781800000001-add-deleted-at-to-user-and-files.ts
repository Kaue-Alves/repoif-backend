import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToUserAndFiles1781800000001 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL;`);
        await queryRunner.query(`ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL;`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "files" DROP COLUMN IF EXISTS "deleted_at";`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "deleted_at";`);
    }
}
