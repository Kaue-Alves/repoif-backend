import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: 'classroom_invites' })
export class ClassroomInviteEntity {

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    classroomId!: string;

    @Column({ type: 'varchar', unique: true })
    token!: string;

    @Column({ type: 'timestamp' })
    expiresAt!: Date;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
    createdAt!: Date;
}
