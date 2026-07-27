import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A consulta prévia melhora a mensagem, mas não impede duas requisições concorrentes
 * de criarem a mesma denúncia pendente. Os índices parciais tornam a regra atômica
 * sem bloquear uma nova denúncia depois que a anterior sair de PENDING.
 */
export class AddPendingReportUniqueness1781850000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE UNIQUE INDEX "reports_uq_pending_user"
            ON "reports" ("reporterId", "targetUserId")
            WHERE "status" = 'PENDING' AND "targetUserId" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "reports_uq_pending_file"
            ON "reports" ("reporterId", "targetFileId")
            WHERE "status" = 'PENDING' AND "targetFileId" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX "reports_uq_pending_file"');
        await queryRunner.query('DROP INDEX "reports_uq_pending_user"');
    }
}
