import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateClassroomTables1781810000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Turmas
        await queryRunner.query(`
            CREATE TABLE "classrooms" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" VARCHAR(255) NOT NULL,
                "description" TEXT,
                "teacherId" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "classrooms_pk_id" PRIMARY KEY ("id"),
                CONSTRAINT "classrooms_fk_teacher" FOREIGN KEY ("teacherId")
                    REFERENCES "user" ("id") ON DELETE CASCADE
            );
        `);
        await queryRunner.query(
            `CREATE INDEX "classrooms_ix_teacherId" ON "classrooms" ("teacherId");`
        );

        // Membros da turma (alunos)
        await queryRunner.query(`
            CREATE TABLE "classroom_members" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "classroomId" uuid NOT NULL,
                "studentId" uuid NOT NULL,
                "status" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "classroom_members_pk_id" PRIMARY KEY ("id"),
                CONSTRAINT "classroom_members_uq_classroom_student" UNIQUE ("classroomId", "studentId"),
                CONSTRAINT "classroom_members_fk_classroom" FOREIGN KEY ("classroomId")
                    REFERENCES "classrooms" ("id") ON DELETE CASCADE,
                CONSTRAINT "classroom_members_fk_student" FOREIGN KEY ("studentId")
                    REFERENCES "user" ("id") ON DELETE CASCADE
            );
        `);
        await queryRunner.query(
            `CREATE INDEX "classroom_members_ix_studentId" ON "classroom_members" ("studentId");`
        );
        await queryRunner.query(
            `CREATE INDEX "classroom_members_ix_classroomId" ON "classroom_members" ("classroomId");`
        );

        // Disciplinas vinculadas à turma
        await queryRunner.query(`
            CREATE TABLE "classroom_subjects" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "classroomId" uuid NOT NULL,
                "subjectId" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "classroom_subjects_pk_id" PRIMARY KEY ("id"),
                CONSTRAINT "classroom_subjects_uq_classroom_subject" UNIQUE ("classroomId", "subjectId"),
                CONSTRAINT "classroom_subjects_fk_classroom" FOREIGN KEY ("classroomId")
                    REFERENCES "classrooms" ("id") ON DELETE CASCADE,
                CONSTRAINT "classroom_subjects_fk_subject" FOREIGN KEY ("subjectId")
                    REFERENCES "subjects" ("id") ON DELETE CASCADE
            );
        `);
        await queryRunner.query(
            `CREATE INDEX "classroom_subjects_ix_classroomId" ON "classroom_subjects" ("classroomId");`
        );

        // Convites por link (validade de 30 minutos)
        await queryRunner.query(`
            CREATE TABLE "classroom_invites" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "classroomId" uuid NOT NULL,
                "token" VARCHAR NOT NULL,
                "expiresAt" TIMESTAMP NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "classroom_invites_pk_id" PRIMARY KEY ("id"),
                CONSTRAINT "classroom_invites_uq_token" UNIQUE ("token"),
                CONSTRAINT "classroom_invites_fk_classroom" FOREIGN KEY ("classroomId")
                    REFERENCES "classrooms" ("id") ON DELETE CASCADE
            );
        `);
        await queryRunner.query(
            `CREATE INDEX "classroom_invites_ix_classroomId" ON "classroom_invites" ("classroomId");`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "classroom_invites";`);
        await queryRunner.query(`DROP TABLE "classroom_subjects";`);
        await queryRunner.query(`DROP TABLE "classroom_members";`);
        await queryRunner.query(`DROP TABLE "classrooms";`);
    }

}
