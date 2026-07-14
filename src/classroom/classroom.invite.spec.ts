import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ClassroomEntity } from 'src/db/entities/classroom.entity';
import { ClassroomInviteEntity } from 'src/db/entities/classroom-invite.entity';
import { ClassroomService } from './classroom.service';
import {
  CreateInviteDto,
  DEFAULT_INVITE_TTL_MINUTES,
  INVITE_TTL_OPTIONS_MINUTES,
} from './classroom.dto';

const TEACHER = 'teacher-1';
const CLASSROOM = 'class-1';

/** Só os repositórios que `createInvite` toca; o resto do serviço não é exercitado aqui. */
function buildService() {
  const salvos: ClassroomInviteEntity[] = [];

  const classroomRepository = {
    findOne: async () => ({ id: CLASSROOM, teacherId: TEACHER }) as ClassroomEntity,
  };
  const inviteRepository = {
    save: async (invite: ClassroomInviteEntity) => {
      salvos.push(invite);
      return invite;
    },
  };
  const configService = {
    get: (chave: string) => (chave === 'FRONTEND_URL' ? 'https://repoif.example' : undefined),
  } as unknown as ConfigService;

  const service = new ClassroomService(
    classroomRepository as never,
    {} as never, // members
    {} as never, // classroomSubjects
    inviteRepository as never,
    {} as never, // subjects
    {} as never, // users
    configService,
  );

  return { service, salvos };
}

describe('CreateInviteDto', () => {
  const violacoes = (payload: object) =>
    validateSync(plainToInstance(CreateInviteDto, payload)).flatMap(e => Object.keys(e.constraints ?? {}));

  it.each([...INVITE_TTL_OPTIONS_MINUTES])('aceita a opção de %i minutos', minutos => {
    expect(violacoes({ expiresInMinutes: minutos })).toEqual([]);
  });

  it('aceita corpo vazio — o serviço aplica o padrão', () => {
    expect(violacoes({})).toEqual([]);
  });

  /** Valor livre viraria um convite eterno digitado sem querer. */
  it.each([7, 99999, 0, -30])('recusa o valor arbitrário %i', minutos => {
    expect(violacoes({ expiresInMinutes: minutos })).not.toEqual([]);
  });

  it('recusa valor não inteiro', () => {
    expect(violacoes({ expiresInMinutes: 30.5 })).not.toEqual([]);
  });
});

describe('ClassroomService.createInvite()', () => {
  const minutosAte = (data: Date) => Math.round((data.getTime() - Date.now()) / 60_000);

  it('sem TTL informado, o convite vale o padrão de 30 minutos', async () => {
    const { service } = buildService();
    const invite = await service.createInvite(CLASSROOM, TEACHER);

    expect(DEFAULT_INVITE_TTL_MINUTES).toBe(30);
    expect(minutosAte(invite.expiresAt)).toBe(30);
  });

  it.each([...INVITE_TTL_OPTIONS_MINUTES])('respeita o TTL de %i minutos', async minutos => {
    const { service } = buildService();
    const invite = await service.createInvite(CLASSROOM, TEACHER, { expiresInMinutes: minutos });

    expect(minutosAte(invite.expiresAt)).toBe(minutos);
  });

  it('monta a URL de convite a partir de FRONTEND_URL e do token', async () => {
    const { service } = buildService();
    const invite = await service.createInvite(CLASSROOM, TEACHER);

    expect(invite.inviteUrl).toBe(`https://repoif.example/classrooms/join/${invite.token}`);
  });

  it('cada convite recebe um token distinto', async () => {
    const { service } = buildService();
    const a = await service.createInvite(CLASSROOM, TEACHER);
    const b = await service.createInvite(CLASSROOM, TEACHER);

    expect(a.token).not.toBe(b.token);
  });
});
