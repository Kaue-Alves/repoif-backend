import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { buildPaginationMeta, PaginationQueryDto } from './pagination-query.dto';

describe('Paginação compartilhada', () => {
    it('QLT-05 converte query string e aceita o limite máximo de 100', async () => {
        const dto = plainToInstance(PaginationQueryDto, { page: '2', limit: '100', search: 'algoritmos' });

        await expect(validate(dto)).resolves.toEqual([]);
        expect(dto).toMatchObject({ page: 2, limit: 100, search: 'algoritmos' });
    });

    it.each([
        [{ page: '0', limit: '12' }, 'page'],
        [{ page: '1.5', limit: '12' }, 'page'],
        [{ page: '1', limit: '0' }, 'limit'],
        [{ page: '1', limit: '101' }, 'limit'],
    ])('QLT-05 rejeita valores fora dos limites: %o', async (input, property) => {
        const errors = await validate(plainToInstance(PaginationQueryDto, input));
        expect(errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ property }),
        ]));
    });

    it('QLT-05 calcula metadados nas páginas inicial, final e vazia', () => {
        expect(buildPaginationMeta(1, 10, 21)).toEqual({
            page: 1,
            limit: 10,
            total: 21,
            totalPages: 3,
            hasNextPage: true,
            hasPrevPage: false,
        });
        expect(buildPaginationMeta(3, 10, 21)).toMatchObject({
            totalPages: 3,
            hasNextPage: false,
            hasPrevPage: true,
        });
        expect(buildPaginationMeta(1, 10, 0)).toMatchObject({
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
        });
    });
});
