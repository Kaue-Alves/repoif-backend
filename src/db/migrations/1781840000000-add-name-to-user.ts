import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nome de exibição, separado do `username`.
 *
 * O `username` é a identidade: entra na URL do perfil, viaja no JWT e é UNIQUE.
 * Deixá-lo mutável quebraria links de perfil já compartilhados e tornaria o token
 * obsoleto na hora da troca. O `name` é livre, editável à vontade e não é único.
 *
 * Nulo é permitido: as contas que já existem não têm nome, e a UI cai no `username`
 * até a pessoa preencher. Um NOT NULL exigiria inventar um valor para elas.
 */
export class AddNameToUser1781840000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "name" VARCHAR(120) NULL;`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "name";`);
    }
}
