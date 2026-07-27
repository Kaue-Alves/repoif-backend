import { EntityManager, Repository } from 'typeorm';

import { StorageCleanupEntity } from 'src/db/entities/storage-cleanup.entity';
import { R2Service } from 'src/r2/r2.service';
import { StorageCleanupService } from './storage-cleanup.service';

describe('StorageCleanupService', () => {
    const queryBuilder = {
        insert: jest.fn(),
        into: jest.fn(),
        values: jest.fn(),
        orIgnore: jest.fn(),
        execute: jest.fn(),
    };
    const repository = {
        createQueryBuilder: jest.fn(() => queryBuilder),
        findBy: jest.fn(),
        find: jest.fn(),
        delete: jest.fn(),
        increment: jest.fn(),
        update: jest.fn(),
    };
    const r2Service = {
        deleteObject: jest.fn(),
    };

    let service: StorageCleanupService;

    beforeEach(() => {
        jest.clearAllMocks();
        queryBuilder.insert.mockReturnValue(queryBuilder);
        queryBuilder.into.mockReturnValue(queryBuilder);
        queryBuilder.values.mockReturnValue(queryBuilder);
        queryBuilder.orIgnore.mockReturnValue(queryBuilder);
        queryBuilder.execute.mockResolvedValue({});
        repository.findBy.mockResolvedValue([]);
        repository.find.mockResolvedValue([]);
        repository.delete.mockResolvedValue({});
        repository.increment.mockResolvedValue({});
        repository.update.mockResolvedValue({});
        r2Service.deleteObject.mockResolvedValue(undefined);
        service = new StorageCleanupService(
            repository as unknown as Repository<StorageCleanupEntity>,
            r2Service as unknown as R2Service,
        );
    });

    it('enfileira chaves únicas na mesma transação do chamador', async () => {
        const transactionalRepository = {
            createQueryBuilder: jest.fn(() => queryBuilder),
        };
        const manager = {
            getRepository: jest.fn(() => transactionalRepository),
        };

        await service.enqueue(
            ['files/a.pdf', 'files/a.pdf', '', 'files/b.pdf'],
            manager as unknown as EntityManager,
        );

        expect(manager.getRepository).toHaveBeenCalledWith(StorageCleanupEntity);
        expect(queryBuilder.values).toHaveBeenCalledWith([
            { key: 'files/a.pdf' },
            { key: 'files/b.pdf' },
        ]);
        expect(queryBuilder.orIgnore).toHaveBeenCalled();
        expect(queryBuilder.execute).toHaveBeenCalled();
    });

    it('remove o job após excluir o objeto do R2', async () => {
        repository.findBy.mockResolvedValue([{
            id: 'job-1',
            key: 'files/a.pdf',
        }]);

        await expect(service.processKeys(['files/a.pdf'])).resolves.toEqual({
            processed: 1,
            failed: 0,
        });

        expect(r2Service.deleteObject).toHaveBeenCalledWith('files/a.pdf');
        expect(repository.delete).toHaveBeenCalledWith('job-1');
        expect(repository.increment).not.toHaveBeenCalled();
    });

    it('mantém o job e registra a falha para uma tentativa posterior', async () => {
        repository.find.mockResolvedValue([{
            id: 'job-2',
            key: 'files/b.pdf',
        }]);
        r2Service.deleteObject.mockRejectedValue(new Error('R2 unavailable'));

        await expect(service.processPending(25)).resolves.toEqual({
            processed: 0,
            failed: 1,
        });

        expect(repository.find).toHaveBeenCalledWith({
            order: { createdAt: 'ASC' },
            take: 25,
        });
        expect(repository.delete).not.toHaveBeenCalled();
        expect(repository.increment).toHaveBeenCalledWith(
            { id: 'job-2' },
            'attempts',
            1,
        );
        expect(repository.update).toHaveBeenCalledWith('job-2', {
            lastError: 'R2 unavailable',
        });
    });
});
