import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSubjectsTable1781062401085 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "subjects" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" VARCHAR(255) NOT NULL,
                "description" TEXT,
                "teacherId" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "subjects_pk_id" PRIMARY KEY ("id"),
                CONSTRAINT "subjects_fk_teacher" FOREIGN KEY ("teacherId")
                    REFERENCES "user" ("id")
                    ON DELETE CASCADE
            );
        `);

        await queryRunner.query(
            `CREATE INDEX "subjects_ix_teacherId" ON "subjects" ("teacherId");`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "subjects_ix_teacherId";`);
        await queryRunner.query(`DROP TABLE "subjects";`);
    }

}
