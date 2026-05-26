import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

import { TokenTypeEnum } from "src/common/enums/token-type.enum";

@Entity({name: 'token'})
export class TokenEntity {

    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({type: 'uuid'})
    userId!: string;

    @Column({type: 'varchar'})
    token!: string;

    @Column({ type: 'varchar', length: 50, default: TokenTypeEnum.EMAIL_VERIFICATION })
    type!: TokenTypeEnum;

    @Column({ type: 'timestamp' })
    expiresAt!: Date;
}