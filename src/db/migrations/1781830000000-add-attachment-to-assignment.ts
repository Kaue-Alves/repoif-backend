import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAttachmentToAssignment1781830000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "assignments"
                ADD COLUMN "attachment_key" VARCHAR(512),
                ADD COLUMN "attachment_name" VARCHAR(255),
                ADD COLUMN "attachment_mime_type" VARCHAR(100),
                ADD COLUMN "attachment_size" BIGINT;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "assignments"
                DROP COLUMN "attachment_key",
                DROP COLUMN "attachment_name",
                DROP COLUMN "attachment_mime_type",
                DROP COLUMN "attachment_size";
        `);
    }

}
