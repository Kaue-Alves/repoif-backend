import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Promove o primeiro administrador da plataforma.
 *
 * Define a variável de ambiente ADMIN_EMAIL com o email de um usuário já
 * cadastrado (e verificado) antes de rodar a migration. Se ADMIN_EMAIL não
 * estiver definida, a migration não faz nada (idempotente e segura).
 */
export class PromoteInitialAdmin1781800000002 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        const adminEmail = process.env.ADMIN_EMAIL?.trim();
        if (!adminEmail) {
            return;
        }

        await queryRunner.query(
            `UPDATE "user" SET "role" = 'ADMIN', "emailVerified" = true WHERE "email" = $1;`,
            [adminEmail],
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const adminEmail = process.env.ADMIN_EMAIL?.trim();
        if (!adminEmail) {
            return;
        }

        await queryRunner.query(
            `UPDATE "user" SET "role" = 'STUDENT' WHERE "email" = $1 AND "role" = 'ADMIN';`,
            [adminEmail],
        );
    }
}
