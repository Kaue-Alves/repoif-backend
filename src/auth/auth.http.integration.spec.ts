import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { hashSync } from 'bcrypt';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';

import { portugueseValidationException } from 'src/common/validation-messages';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { TokenEntity } from 'src/db/entities/token.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { ClassroomInviteEntity } from 'src/db/entities/classroom-invite.entity';
import { ClassroomMemberEntity } from 'src/db/entities/classroom-member.entity';
import { ClassroomSubjectEntity } from 'src/db/entities/classroom-subject.entity';
import { ClassroomEntity } from 'src/db/entities/classroom.entity';
import { FileEntity } from 'src/db/entities/file.entity';
import { AssignmentEntity } from 'src/db/entities/assignment.entity';
import { AssignmentSubmissionEntity } from 'src/db/entities/assignment-submission.entity';
import { ReportEntity } from 'src/db/entities/report.entity';
import { StorageCleanupEntity } from 'src/db/entities/storage-cleanup.entity';
import { AssignmentsController } from 'src/assignments/assignments.controller';
import { AssignmentsService } from 'src/assignments/assignments.service';
import { ClassroomController } from 'src/classroom/classroom.controller';
import { ClassroomService } from 'src/classroom/classroom.service';
import { MailService } from 'src/mail/mail.service';
import { R2Service } from 'src/r2/r2.service';
import { SubjectController } from 'src/subject/subject.controller';
import { SubjectService } from 'src/subject/subject.service';
import { StorageCleanupService } from 'src/storage-cleanup/storage-cleanup.service';
import { UsersController } from 'src/users/users.controller';
import { UsersService } from 'src/users/users.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfHttpDb =
    TEST_DATABASE_URL && process.env.RUN_HTTP_TEST === '1' ? describe : describe.skip;
const JWT_SECRET = 'http-integration-secret-with-at-least-32-characters';

describeIfHttpDb('Autenticação e autorização - HTTP com PostgreSQL', () => {
    let app: INestApplication;
    let dataSource: DataSource;
    let users: Repository<UserEntity>;
    let tokens: Repository<TokenEntity>;

    const mail = {
        sendVerificationEmail: jest.fn(async () => undefined),
        sendPasswordResetEmail: jest.fn(async () => undefined),
        sendJoinRequestEmail: jest.fn(async () => undefined),
        sendJoinAcceptedEmail: jest.fn(async () => undefined),
        sendNewAssignmentEmail: jest.fn(async () => undefined),
        sendSubmissionEmail: jest.fn(async () => undefined),
    };
    const r2 = {
        buildKey: jest.fn((_contentType: string, filename: string) => `uploads/${filename}`),
        getPresignedUploadUrl: jest.fn(async (key: string) => `https://r2.test/upload/${key}`),
        createUploadProof: jest.fn(() => 'signed-upload-proof'),
        verifyUploadedObject: jest.fn(async () => undefined),
        getPresignedDownloadUrl: jest.fn(async (key: string) => `https://r2.test/download/${key}`),
        deleteObject: jest.fn(async () => undefined),
    };
    const entities = [
        UserEntity,
        TokenEntity,
        SubjectEntity,
        FileEntity,
        ClassroomEntity,
        ClassroomMemberEntity,
        ClassroomSubjectEntity,
        ClassroomInviteEntity,
        AssignmentEntity,
        AssignmentSubmissionEntity,
        ReportEntity,
        StorageCleanupEntity,
    ];

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                JwtModule.register({
                    secret: JWT_SECRET,
                    signOptions: { expiresIn: 3600 },
                }),
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    url: TEST_DATABASE_URL,
                    entities,
                    synchronize: false,
                }),
                TypeOrmModule.forFeature(entities),
            ],
            controllers: [
                UsersController,
                AuthController,
                SubjectController,
                ClassroomController,
                AssignmentsController,
            ],
            providers: [
                UsersService,
                AuthService,
                SubjectService,
                ClassroomService,
                AssignmentsService,
                StorageCleanupService,
                AuthGuard,
                RolesGuard,
                {
                    provide: ConfigService,
                    useValue: {
                        get: (key: string) => ({
                            JWT_SECRET,
                            JWT_EXPIRATION_TIME: '3600',
                            FRONTEND_URL: 'https://repoif.test',
                        })[key],
                    },
                },
                { provide: MailService, useValue: mail },
                { provide: R2Service, useValue: r2 },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
            exceptionFactory: portugueseValidationException,
        }));
        await app.init();

        dataSource = moduleRef.get(DataSource);
        users = dataSource.getRepository(UserEntity);
        tokens = dataSource.getRepository(TokenEntity);
    });

    afterAll(async () => {
        await app?.close();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await dataSource.query('TRUNCATE TABLE "user" CASCADE');
    });

    async function registerVerifyAndLogin(
        role: UserRoleEnum.STUDENT | UserRoleEnum.TEACHER,
        username = 'ana',
    ): Promise<string> {
        const registration = await request(app.getHttpServer()).post('/users').send({
            username,
            email: `${username}@ifpi.edu.br`,
            password: 'senha-segura',
            role,
        });
        expect(registration.status).toBe(201);

        const verification = await tokens.findOneByOrFail({ userId: registration.body.id });
        expect((await request(app.getHttpServer())
            .get('/auth/verify-email')
            .query({ token: verification.token })).status).toBe(200);

        const login = await request(app.getHttpServer()).post('/auth/login').send({
            username,
            password: 'senha-segura',
        });
        expect(login.status).toBe(200);
        expect(login.body).toMatchObject({ token: expect.any(String), expiresIn: 3600 });
        return login.body.token;
    }

    it('AUT-01/04/06 percorre cadastro, verificação única e login com JWT', async () => {
        const token = await registerVerifyAndLogin(UserRoleEnum.STUDENT);
        const persisted = await users.findOneByOrFail({ username: 'ana' });

        expect(token.split('.')).toHaveLength(3);
        expect(persisted.emailVerified).toBe(true);
        expect(await tokens.count()).toBe(0);
    });

    it('AUT-02 rejeita ADMIN no contrato HTTP antes de persistir', async () => {
        const response = await request(app.getHttpServer()).post('/users').send({
            username: 'intruso',
            email: 'intruso@ifpi.edu.br',
            password: 'senha-segura',
            role: UserRoleEnum.ADMIN,
        });

        expect(response.status).toBe(400);
        expect(response.body.message.join(' ')).toContain('O papel deve ser TEACHER ou STUDENT');
        expect(await users.count()).toBe(0);
    });

    it('AUT-11/20 rejeita token ausente ou inválido e nega rota ADMIN ao aluno', async () => {
        const server = app.getHttpServer();
        expect((await request(server).get('/users')).status).toBe(401);
        expect((await request(server).get('/users').auth('token-invalido', { type: 'bearer' })).status)
            .toBe(401);

        const studentToken = await registerVerifyAndLogin(UserRoleEnum.STUDENT);
        const forbidden = await request(server).get('/users').auth(studentToken, { type: 'bearer' });
        expect(forbidden.status).toBe(403);
        expect(forbidden.body.message).toBe('Acesso restrito: permissão insuficiente');
    });

    it('AUT-20/USR-08 permite ADMIN e nunca serializa hashes', async () => {
        await users.save(users.create({
            username: 'admin',
            email: 'admin@ifpi.edu.br',
            password: hashSync('senha-admin', 10),
            role: UserRoleEnum.ADMIN,
            emailVerified: true,
        }));
        const login = await request(app.getHttpServer()).post('/auth/login').send({
            email: 'admin@ifpi.edu.br',
            password: 'senha-admin',
        });
        expect(login.status).toBe(200);

        const response = await request(app.getHttpServer())
            .get('/users')
            .auth(login.body.token, { type: 'bearer' });
        expect(response.status).toBe(200);
        expect(response.body).toEqual([
            expect.objectContaining({ username: 'admin', role: UserRoleEnum.ADMIN }),
        ]);
        expect(response.text).not.toContain('senha-admin');
        expect(response.body[0]).not.toHaveProperty('password');
        expect(response.body[0]).not.toHaveProperty('email');
    });

    it('QLT-12 percorre disciplina, turma, atividade, entrega e reenvio entre professor e aluno', async () => {
        const server = app.getHttpServer();
        const teacherToken = await registerVerifyAndLogin(UserRoleEnum.TEACHER, 'professora');
        const studentToken = await registerVerifyAndLogin(UserRoleEnum.STUDENT, 'aluna');
        const student = await users.findOneByOrFail({ username: 'aluna' });

        const subject = await request(server)
            .post('/subjects')
            .auth(teacherToken, { type: 'bearer' })
            .send({ name: 'Algoritmos', description: 'Estruturas lineares', isPublic: false });
        expect(subject.status).toBe(201);

        const classroom = await request(server)
            .post('/classrooms')
            .auth(teacherToken, { type: 'bearer' })
            .send({ name: 'ADS 2026.2' });
        expect(classroom.status).toBe(201);

        expect((await request(server)
            .post(`/classrooms/${classroom.body.id}/subjects`)
            .auth(teacherToken, { type: 'bearer' })
            .send({ subjectId: subject.body.id })).status).toBe(201);
        expect((await request(server)
            .post(`/classrooms/${classroom.body.id}/members`)
            .auth(teacherToken, { type: 'bearer' })
            .send({ username: 'aluna' })).status).toBe(201);

        const dueDate = new Date(Date.now() + 2 * 86_400_000).toISOString();
        const assignment = await request(server)
            .post('/assignments')
            .auth(teacherToken, { type: 'bearer' })
            .send({
                subjectId: subject.body.id,
                title: 'Lista de filas',
                description: 'Resolva as questões propostas.',
                dueDate,
            });
        expect(assignment.status).toBe(201);

        const studentView = await request(server)
            .get(`/assignments/${assignment.body.id}`)
            .auth(studentToken, { type: 'bearer' });
        expect(studentView.status).toBe(200);
        expect(studentView.body).toMatchObject({
            title: 'Lista de filas',
            isOwner: false,
            canSubmit: true,
        });

        const firstUpload = await request(server)
            .post(`/assignments/${assignment.body.id}/submission/upload-url`)
            .auth(studentToken, { type: 'bearer' })
            .send({ filename: 'resposta-v1.pdf', contentType: 'application/pdf', size: 1024 });
        expect(firstUpload.status).toBe(201);

        const firstSubmission = await request(server)
            .post(`/assignments/${assignment.body.id}/submission`)
            .auth(studentToken, { type: 'bearer' })
            .send({
                uploadProof: firstUpload.body.uploadProof,
                key: firstUpload.body.key,
                originalName: 'resposta-v1.pdf',
                mimeType: 'application/pdf',
                size: 1024,
            });
        expect(firstSubmission.status).toBe(201);
        expect(firstSubmission.body).toMatchObject({
            studentId: student.id,
            originalName: 'resposta-v1.pdf',
            resubmitAllowed: false,
        });

        const overview = await request(server)
            .get(`/assignments/${assignment.body.id}/submissions`)
            .auth(teacherToken, { type: 'bearer' });
        expect(overview.status).toBe(200);
        expect(overview.body).toMatchObject({
            totalStudents: 1,
            submittedCount: 1,
            notSubmittedCount: 0,
        });

        expect((await request(server)
            .post(`/assignments/${assignment.body.id}/submissions/${student.id}/allow-resubmit`)
            .auth(teacherToken, { type: 'bearer' })).status).toBe(201);

        const secondUpload = await request(server)
            .post(`/assignments/${assignment.body.id}/submission/upload-url`)
            .auth(studentToken, { type: 'bearer' })
            .send({ filename: 'resposta-v2.pdf', contentType: 'application/pdf', size: 2048 });
        expect(secondUpload.status).toBe(201);

        const secondSubmission = await request(server)
            .post(`/assignments/${assignment.body.id}/submission`)
            .auth(studentToken, { type: 'bearer' })
            .send({
                uploadProof: secondUpload.body.uploadProof,
                key: secondUpload.body.key,
                originalName: 'resposta-v2.pdf',
                mimeType: 'application/pdf',
                size: 2048,
            });
        expect(secondSubmission.status).toBe(201);
        expect(secondSubmission.body).toMatchObject({
            id: firstSubmission.body.id,
            originalName: 'resposta-v2.pdf',
            size: 2048,
            resubmitAllowed: false,
        });
        expect(r2.deleteObject).toHaveBeenCalledWith('uploads/resposta-v1.pdf');
        expect(r2.verifyUploadedObject).toHaveBeenCalledTimes(2);
    });
});
