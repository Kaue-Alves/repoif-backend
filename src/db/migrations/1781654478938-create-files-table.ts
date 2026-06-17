import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateFilesTable1781654478938 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(new Table({
            name: 'files',
            columns: [
                { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
                { name: 'originalName', type: 'varchar', length: '255' },
                { name: 'key', type: 'varchar', length: '512' },
                { name: 'mimeType', type: 'varchar', length: '100' },
                { name: 'size', type: 'bigint' },
                { name: 'subjectId', type: 'uuid' },
                { name: 'uploadedBy', type: 'uuid' },
                { name: 'isPublic', type: 'boolean', default: false },
                { name: 'created_at', type: 'timestamp', default: 'now()' },
                { name: 'updated_at', type: 'timestamp', default: 'now()' },
            ],
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable('files');
    }
}
