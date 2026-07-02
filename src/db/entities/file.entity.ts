import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'files' })
export class FileEntity {

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', length: 255 })
    originalName!: string;

    @Column({ type: 'varchar', length: 512 })
    key!: string;

    @Column({ type: 'varchar', length: 100 })
    mimeType!: string;

    @Column({ type: 'bigint' })
    size!: number;

    @Column({ type: 'uuid' })
    subjectId!: string;

    @Column({ type: 'uuid' })
    uploadedBy!: string;

    @Column({ type: 'boolean', default: false })
    isPublic!: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
    updatedAt!: Date;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
    deletedAt?: Date | null;
}
