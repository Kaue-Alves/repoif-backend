import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAssignmentTables1781820000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Trabalhos
        await queryRunner.query(`
            CREATE TABLE "assignments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "subjectId" uuid NOT NULL,
                "teacherId" uuid NOT NULL,
                "title" VARCHAR(255) NOT NULL,
                "description" TEXT,
                "due_date" TIMESTAMP NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "assignments_pk_id" PRIMARY KEY ("id"),
                CONSTRAINT "assignments_fk_subject" FOREIGN KEY ("subjectId")
                    REFERENCES "subjects" ("id") ON DELETE CASCADE,
                CONSTRAINT "assignments_fk_teacher" FOREIGN KEY ("teacherId")
                    REFERENCES "user" ("id") ON DELETE CASCADE
            );
        `);
        await queryRunner.query(
            `CREATE INDEX "assignments_ix_subjectId" ON "assignments" ("subjectId");`
        );

        // Entregas dos alunos
        await queryRunner.query(`
            CREATE TABLE "assignment_submissions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "assignmentId" uuid NOT NULL,
                "studentId" uuid NOT NULL,
                "key" VARCHAR(512) NOT NULL,
                "originalName" VARCHAR(255) NOT NULL,
                "mimeType" VARCHAR(100) NOT NULL,
                "size" BIGINT NOT NULL,
                "resubmit_allowed" BOOLEAN NOT NULL DEFAULT false,
                "submitted_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "assignment_submissions_pk_id" PRIMARY KEY ("id"),
                CONSTRAINT "assignment_submissions_uq_assignment_student" UNIQUE ("assignmentId", "studentId"),
                CONSTRAINT "assignment_submissions_fk_assignment" FOREIGN KEY ("assignmentId")
                    REFERENCES "assignments" ("id") ON DELETE CASCADE,
                CONSTRAINT "assignment_submissions_fk_student" FOREIGN KEY ("studentId")
                    REFERENCES "user" ("id") ON DELETE CASCADE
            );
        `);
        await queryRunner.query(
            `CREATE INDEX "assignment_submissions_ix_assignmentId" ON "assignment_submissions" ("assignmentId");`
        );
        await queryRunner.query(
            `CREATE INDEX "assignment_submissions_ix_studentId" ON "assignment_submissions" ("studentId");`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "assignment_submissions";`);
        await queryRunner.query(`DROP TABLE "assignments";`);
    }

}
