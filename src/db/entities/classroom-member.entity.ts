import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

import { ClassroomMemberStatusEnum } from "src/common/enums/classroom-member-status.enum";

@Entity({ name: 'classroom_members' })
@Unique('classroom_members_uq_classroom_student', ['classroomId', 'studentId'])
export class ClassroomMemberEntity {

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    classroomId!: string;

    @Column({ type: 'uuid' })
    studentId!: string;

    @Column({ type: 'varchar', length: 50, default: ClassroomMemberStatusEnum.ACTIVE })
    status!: ClassroomMemberStatusEnum;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
    createdAt!: Date;
}
