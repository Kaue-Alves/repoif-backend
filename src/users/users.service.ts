import { ConflictException, Injectable } from '@nestjs/common';
import { UserDto } from './users.dto';
import { hashSync } from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from 'src/db/entities/user.entity';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { TokenEntity } from 'src/db/entities/token.entity';
import { TokenTypeEnum } from 'src/common/enums/token-type.enum';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class UsersService {

    constructor(
        @InjectRepository(UserEntity)
        private readonly usersRepository: Repository<UserEntity>,

        @InjectRepository(TokenEntity)
        private readonly tokenRepository: Repository<TokenEntity>,

        private readonly mailService: MailService
    ) {}
    
    async create(newUser: UserDto) {

        const userAlreadyRegistered = await this.findByUsername(newUser.username)

        if (userAlreadyRegistered) {
            throw new ConflictException(`User ${newUser.username} already registered`)
        }
        
        const dbUser = new UserEntity()
        dbUser.username = newUser.username
        dbUser.email = newUser.email
        dbUser.password = hashSync(newUser.password, 10)
        dbUser.role = newUser.role
        
        const {id, username, email} = await this.usersRepository.save(dbUser)
        
        const tokenEntity = new TokenEntity()
        tokenEntity.userId = id
        tokenEntity.token = randomUUID()
        tokenEntity.type = TokenTypeEnum.EMAIL_VERIFICATION
        tokenEntity.expiresAt = new Date(Date.now() + 1000 * 60 * 10)
        
        await this.tokenRepository.save(tokenEntity)
        
        await this.mailService.sendVerificationEmail(email, username, tokenEntity.token)

        
        return {id, username}
    }

    async findAllUsers(): Promise<UserDto[] | null> {
        return await this.usersRepository.find()
    }

    async findByUsername(username: string): Promise<UserDto | null> {
        
        const userFound = await this.usersRepository.findOne({where: {username}})
        
        if (!userFound) {
            return null
        }

        return {
            id: userFound.id,
            username: userFound.username,
            email: userFound.email,
            password: userFound.password,
            role: userFound.role,
            emailVerified: userFound.emailVerified
        }

        
    }
}
