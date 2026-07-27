import { join } from 'path';
import { DataSource } from 'typeorm';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfMigrationDb =
    TEST_DATABASE_URL && process.env.RUN_MIGRATION_TEST === '1' ? describe : describe.skip;

describeIfMigrationDb('Migrações - instalação limpa no PostgreSQL', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        dataSource = new DataSource({
            type: 'postgres',
            url: TEST_DATABASE_URL,
            entities: [],
            migrations: [join(__dirname, 'migrations/*{.ts,.js}')],
            synchronize: false,
        });
        await dataSource.initialize();

        await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
        await dataSource.query('CREATE SCHEMA public');
    });

    afterAll(async () => {
        await dataSource?.destroy();
    });

    it('QLT-11 executa toda a cadeia em uma base vazia', async () => {
        const executed = await dataSource.runMigrations({ transaction: 'all' });

        expect(executed).toHaveLength(19);
        expect(executed.at(0)?.name).toBe('UserTable1779199107304');
        expect(executed.at(-1)?.name).toBe('CreateStorageCleanupJobs1781860000000');
    });

    it('QLT-11 cria todas as tabelas e colunas finais usadas pelas entidades', async () => {
        const tables = await dataSource.query<{ table_name: string }[]>(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        expect(tables.map(({ table_name }) => table_name)).toEqual([
            'assignment_submissions',
            'assignments',
            'classroom_invites',
            'classroom_members',
            'classroom_subjects',
            'classrooms',
            'files',
            'migrations',
            'reports',
            'storage_cleanup_jobs',
            'subjects',
            'token',
            'user',
        ]);

        const columns = await dataSource.query<{ table_name: string; column_name: string }[]>(`
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND (
                (table_name = 'user' AND column_name IN ('name', 'emailVerified', 'deleted_at'))
                OR (table_name = 'files' AND column_name = 'deleted_at')
                OR (table_name = 'assignments' AND column_name = 'attachment_key')
                OR (table_name = 'assignment_submissions' AND column_name = 'resubmit_allowed')
              )
            ORDER BY table_name, column_name
        `);
        expect(columns).toHaveLength(6);
    });

    it('QLT-11 instala restrições críticas e não reaplica migrações', async () => {
        const indexes = await dataSource.query<{ indexname: string }[]>(`
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname IN (
                'user_un_username',
                'user_uq_email',
                'reports_uq_pending_user',
                'reports_uq_pending_file'
              )
            ORDER BY indexname
        `);
        expect(indexes.map(({ indexname }) => indexname)).toEqual([
            'reports_uq_pending_file',
            'reports_uq_pending_user',
            'user_un_username',
            'user_uq_email',
        ]);

        await expect(dataSource.runMigrations()).resolves.toEqual([]);
    });
});
