import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { ReportReasonEnum } from 'src/common/enums/report-reason.enum';
import { ReportStatusEnum } from 'src/common/enums/report-status.enum';
import { ReportTargetTypeEnum } from 'src/common/enums/report-target-type.enum';

@Entity({ name: 'reports' })
export class ReportEntity {

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    reporterId!: string;

    @Column({ type: 'varchar', length: 20 })
    targetType!: ReportTargetTypeEnum;

    @Column({ type: 'uuid', nullable: true })
    targetUserId?: string | null;

    @Column({ type: 'uuid', nullable: true })
    targetFileId?: string | null;

    @Column({ type: 'varchar', length: 30 })
    reason!: ReportReasonEnum;

    @Column({ type: 'text', nullable: true })
    description?: string | null;

    @Column({ type: 'varchar', length: 20, default: ReportStatusEnum.PENDING })
    status!: ReportStatusEnum;

    @Column({ type: 'uuid', nullable: true })
    resolvedBy?: string | null;

    @Column({ type: 'text', nullable: true })
    resolutionNote?: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
    updatedAt!: Date;
}
