import { MigrationInterface, QueryRunner } from "typeorm";

export class UserTable1779199107304 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)
        await queryRunner.query(`
            CREATE TABLE "user" (
                id uuid NOT NULL default uuid_generate_v4(),
                username VARCHAR(144) NOT NULL,
                email VARCHAR(144),
                password VARCHAR(256) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'STUDENT',
                CONSTRAINT user_pk_id PRIMARY KEY (id),
                CONSTRAINT user_un_username UNIQUE (username)
            )    
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE IF EXISTS user;
        `)
    }

}
