import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailVerifiedToUser1779767798675 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "emailVerified" BOOL NOT NULL DEFAULT false;`);

    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    }

}
