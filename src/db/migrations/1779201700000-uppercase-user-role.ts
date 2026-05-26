import { MigrationInterface, QueryRunner } from "typeorm";

export class UppercaseUserRole1779201700000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Normaliza valores existentes
        await queryRunner.query(`UPDATE "user" SET "role" = UPPER("role") WHERE "role" IS NOT NULL;`);

        // Default consistente
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'STUDENT';`);

        // Constraint para garantir apenas valores válidos
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_ck_role";`);
        await queryRunner.query(
            `ALTER TABLE "user" ADD CONSTRAINT "user_ck_role" CHECK ("role" IN ('STUDENT', 'TEACHER'));`,
        );

        // Garante NOT NULL (caso existam registros antigos)
        await queryRunner.query(`UPDATE "user" SET "role" = 'STUDENT' WHERE "role" IS NULL;`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET NOT NULL;`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_ck_role";`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" DROP NOT NULL;`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;`);
    }

}
