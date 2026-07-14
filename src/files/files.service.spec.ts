import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { FileEntity } from 'src/db/entities/file.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { R2Service } from 'src/r2/r2.service';
import { FilesService } from './files.service';

/**
 * Teste de integração contra um Postgres real: `ILIKE` e o recorte de visibilidade
 * são feitos no SQL, e um repositório dublê provaria apenas que o dublê funciona.
 *
 * Suba o banco e rode:
 *
 *   docker run -d --rm --name repoif-test-pg -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=repoif_test -p 55432:5432 postgres:16-alpine
 *   TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/repoif_test npm test
 *
 * Sem `TEST_DATABASE_URL` a suíte é pulada, para não quebrar quem só quer rodar os
 * testes unitários.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

const TEACHER = '11111111-1111-4111-8111-111111111111';
const OTHER_TEACHER = '22222222-2222-4222-8222-222222222222';
const STUDENT = '33333333-3333-4333-8333-333333333333';

describeIfDb('FilesService (integração com Postgres)', () => {
  let service: FilesService;
  let files: Repository<FileEntity>;
  let subjects: Repository<SubjectEntity>;
  let users: Repository<UserEntity>;
  let dataSource: DataSource;
  let subjectId: string;

  const r2Stub: Partial<R2Service> = {
    getPresignedDownloadUrl: jest.fn(async (key: string) => `https://r2.test/${key}?assinado`),
    deleteObject: jest.fn(async () => undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: TEST_DATABASE_URL,
          entities: [FileEntity, SubjectEntity, UserEntity],
          synchronize: true,
          dropSchema: true,
        }),
        TypeOrmModule.forFeature([FileEntity, SubjectEntity, UserEntity]),
      ],
      providers: [FilesService, { provide: R2Service, useValue: r2Stub }],
    }).compile();

    service = moduleRef.get(FilesService);
    dataSource = moduleRef.get(DataSource);
    files = moduleRef.get(getRepositoryToken(FileEntity));
    subjects = moduleRef.get(getRepositoryToken(SubjectEntity));
    users = moduleRef.get(getRepositoryToken(UserEntity));
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await files.clear();
    await subjects.clear();
    await users.clear();

    // `disable`, `enable` e `remove` passam por `assertTeacher`: o dono precisa existir
    // e ter o papel TEACHER.
    await users.save([
      users.create({ id: TEACHER, username: 'ana', email: 'ana@ifpi.edu.br', password: 'x', role: UserRoleEnum.TEACHER }),
      users.create({ id: OTHER_TEACHER, username: 'bruno', email: 'bruno@ifpi.edu.br', password: 'x', role: UserRoleEnum.TEACHER }),
      users.create({ id: STUDENT, username: 'carla', email: 'carla@ifpi.edu.br', password: 'x', role: UserRoleEnum.STUDENT }),
    ]);

    const subject = await subjects.save(
      subjects.create({ name: 'Estruturas de Dados', teacherId: TEACHER, isPublic: true }),
    );
    subjectId = subject.id;

    await files.save([
      files.create({ originalName: 'Aula 01 - Listas.pdf', key: 'k/1', mimeType: 'application/pdf', size: 10, subjectId, uploadedBy: TEACHER, isPublic: true }),
      files.create({ originalName: 'Aula 02 - Pilhas.pdf', key: 'k/2', mimeType: 'application/pdf', size: 20, subjectId, uploadedBy: TEACHER, isPublic: true }),
      files.create({ originalName: 'Gabarito da prova.pdf', key: 'k/3', mimeType: 'application/pdf', size: 30, subjectId, uploadedBy: TEACHER, isPublic: false }),
      files.create({ originalName: 'Rascunho de aula.pdf', key: 'k/4', mimeType: 'application/pdf', size: 40, subjectId, uploadedBy: TEACHER, isPublic: false }),
    ]);
  });

  const nomes = async (userId?: string, search?: string) =>
    (await service.findBySubject(subjectId, userId, search)).map(f => f.originalName).sort();

  describe('findBySubject — visibilidade', () => {
    it('o dono vê públicos e privados', async () => {
      expect(await nomes(TEACHER)).toEqual([
        'Aula 01 - Listas.pdf',
        'Aula 02 - Pilhas.pdf',
        'Gabarito da prova.pdf',
        'Rascunho de aula.pdf',
      ]);
    });

    it.each([
      ['aluno', STUDENT],
      ['outro professor', OTHER_TEACHER],
      ['anônimo', undefined],
    ])('%s vê apenas os públicos', async (_rotulo, userId) => {
      expect(await nomes(userId)).toEqual(['Aula 01 - Listas.pdf', 'Aula 02 - Pilhas.pdf']);
    });

    it('disciplina inexistente devolve 404', async () => {
      await expect(
        service.findBySubject('44444444-4444-4444-8444-444444444444', TEACHER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findBySubject — busca', () => {
    it('filtra pelo nome, sem diferenciar maiúsculas', async () => {
      expect(await nomes(TEACHER, 'pilhas')).toEqual(['Aula 02 - Pilhas.pdf']);
      expect(await nomes(TEACHER, 'PILHAS')).toEqual(['Aula 02 - Pilhas.pdf']);
    });

    it('casa no meio do nome', async () => {
      expect(await nomes(TEACHER, 'aula')).toEqual([
        'Aula 01 - Listas.pdf',
        'Aula 02 - Pilhas.pdf',
        'Rascunho de aula.pdf',
      ]);
    });

    /**
     * A propriedade que importa: o filtro é aplicado depois do recorte de
     * visibilidade. Buscar pelo nome exato de um privado não pode revelá-lo.
     */
    it('a busca NUNCA revela um arquivo privado a quem não é dono', async () => {
      expect(await nomes(TEACHER, 'Gabarito')).toEqual(['Gabarito da prova.pdf']);

      expect(await nomes(STUDENT, 'Gabarito')).toEqual([]);
      expect(await nomes(OTHER_TEACHER, 'Gabarito')).toEqual([]);
      expect(await nomes(undefined, 'Gabarito')).toEqual([]);
    });

    it('a busca de um aluno só alcança os públicos', async () => {
      expect(await nomes(STUDENT, 'aula')).toEqual(['Aula 01 - Listas.pdf', 'Aula 02 - Pilhas.pdf']);
    });

    it('termo vazio ou só espaços equivale a não buscar', async () => {
      expect(await nomes(STUDENT, '   ')).toEqual(['Aula 01 - Listas.pdf', 'Aula 02 - Pilhas.pdf']);
      expect(await nomes(STUDENT, '')).toEqual(['Aula 01 - Listas.pdf', 'Aula 02 - Pilhas.pdf']);
    });

    it('sem correspondência devolve lista vazia', async () => {
      expect(await nomes(TEACHER, 'inexistente')).toEqual([]);
    });
  });

  describe('getDownloadUrl', () => {
    const idDe = async (nome: string) => (await files.findOneByOrFail({ originalName: nome })).id;

    it('o dono baixa um arquivo privado', async () => {
      const url = await service.getDownloadUrl(await idDe('Gabarito da prova.pdf'), TEACHER);
      expect(url).toContain('https://r2.test/');
    });

    it.each([
      ['aluno', STUDENT],
      ['outro professor', OTHER_TEACHER],
      ['anônimo', undefined],
    ])('%s recebe 403 num arquivo privado', async (_rotulo, userId) => {
      await expect(
        service.getDownloadUrl(await idDe('Gabarito da prova.pdf'), userId),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('qualquer um baixa um arquivo público', async () => {
      const id = await idDe('Aula 01 - Listas.pdf');
      await expect(service.getDownloadUrl(id, STUDENT)).resolves.toContain('https://r2.test/');
      await expect(service.getDownloadUrl(id, undefined)).resolves.toContain('https://r2.test/');
    });

    it('arquivo inexistente devolve 404', async () => {
      await expect(
        service.getDownloadUrl('44444444-4444-4444-8444-444444444444', TEACHER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── Desabilitar (exclusão lógica) vs excluir (definitiva) ────────────────────

  describe('disable() / enable()', () => {
    const idDe = async (nome: string) =>
      (await files.findOne({ where: { originalName: nome }, withDeleted: true }))!.id;

    it('desabilitar tira o arquivo da vista de todos, menos do dono', async () => {
      await service.disable(await idDe('Aula 01 - Listas.pdf'), TEACHER);

      // O dono continua vendo — precisa, para poder reabilitar.
      expect(await nomes(TEACHER)).toContain('Aula 01 - Listas.pdf');

      expect(await nomes(STUDENT)).toEqual(['Aula 02 - Pilhas.pdf']);
      expect(await nomes(OTHER_TEACHER)).toEqual(['Aula 02 - Pilhas.pdf']);
      expect(await nomes(undefined)).toEqual(['Aula 02 - Pilhas.pdf']);
    });

    it('a busca também não alcança um arquivo desabilitado', async () => {
      await service.disable(await idDe('Aula 01 - Listas.pdf'), TEACHER);

      expect(await nomes(STUDENT, 'Listas')).toEqual([]);
      expect(await nomes(TEACHER, 'Listas')).toEqual(['Aula 01 - Listas.pdf']);
    });

    it('marca deletedAt e o dono enxerga o estado', async () => {
      const [arquivo] = await service.findBySubject(subjectId, TEACHER, 'Listas');
      expect(arquivo.deletedAt).toBeFalsy();

      const desabilitado = await service.disable(arquivo.id, TEACHER);
      expect(desabilitado.deletedAt).toBeInstanceOf(Date);
    });

    it('desabilitado não pode ser baixado por terceiros — 404, não 403', async () => {
      const id = await idDe('Aula 01 - Listas.pdf'); // era público
      await service.disable(id, TEACHER);

      // 404 e não 403: um 403 confirmaria a existência do arquivo a quem tem o id.
      await expect(service.getDownloadUrl(id, STUDENT)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.getDownloadUrl(id, undefined)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('o dono ainda baixa o próprio arquivo desabilitado', async () => {
      const id = await idDe('Aula 01 - Listas.pdf');
      await service.disable(id, TEACHER);

      await expect(service.getDownloadUrl(id, TEACHER)).resolves.toContain('https://r2.test/');
    });

    it('reabilitar devolve o arquivo à listagem de todos', async () => {
      const id = await idDe('Aula 01 - Listas.pdf');
      await service.disable(id, TEACHER);
      expect(await nomes(STUDENT)).not.toContain('Aula 01 - Listas.pdf');

      const reabilitado = await service.enable(id, TEACHER);
      expect(reabilitado.deletedAt).toBeFalsy();
      expect(await nomes(STUDENT)).toContain('Aula 01 - Listas.pdf');
    });

    it('desabilitar duas vezes, ou reabilitar o que está ativo, é erro de uso', async () => {
      const id = await idDe('Aula 01 - Listas.pdf');

      await expect(service.enable(id, TEACHER)).rejects.toBeInstanceOf(BadRequestException);
      await service.disable(id, TEACHER);
      await expect(service.disable(id, TEACHER)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('só o dono desabilita', async () => {
      const id = await idDe('Aula 01 - Listas.pdf');
      await expect(service.disable(id, OTHER_TEACHER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('desabilitar NÃO apaga o objeto no R2', async () => {
      await service.disable(await idDe('Aula 01 - Listas.pdf'), TEACHER);
      expect(r2Stub.deleteObject).not.toHaveBeenCalled();
    });

    it('o dono pode renomear um arquivo desabilitado', async () => {
      const id = await idDe('Aula 01 - Listas.pdf');
      await service.disable(id, TEACHER);

      const renomeado = await service.update(id, { originalName: 'Aula 01 - Listas (revisada).pdf' }, TEACHER);
      expect(renomeado.originalName).toBe('Aula 01 - Listas (revisada).pdf');
    });
  });

  describe('remove() — exclusão definitiva', () => {
    const idDe = async (nome: string) =>
      (await files.findOne({ where: { originalName: nome }, withDeleted: true }))!.id;

    it('apaga o registro de vez e o objeto no R2', async () => {
      const id = await idDe('Aula 01 - Listas.pdf');

      await service.remove(id, TEACHER);

      expect(r2Stub.deleteObject).toHaveBeenCalledWith('k/1');
      expect(await files.findOne({ where: { id }, withDeleted: true })).toBeNull();
    });

    /** Sem `withDeleted` na busca do dono, excluir um desabilitado devolveria 404. */
    it('alcança também um arquivo já desabilitado', async () => {
      const id = await idDe('Aula 01 - Listas.pdf');
      await service.disable(id, TEACHER);

      await service.remove(id, TEACHER);

      expect(await files.findOne({ where: { id }, withDeleted: true })).toBeNull();
    });

    it('só o dono exclui', async () => {
      const id = await idDe('Aula 01 - Listas.pdf');
      await expect(service.remove(id, OTHER_TEACHER)).rejects.toBeInstanceOf(NotFoundException);
      expect(r2Stub.deleteObject).not.toHaveBeenCalled();
    });
  });
});
