import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTypeToToken1779769995109 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "token" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "token" VARCHAR(255) NOT NULL,
                "expiresAt" TIMESTAMP NOT NULL,

                CONSTRAINT "token_pk_id" PRIMARY KEY ("id"),
                CONSTRAINT "token_fk_user" FOREIGN KEY ("userId")
                    REFERENCES "user" ("id")
                    ON DELETE CASCADE
            );
        `);

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "token_ix_userId" ON "token" ("userId");`,
        );

        await queryRunner.query(
            `ALTER TABLE "token" ADD COLUMN IF NOT EXISTS "type" VARCHAR(50);`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "token" DROP COLUMN IF EXISTS "type";`,
        );
    }

}
