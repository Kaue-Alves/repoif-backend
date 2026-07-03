import { Column, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity({ name: 'assignment_submissions' })
@Unique('assignment_submissions_uq_assignment_student', ['assignmentId', 'studentId'])
export class AssignmentSubmissionEntity {

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    assignmentId!: string;

    @Column({ type: 'uuid' })
    studentId!: string;

    @Column({ type: 'varchar', length: 512 })
    key!: string;

    @Column({ type: 'varchar', length: 255 })
    originalName!: string;

    @Column({ type: 'varchar', length: 100 })
    mimeType!: string;

    @Column({ type: 'bigint' })
    size!: number;

    /** Quando true, o aluno pode reenviar (concedido pelo professor). Volta a false após reenvio. */
    @Column({ name: 'resubmit_allowed', type: 'boolean', default: false })
    resubmitAllowed!: boolean;

    @Column({ name: 'submitted_at', type: 'timestamp' })
    submittedAt!: Date;
}
