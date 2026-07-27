import { Column, DeleteDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

import { UserRoleEnum } from "src/common/enums/user-role.enum";

@Entity({name: 'user'})
@Index('user_un_username', ['username'], { unique: true })
@Index('user_uq_email', ['email'], { unique: true })
export class UserEntity {

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({type: 'varchar'})
    username!: string;

    /**
     * Nome de exibição, livre e editável. Diferente do `username`, que é a identidade
     * (URL do perfil, JWT, UNIQUE) e por isso não muda. Nulo nas contas antigas — a UI
     * cai no `username` enquanto ninguém preencher.
     */
    @Column({ type: 'varchar', length: 120, nullable: true })
    name?: string | null;

    @Column({type: 'varchar'})
    email!: string;

    @Column({type: 'varchar'})
    password!: string;

    @Column({ type: 'varchar', length: 50, default: UserRoleEnum.STUDENT })
    role!: UserRoleEnum

    @Column({type: 'boolean', default: false})
    emailVerified!: boolean;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
    deletedAt?: Date | null;
}
