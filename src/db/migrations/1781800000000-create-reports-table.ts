import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateReportsTable1781800000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(new Table({
            name: 'reports',
            columns: [
                { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
                { name: 'reporterId', type: 'uuid' },
                { name: 'targetType', type: 'varchar', length: '20' },
                { name: 'targetUserId', type: 'uuid', isNullable: true },
                { name: 'targetFileId', type: 'uuid', isNullable: true },
                { name: 'reason', type: 'varchar', length: '30' },
                { name: 'description', type: 'text', isNullable: true },
                { name: 'status', type: 'varchar', length: '20', default: `'PENDING'` },
                { name: 'resolvedBy', type: 'uuid', isNullable: true },
                { name: 'resolutionNote', type: 'text', isNullable: true },
                { name: 'created_at', type: 'timestamp', default: 'now()' },
                { name: 'updated_at', type: 'timestamp', default: 'now()' },
            ],
        }), true);

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports" ("status");`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "reports_target_user_idx" ON "reports" ("targetUserId");`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "reports_target_file_idx" ON "reports" ("targetFileId");`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('reports');
    }
}
