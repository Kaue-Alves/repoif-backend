import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddIsPublicToSubject1781100096823 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn('subjects', new TableColumn({
            name: 'isPublic',
            type: 'boolean',
            default: false
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('subjects', 'isPublic');
    }

}
