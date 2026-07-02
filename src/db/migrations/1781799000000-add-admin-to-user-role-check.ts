import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Atualiza a check constraint de role para incluir o valor 'ADMIN'.
 *
 * A constraint original (migration UppercaseUserRole) só permitia
 * 'STUDENT' e 'TEACHER', o que fazia qualquer promoção a ADMIN falhar com
 * "new row for relation \"user\" violates check constraint \"user_ck_role\"".
 */
export class AddAdminToUserRoleCheck1781799000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_ck_role";`);
        await queryRunner.query(
            `ALTER TABLE "user" ADD CONSTRAINT "user_ck_role" CHECK ("role" IN ('STUDENT', 'TEACHER', 'ADMIN'));`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_ck_role";`);
        await queryRunner.query(
            `ALTER TABLE "user" ADD CONSTRAINT "user_ck_role" CHECK ("role" IN ('STUDENT', 'TEACHER'));`,
        );
    }

}
