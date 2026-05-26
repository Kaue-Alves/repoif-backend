import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTableTokens1779768929719 implements MigrationInterface {

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
            `CREATE INDEX IF NOT EXISTS "token_ix_userId" ON "token" ("userId");`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "token_ix_userId";`);
        await queryRunner.query(`DROP TABLE IF EXISTS "token";`);
    }

}

