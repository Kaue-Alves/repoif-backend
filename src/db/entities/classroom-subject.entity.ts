import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity({ name: 'classroom_subjects' })
@Unique('classroom_subjects_uq_classroom_subject', ['classroomId', 'subjectId'])
export class ClassroomSubjectEntity {

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    classroomId!: string;

    @Column({ type: 'uuid' })
    subjectId!: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
    createdAt!: Date;
}
