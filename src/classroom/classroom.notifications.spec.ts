import { ConfigService } from '@nestjs/config';

import { ClassroomEntity } from 'src/db/entities/classroom.entity';
import { ClassroomMemberEntity } from 'src/db/entities/classroom-member.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { ClassroomMemberStatusEnum } from 'src/common/enums/classroom-member-status.enum';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { MailService } from 'src/mail/mail.service';
import { ClassroomService } from './classroom.service';

const TEACHER = 'teacher-1';
const STUDENT = 'student-1';
const CLASSROOM = 'class-1';
const TOKEN = 'convite-valido';

const professor = {
  id: TEACHER,
  username: 'ana',
  email: 'ana@ifpi.edu.br',
  role: UserRoleEnum.TEACHER,
} as UserEntity;
const aluno = {
  id: STUDENT,
  username: 'bruno',
  email: 'bruno@aluno.ifpi.edu.br',
  role: UserRoleEnum.STUDENT,
} as UserEntity;
const turma = { id: CLASSROOM, name: 'Algoritmos 2026.1', teacherId: TEACHER } as ClassroomEntity;

/**
 * Monta o serviço com dublês dos repositórios que os fluxos de pedido e aceite tocam.
 * `mail` é um espião: o que se afirma aqui é *se* e *com o quê* o e-mail foi disparado.
 */
function buildService(options: { mailFalha?: boolean; membroExistente?: ClassroomMemberEntity } = {}) {
  const membrosSalvos: ClassroomMemberEntity[] = [];

  const classroomRepository = { findOne: async () => turma };
  const inviteRepository = {
    findOne: async ({ where }: { where: { token: string } }) =>
      where.token === TOKEN
        ? { classroomId: CLASSROOM, token: TOKEN, expiresAt: new Date(Date.now() + 60_000) }
        : null,
  };
  const memberRepository = {
    findOne: async () => options.membroExistente ?? null,
    save: async (member: ClassroomMemberEntity) => {
      membrosSalvos.push(member);
      return member;
    },
  };
  /** Resolve por id (notificação), username ou email (addMember). */
  const userRepository = {
    findOne: async ({ where }: { where: Partial<UserEntity> }) =>
      [professor, aluno].find(
        u =>
          (where.id !== undefined && where.id === u.id) ||
          (where.username !== undefined && where.username === u.username) ||
          (where.email !== undefined && where.email === u.email),
      ) ?? null,
  };
  const configService = { get: () => 'https://repoif.example' } as unknown as ConfigService;

  const falhar = () => Promise.reject(new Error('Brevo fora do ar'));
  const mailService = {
    sendJoinRequestEmail: jest.fn(options.mailFalha ? falhar : async () => {}),
    sendJoinAcceptedEmail: jest.fn(options.mailFalha ? falhar : async () => {}),
  } as unknown as jest.Mocked<MailService>;

  const service = new ClassroomService(
    classroomRepository as never,
    memberRepository as never,
    {} as never, // classroomSubjects
    inviteRepository as never,
    {} as never, // subjects
    userRepository as never,
    configService,
    mailService,
  );

  return { service, mailService, membrosSalvos };
}

describe('ClassroomService.joinByInvite() — aviso ao professor', () => {
  it('notifica o professor dono da turma sobre o pedido pendente', async () => {
    const { service, mailService } = buildService();

    await service.joinByInvite(TOKEN, STUDENT, UserRoleEnum.STUDENT);

    expect(mailService.sendJoinRequestEmail).toHaveBeenCalledWith(
      professor.email,
      professor.username,
      aluno.username,
      turma.name,
      turma.id,
    );
  });

  /** Best-effort: o Brevo fora do ar não pode custar o pedido do aluno. */
  it('registra o pedido mesmo quando o envio do e-mail falha', async () => {
    const { service, membrosSalvos } = buildService({ mailFalha: true });

    const resultado = await service.joinByInvite(TOKEN, STUDENT, UserRoleEnum.STUDENT);

    expect(resultado.status).toBe(ClassroomMemberStatusEnum.PENDING);
    expect(membrosSalvos).toHaveLength(1);
  });

  it('não notifica quando o pedido é recusado por já haver membro', async () => {
    const membroExistente = { status: ClassroomMemberStatusEnum.ACTIVE } as ClassroomMemberEntity;
    const { service, mailService } = buildService({ membroExistente });

    await expect(service.joinByInvite(TOKEN, STUDENT, UserRoleEnum.STUDENT)).rejects.toThrow();
    expect(mailService.sendJoinRequestEmail).not.toHaveBeenCalled();
  });

  it('não notifica quando o convite não existe', async () => {
    const { service, mailService } = buildService();

    await expect(service.joinByInvite('inexistente', STUDENT, UserRoleEnum.STUDENT)).rejects.toThrow();
    expect(mailService.sendJoinRequestEmail).not.toHaveBeenCalled();
  });
});

describe('ClassroomService.acceptRequest() — aviso ao aluno', () => {
  const pendente = () =>
    ({ id: 'member-1', classroomId: CLASSROOM, studentId: STUDENT, status: ClassroomMemberStatusEnum.PENDING } as ClassroomMemberEntity);

  it('notifica o aluno de que entrou na turma', async () => {
    const { service, mailService } = buildService({ membroExistente: pendente() });

    await service.acceptRequest(CLASSROOM, STUDENT, TEACHER);

    expect(mailService.sendJoinAcceptedEmail).toHaveBeenCalledWith(
      aluno.email,
      aluno.username,
      turma.name,
      turma.id,
      'pedido-aceito',
    );
  });

  /** Best-effort: o aluno já está ativo na turma; o e-mail é acessório. */
  it('ativa o aluno mesmo quando o envio do e-mail falha', async () => {
    const { service, membrosSalvos } = buildService({ membroExistente: pendente(), mailFalha: true });

    const membro = await service.acceptRequest(CLASSROOM, STUDENT, TEACHER);

    expect(membro.status).toBe(ClassroomMemberStatusEnum.ACTIVE);
    expect(membrosSalvos[0].status).toBe(ClassroomMemberStatusEnum.ACTIVE);
  });

  it('não notifica quando não há pedido pendente', async () => {
    const { service, mailService } = buildService();

    await expect(service.acceptRequest(CLASSROOM, STUDENT, TEACHER)).rejects.toThrow();
    expect(mailService.sendJoinAcceptedEmail).not.toHaveBeenCalled();
  });
});

describe('ClassroomService.addMember() — aviso ao aluno', () => {
  /** Ninguém pediu nada: dizer que "seu pedido foi aceito" seria mentira. */
  it('avisa o aluno adicionado direto pelo professor, sem falar em pedido', async () => {
    const { service, mailService } = buildService();

    await service.addMember(CLASSROOM, { username: aluno.username }, TEACHER);

    expect(mailService.sendJoinAcceptedEmail).toHaveBeenCalledWith(
      aluno.email,
      aluno.username,
      turma.name,
      turma.id,
      'adicionado-pelo-professor',
    );
  });

  it('encontra o aluno pelo email e o avisa igualmente', async () => {
    const { service, mailService } = buildService();

    await service.addMember(CLASSROOM, { email: aluno.email }, TEACHER);

    expect(mailService.sendJoinAcceptedEmail).toHaveBeenCalledTimes(1);
  });

  /** O aluno tinha pedido para entrar: para ele, isso é um aceite. */
  it('ao promover um pedido pendente, avisa como pedido aceito', async () => {
    const membroExistente = {
      classroomId: CLASSROOM,
      studentId: STUDENT,
      status: ClassroomMemberStatusEnum.PENDING,
    } as ClassroomMemberEntity;
    const { service, mailService } = buildService({ membroExistente });

    await service.addMember(CLASSROOM, { username: aluno.username }, TEACHER);

    expect(mailService.sendJoinAcceptedEmail).toHaveBeenCalledWith(
      aluno.email,
      aluno.username,
      turma.name,
      turma.id,
      'pedido-aceito',
    );
  });

  it('adiciona o aluno mesmo quando o envio do e-mail falha', async () => {
    const { service, membrosSalvos } = buildService({ mailFalha: true });

    const membro = await service.addMember(CLASSROOM, { username: aluno.username }, TEACHER);

    expect(membro.status).toBe(ClassroomMemberStatusEnum.ACTIVE);
    expect(membrosSalvos).toHaveLength(1);
  });

  it('não notifica quando o aluno já é membro ativo', async () => {
    const membroExistente = { status: ClassroomMemberStatusEnum.ACTIVE } as ClassroomMemberEntity;
    const { service, mailService } = buildService({ membroExistente });

    await expect(
      service.addMember(CLASSROOM, { username: aluno.username }, TEACHER),
    ).rejects.toThrow();
    expect(mailService.sendJoinAcceptedEmail).not.toHaveBeenCalled();
  });
});
