import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

import { UserRoleEnum } from "src/common/enums/user-role.enum";

@Entity({name: 'user'})
export class UserEntity {

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({type: 'varchar'})
    username!: string;

    @Column({type: 'varchar'})
    email!: string;
    
    @Column({type: 'varchar'})
    password!: string;

    @Column({ type: 'varchar', length: 50, default: UserRoleEnum.STUDENT })
    role!: UserRoleEnum

    @Column({type: 'boolean', default: false})
    emailVerified!: boolean;
}