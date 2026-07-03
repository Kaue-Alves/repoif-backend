import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: 'assignments' })
export class AssignmentEntity {

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    subjectId!: string;

    @Column({ type: 'uuid' })
    teacherId!: string;

    @Column({ type: 'varchar', length: 255 })
    title!: string;

    @Column({ type: 'text', nullable: true })
    description?: string;

    @Column({ name: 'due_date', type: 'timestamp' })
    dueDate!: Date;

    // Anexo opcional do trabalho (ex.: enunciado). Armazenado no R2.
    @Column({ name: 'attachment_key', type: 'varchar', length: 512, nullable: true })
    attachmentKey?: string | null;

    @Column({ name: 'attachment_name', type: 'varchar', length: 255, nullable: true })
    attachmentName?: string | null;

    @Column({ name: 'attachment_mime_type', type: 'varchar', length: 100, nullable: true })
    attachmentMimeType?: string | null;

    @Column({ name: 'attachment_size', type: 'bigint', nullable: true })
    attachmentSize?: number | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
    updatedAt!: Date;
}
