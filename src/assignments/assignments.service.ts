import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { AssignmentEntity } from 'src/db/entities/assignment.entity';
import { AssignmentSubmissionEntity } from 'src/db/entities/assignment-submission.entity';
import { SubjectEntity } from 'src/db/entities/subject.entity';
import { UserEntity } from 'src/db/entities/user.entity';
import { R2Service } from 'src/r2/r2.service';
import { MailService } from 'src/mail/mail.service';
import { ClassroomService } from 'src/classroom/classroom.service';
import { StorageCleanupService } from 'src/storage-cleanup/storage-cleanup.service';

import {
    ConfirmSubmissionDto,
    CreateAssignmentDto,
    RequestAttachmentUploadUrlDto,
    RequestSubmissionUploadUrlDto,
    UpdateAssignmentDto,
} from './assignments.dto';

@Injectable()
export class AssignmentsService {
    constructor(
        @InjectRepository(AssignmentEntity)
        private readonly assignmentRepository: Repository<AssignmentEntity>,

        @InjectRepository(AssignmentSubmissionEntity)
        private readonly submissionRepository: Repository<AssignmentSubmissionEntity>,

        @InjectRepository(SubjectEntity)
        private readonly subjectRepository: Repository<SubjectEntity>,

        @InjectRepository(UserEntity)
        private readonly userRepository: Repository<UserEntity>,

        private readonly r2Service: R2Service,
        private readonly storageCleanupService: StorageCleanupService,
        private readonly mailService: MailService,
        private readonly classroomService: ClassroomService,
        private readonly dataSource: DataSource,
    ) {}

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    private async getSubjectOwnedBy(subjectId: string, teacherId: string): Promise<SubjectEntity> {
        const subject = await this.subjectRepository.findOne({ where: { id: subjectId } });
        if (!subject) {
            throw new NotFoundException('Disciplina não encontrada');
        }
        if (subject.teacherId !== teacherId) {
            throw new ForbiddenException('Você não é o dono desta disciplina');
        }
        return subject;
    }

    private async getAssignmentOwnedBy(assignmentId: string, teacherId: string): Promise<AssignmentEntity> {
        const assignment = await this.assignmentRepository.findOne({ where: { id: assignmentId } });
        if (!assignment) {
            throw new NotFoundException('Trabalho não encontrado');
        }
        if (assignment.teacherId !== teacherId) {
            throw new ForbiddenException('Você não é o dono deste trabalho');
        }
        return assignment;
    }

    /** Garante que o usuário pode ver a disciplina e informa se ele pode realizar entregas. */
    private async assertSubjectViewer(
        subjectId: string,
        userId: string,
    ): Promise<{ subject: SubjectEntity; isOwner: boolean; isMember: boolean }> {
        const subject = await this.subjectRepository.findOne({ where: { id: subjectId } });
        if (!subject) {
            throw new NotFoundException('Disciplina não encontrada');
        }
        const isOwner = subject.teacherId === userId;
        let isMember = false;
        if (!isOwner) {
            isMember = await this.classroomService.isSubjectAccessibleToMember(subjectId, userId);
            if (!subject.isPublic && !isMember) {
                throw new ForbiddenException('Você não tem acesso a esta disciplina');
            }
        }
        return { subject, isOwner, isMember };
    }

    /** Valida a data limite: precisa ser válida e no mínimo um dia após a data atual. */
    private parseDueDate(dueDateStr: string): Date {
        const dueDate = new Date(dueDateStr);
        if (isNaN(dueDate.getTime())) {
            throw new BadRequestException('Data limite inválida');
        }
        const startOfTomorrow = new Date();
        startOfTomorrow.setHours(0, 0, 0, 0);
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
        if (dueDate.getTime() < startOfTomorrow.getTime()) {
            throw new BadRequestException('A data limite deve ser no mínimo um dia após a data atual');
        }
        return dueDate;
    }

    private isSameDay(a: Date, b: Date): boolean {
        return (
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate()
        );
    }

    private submissionView(s: AssignmentSubmissionEntity, dueDate?: Date) {
        return {
            id: s.id,
            assignmentId: s.assignmentId,
            studentId: s.studentId,
            originalName: s.originalName,
            mimeType: s.mimeType,
            size: Number(s.size),
            submittedAt: s.submittedAt,
            resubmitAllowed: s.resubmitAllowed,
            late: dueDate ? s.submittedAt.getTime() > dueDate.getTime() : undefined,
        };
    }

    // ----------------------------------------------------------------
    // Trabalhos (assignments)
    // ----------------------------------------------------------------

    /** Gera uma URL presigned para o professor enviar o anexo do trabalho ao R2. */
    async requestAttachmentUploadUrl(dto: RequestAttachmentUploadUrlDto, teacherId: string) {
        await this.getSubjectOwnedBy(dto.subjectId, teacherId);
        const key = this.r2Service.buildKey(dto.contentType, dto.filename);
        const uploadUrl = await this.r2Service.getPresignedUploadUrl(key, dto.contentType, dto.size);
        const uploadProof = this.r2Service.createUploadProof({
            userId: teacherId,
            purpose: 'assignment-attachment',
            scopeId: dto.subjectId,
            key,
            filename: dto.filename,
            contentType: dto.contentType,
            size: dto.size,
        });
        return { uploadUrl, key, uploadProof };
    }

    async create(dto: CreateAssignmentDto, teacherId: string) {
        const subject = await this.getSubjectOwnedBy(dto.subjectId, teacherId);

        const dueDate = this.parseDueDate(dto.dueDate);

        if (dto.attachment) {
            await this.r2Service.verifyUploadedObject(dto.attachment.uploadProof, {
                userId: teacherId,
                purpose: 'assignment-attachment',
                scopeId: dto.subjectId,
                key: dto.attachment.attachmentKey,
                filename: dto.attachment.attachmentName,
                contentType: dto.attachment.attachmentMimeType,
                size: dto.attachment.attachmentSize,
            });
        }

        const assignment = new AssignmentEntity();
        assignment.subjectId = subject.id;
        assignment.teacherId = teacherId;
        assignment.title = dto.title.trim();
        assignment.description = dto.description?.trim();
        assignment.dueDate = dueDate;
        if (dto.attachment) {
            assignment.attachmentKey = dto.attachment.attachmentKey;
            assignment.attachmentName = dto.attachment.attachmentName;
            assignment.attachmentMimeType = dto.attachment.attachmentMimeType;
            assignment.attachmentSize = dto.attachment.attachmentSize;
        }

        const saved = await this.assignmentRepository.save(assignment);

        // Notifica por e-mail os alunos ativos das turmas que contêm a disciplina (best-effort).
        void this.notifyStudentsOfNewAssignment(subject, saved);

        return saved;
    }

    private async notifyStudentsOfNewAssignment(subject: SubjectEntity, assignment: AssignmentEntity) {
        try {
            const students = await this.classroomService.getActiveStudentsForSubject(subject.id);
            await Promise.all(
                students.map(student =>
                    this.mailService
                        .sendNewAssignmentEmail(
                            student.email,
                            student.username,
                            subject.name,
                            assignment.title,
                            assignment.dueDate,
                            assignment.id,
                        )
                        .catch(() => {}),
                ),
            );
        } catch {
            // Falha de notificação não deve impactar a criação do trabalho.
        }
    }

    async listBySubject(subjectId: string, userId: string) {
        const { isOwner, isMember } = await this.assertSubjectViewer(subjectId, userId);

        const assignments = await this.assignmentRepository.find({
            where: { subjectId },
            order: { dueDate: 'ASC' },
        });
        if (assignments.length === 0) {
            return [];
        }

        const ids = assignments.map(a => a.id);

        if (isOwner) {
            const totalStudents = (await this.classroomService.getActiveStudentsForSubject(subjectId)).length;
            const counts = await this.submissionRepository
                .createQueryBuilder('s')
                .select('s.assignmentId', 'assignmentId')
                .addSelect('COUNT(s.id)', 'count')
                .where('s.assignmentId IN (:...ids)', { ids })
                .groupBy('s.assignmentId')
                .getRawMany<{ assignmentId: string; count: string }>();
            const countByAssignment = new Map(counts.map(c => [c.assignmentId, Number(c.count)]));

            return assignments.map(a => ({
                ...a,
                submissionsCount: countByAssignment.get(a.id) ?? 0,
                totalStudents,
            }));
        }

        // Aluno: informa o status da própria entrega em cada trabalho.
        const mySubs = await this.submissionRepository.find({
            where: { studentId: userId, assignmentId: In(ids) },
        });
        const byAssignment = new Map(mySubs.map(s => [s.assignmentId, s]));

        return assignments.map(a => {
            const sub = byAssignment.get(a.id);
            return {
                ...a,
                submitted: !!sub,
                mySubmission: sub ? this.submissionView(sub, a.dueDate) : null,
                canSubmit:
                    isMember &&
                    a.dueDate.getTime() >= Date.now() &&
                    (!sub || sub.resubmitAllowed),
            };
        });
    }

    async findOne(assignmentId: string, userId: string) {
        const assignment = await this.assignmentRepository.findOne({ where: { id: assignmentId } });
        if (!assignment) {
            throw new NotFoundException('Trabalho não encontrado');
        }
        const { subject, isOwner, isMember } = await this.assertSubjectViewer(assignment.subjectId, userId);

        const base = {
            ...assignment,
            subjectName: subject.name,
            isOwner,
        };

        if (isOwner) {
            return base;
        }

        const sub = await this.submissionRepository.findOne({
            where: { assignmentId, studentId: userId },
        });
        return {
            ...base,
            submitted: !!sub,
            mySubmission: sub ? this.submissionView(sub, assignment.dueDate) : null,
            canSubmit:
                isMember &&
                assignment.dueDate.getTime() >= Date.now() &&
                (!sub || sub.resubmitAllowed),
        };
    }

    async update(assignmentId: string, dto: UpdateAssignmentDto, teacherId: string) {
        const assignment = await this.getAssignmentOwnedBy(assignmentId, teacherId);

        if (dto.title !== undefined) assignment.title = dto.title.trim();
        if (dto.description !== undefined) assignment.description = dto.description?.trim();
        if (dto.dueDate !== undefined) {
            const newDate = new Date(dto.dueDate);
            if (isNaN(newDate.getTime())) {
                throw new BadRequestException('Data limite inválida');
            }
            // Só exige o mínimo de "amanhã" quando a data realmente muda de dia,
            // permitindo editar outros campos de um trabalho já vencido.
            if (this.isSameDay(newDate, assignment.dueDate)) {
                assignment.dueDate = newDate;
            } else {
                assignment.dueDate = this.parseDueDate(dto.dueDate);
            }
        }

        // O objeto antigo só é apagado depois de a nova referência estar persistida.
        // A chave nova ainda não é confiável até o bloco de upload vinculá-la à solicitação.
        let attachmentKeyToDelete: string | null = null;
        if (dto.attachment) {
            await this.r2Service.verifyUploadedObject(dto.attachment.uploadProof, {
                userId: teacherId,
                purpose: 'assignment-attachment',
                scopeId: assignment.subjectId,
                key: dto.attachment.attachmentKey,
                filename: dto.attachment.attachmentName,
                contentType: dto.attachment.attachmentMimeType,
                size: dto.attachment.attachmentSize,
            });
            if (assignment.attachmentKey && assignment.attachmentKey !== dto.attachment.attachmentKey) {
                attachmentKeyToDelete = assignment.attachmentKey;
            }
            assignment.attachmentKey = dto.attachment.attachmentKey;
            assignment.attachmentName = dto.attachment.attachmentName;
            assignment.attachmentMimeType = dto.attachment.attachmentMimeType;
            assignment.attachmentSize = dto.attachment.attachmentSize;
        } else if (dto.removeAttachment) {
            if (assignment.attachmentKey) {
                attachmentKeyToDelete = assignment.attachmentKey;
            }
            assignment.attachmentKey = null;
            assignment.attachmentName = null;
            assignment.attachmentMimeType = null;
            assignment.attachmentSize = null;
        }

        const saved = attachmentKeyToDelete
            ? await this.dataSource.transaction(async manager => {
                const result = await manager.getRepository(AssignmentEntity).save(assignment);
                await this.storageCleanupService.enqueue([attachmentKeyToDelete], manager);
                return result;
            })
            : await this.assignmentRepository.save(assignment);

        if (attachmentKeyToDelete) {
            await this.storageCleanupService.processKeys([attachmentKeyToDelete]);
        }
        return saved;
    }

    async remove(assignmentId: string, teacherId: string): Promise<void> {
        const assignment = await this.getAssignmentOwnedBy(assignmentId, teacherId);

        // Primeiro remove os metadados. Se o banco falhar, nenhum objeto válido é perdido.
        const submissions = await this.submissionRepository.find({ where: { assignmentId } });
        const keys = [
            ...submissions.map(submission => submission.key),
            ...(assignment.attachmentKey ? [assignment.attachmentKey] : []),
        ];
        await this.dataSource.transaction(async manager => {
            await this.storageCleanupService.enqueue(keys, manager);
            await manager.getRepository(AssignmentEntity).delete(assignmentId);
        });
        await this.storageCleanupService.processKeys(keys);
    }

    /** Download do anexo do trabalho (dono ou aluno com acesso à disciplina). */
    async getAttachmentDownloadUrl(assignmentId: string, userId: string): Promise<string> {
        const assignment = await this.assignmentRepository.findOne({ where: { id: assignmentId } });
        if (!assignment) {
            throw new NotFoundException('Trabalho não encontrado');
        }
        if (!assignment.attachmentKey) {
            throw new NotFoundException('Este trabalho não possui anexo');
        }
        await this.assertSubjectViewer(assignment.subjectId, userId);
        return this.r2Service.getPresignedDownloadUrl(assignment.attachmentKey);
    }

    // ----------------------------------------------------------------
    // Entregas (submissions)
    // ----------------------------------------------------------------

    /** Valida se o aluno pode entregar/reenviar; retorna o trabalho e a entrega existente (se houver). */
    private async assertCanSubmit(assignmentId: string, studentId: string) {
        const assignment = await this.assignmentRepository.findOne({ where: { id: assignmentId } });
        if (!assignment) {
            throw new NotFoundException('Trabalho não encontrado');
        }

        const hasAccess = await this.classroomService.isSubjectAccessibleToMember(assignment.subjectId, studentId);
        if (!hasAccess) {
            throw new ForbiddenException('Você não participa de uma turma com esta disciplina');
        }

        if (assignment.dueDate.getTime() < Date.now()) {
            throw new BadRequestException('O prazo de entrega deste trabalho já encerrou');
        }

        const existing = await this.submissionRepository.findOne({ where: { assignmentId, studentId } });
        if (existing && !existing.resubmitAllowed) {
            throw new ConflictException('Você já entregou este trabalho. Peça ao professor para permitir reenvio.');
        }

        return { assignment, existing };
    }

    async requestSubmissionUploadUrl(assignmentId: string, dto: RequestSubmissionUploadUrlDto, studentId: string) {
        await this.assertCanSubmit(assignmentId, studentId);

        const key = this.r2Service.buildKey(dto.contentType, dto.filename);
        const uploadUrl = await this.r2Service.getPresignedUploadUrl(key, dto.contentType, dto.size);
        const uploadProof = this.r2Service.createUploadProof({
            userId: studentId,
            purpose: 'assignment-submission',
            scopeId: assignmentId,
            key,
            filename: dto.filename,
            contentType: dto.contentType,
            size: dto.size,
        });
        return { uploadUrl, key, uploadProof };
    }

    async confirmSubmission(assignmentId: string, dto: ConfirmSubmissionDto, studentId: string) {
        const { assignment, existing } = await this.assertCanSubmit(assignmentId, studentId);
        await this.r2Service.verifyUploadedObject(dto.uploadProof, {
            userId: studentId,
            purpose: 'assignment-submission',
            scopeId: assignmentId,
            key: dto.key,
            filename: dto.originalName,
            contentType: dto.mimeType,
            size: dto.size,
        });

        let submission: AssignmentSubmissionEntity;

        if (existing) {
            // Reenvio autorizado: persiste a referência nova antes de apagar a anterior.
            const previousKey = existing.key;
            existing.key = dto.key;
            existing.originalName = dto.originalName;
            existing.mimeType = dto.mimeType;
            existing.size = dto.size;
            existing.submittedAt = new Date();
            existing.resubmitAllowed = false;
            if (previousKey !== dto.key) {
                submission = await this.dataSource.transaction(async manager => {
                    const result = await manager
                        .getRepository(AssignmentSubmissionEntity)
                        .save(existing);
                    await this.storageCleanupService.enqueue([previousKey], manager);
                    return result;
                });
                await this.storageCleanupService.processKeys([previousKey]);
            } else {
                submission = await this.submissionRepository.save(existing);
            }
        } else {
            const created = new AssignmentSubmissionEntity();
            created.assignmentId = assignmentId;
            created.studentId = studentId;
            created.key = dto.key;
            created.originalName = dto.originalName;
            created.mimeType = dto.mimeType;
            created.size = dto.size;
            created.resubmitAllowed = false;
            created.submittedAt = new Date();
            try {
                submission = await this.submissionRepository.save(created);
            } catch (error) {
                const details = error as { code?: string; driverError?: { code?: string } };
                if (details.code === '23505' || details.driverError?.code === '23505') {
                    throw new ConflictException(
                        'Você já entregou este trabalho. Peça ao professor para permitir reenvio.',
                    );
                }
                throw error;
            }
        }

        // Notifica o professor por e-mail (best-effort).
        void this.notifyTeacherOfSubmission(assignment, studentId);

        return this.submissionView(submission, assignment.dueDate);
    }

    private async notifyTeacherOfSubmission(assignment: AssignmentEntity, studentId: string) {
        try {
            const [teacher, student, subject] = await Promise.all([
                this.userRepository.findOne({ where: { id: assignment.teacherId } }),
                this.userRepository.findOne({ where: { id: studentId } }),
                this.subjectRepository.findOne({ where: { id: assignment.subjectId } }),
            ]);
            if (teacher && student && subject) {
                await this.mailService
                    .sendSubmissionEmail(
                        teacher.email,
                        teacher.username,
                        student.username,
                        subject.name,
                        assignment.title,
                        assignment.id,
                    )
                    .catch(() => {});
            }
        } catch {
            // Falha de notificação não deve impactar a entrega.
        }
    }

    async getMySubmission(assignmentId: string, studentId: string) {
        const assignment = await this.assignmentRepository.findOne({ where: { id: assignmentId } });
        if (!assignment) {
            throw new NotFoundException('Trabalho não encontrado');
        }
        await this.assertSubjectViewer(assignment.subjectId, studentId);

        const sub = await this.submissionRepository.findOne({ where: { assignmentId, studentId } });
        return sub ? this.submissionView(sub, assignment.dueDate) : null;
    }

    /** Professor: alunos que entregaram (com arquivo) e os que não entregaram. */
    async listSubmissions(assignmentId: string, teacherId: string) {
        const assignment = await this.getAssignmentOwnedBy(assignmentId, teacherId);

        const roster = await this.classroomService.getActiveStudentsForSubject(assignment.subjectId);
        const submissions = await this.submissionRepository.find({ where: { assignmentId } });
        const subByStudent = new Map(submissions.map(s => [s.studentId, s]));

        // Usuários que aparecem em entregas mas não estão mais no roster ainda são incluídos.
        const rosterIds = new Set(roster.map(u => u.id));
        const extraIds = submissions.map(s => s.studentId).filter(id => !rosterIds.has(id));
        const extraUsers = extraIds.length
            ? await this.userRepository.find({ where: extraIds.map(id => ({ id })) })
            : [];
        const usersById = new Map([...roster, ...extraUsers].map(u => [u.id, u]));

        const submitted = submissions.map(s => {
            const u = usersById.get(s.studentId);
            return {
                ...this.submissionView(s, assignment.dueDate),
                username: u?.username ?? null,
                email: u?.email ?? null,
            };
        });

        const notSubmitted = roster
            .filter(u => !subByStudent.has(u.id))
            .map(u => ({ studentId: u.id, username: u.username, email: u.email }));

        return {
            totalStudents: roster.length,
            submittedCount: submitted.length,
            notSubmittedCount: notSubmitted.length,
            submitted,
            notSubmitted,
        };
    }

    async getSubmissionDownloadUrl(assignmentId: string, submissionId: string, userId: string): Promise<string> {
        const submission = await this.submissionRepository.findOne({ where: { id: submissionId, assignmentId } });
        if (!submission) {
            throw new NotFoundException('Entrega não encontrada');
        }
        const assignment = await this.assignmentRepository.findOne({ where: { id: assignmentId } });
        if (!assignment) {
            throw new NotFoundException('Trabalho não encontrado');
        }

        const isOwner = assignment.teacherId === userId;
        const isAuthor = submission.studentId === userId;
        if (!isOwner && !isAuthor) {
            throw new ForbiddenException('Você não tem acesso a esta entrega');
        }

        return this.r2Service.getPresignedDownloadUrl(submission.key);
    }

    async allowResubmit(assignmentId: string, studentId: string, teacherId: string) {
        await this.getAssignmentOwnedBy(assignmentId, teacherId);

        const submission = await this.submissionRepository.findOne({ where: { assignmentId, studentId } });
        if (!submission) {
            throw new NotFoundException('Este aluno ainda não entregou o trabalho');
        }
        submission.resubmitAllowed = true;
        await this.submissionRepository.save(submission);
        return this.submissionView(submission);
    }
}
