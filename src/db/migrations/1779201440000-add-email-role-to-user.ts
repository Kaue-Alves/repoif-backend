import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailRoleToUser1779201440000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "email" VARCHAR(144);`);
        await queryRunner.query(
            `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" VARCHAR(50) NOT NULL DEFAULT 'STUDENT';`,
        );

        // Único por email (aceita múltiplos NULL no Postgres, então não quebra registros antigos)
        await queryRunner.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS "user_uq_email" ON "user" ("email");`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "user_uq_email";`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "role";`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "email";`);
    }

}
