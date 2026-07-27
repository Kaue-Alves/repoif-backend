import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'storage_cleanup_jobs' })
@Index('storage_cleanup_jobs_uq_key', ['key'], { unique: true })
export class StorageCleanupEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar', length: 512 })
    key!: string;

    @Column({ type: 'integer', default: 0 })
    attempts!: number;

    @Column({ name: 'last_error', type: 'text', nullable: true })
    lastError?: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
    updatedAt!: Date;
}
