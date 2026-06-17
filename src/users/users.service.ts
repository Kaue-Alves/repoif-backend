import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { UserDto } from './users.dto';
import { hashSync } from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from 'src/db/entities/user.entity';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { TokenEntity } from 'src/db/entities/token.entity';
import { TokenTypeEnum } from 'src/common/enums/token-type.enum';
import { MailService } from 'src/mail/mail.service';
import { SubjectService } from 'src/subject/subject.service';

@Injectable()
export class UsersService {

    constructor(
        @InjectRepository(UserEntity)
        private readonly usersRepository: Repository<UserEntity>,

        @InjectRepository(TokenEntity)
        private readonly tokenRepository: Repository<TokenEntity>,

        private readonly mailService: MailService,

        private readonly subjectService: SubjectService
    ) {}
    
    async create(newUser: UserDto) {

        const existingUser = await this.usersRepository.findOne({ where: { username: newUser.username.trim() } })

        if (existingUser) {
            if (existingUser.emailVerified) {
                throw new ConflictException(`O username "${newUser.username}" já está em uso`)
            }

            // Conta existe mas não foi verificada: corrige o email e reenvia o token
            existingUser.email = newUser.email.trim()
            existingUser.password = hashSync(newUser.password.trim(), 10)
            await this.usersRepository.save(existingUser)

            await this.tokenRepository.delete({ userId: existingUser.id, type: TokenTypeEnum.EMAIL_VERIFICATION })

            const tokenEntity = new TokenEntity()
            tokenEntity.userId = existingUser.id
            tokenEntity.token = randomUUID()
            tokenEntity.type = TokenTypeEnum.EMAIL_VERIFICATION
            tokenEntity.expiresAt = new Date(Date.now() + 1000 * 60 * 10)

            await this.tokenRepository.save(tokenEntity)

            this.mailService.sendVerificationEmail(existingUser.email, existingUser.username, tokenEntity.token).catch(() => {})

            return { id: existingUser.id, username: existingUser.username }
        }

        const dbUser = new UserEntity()
        dbUser.username = newUser.username.trim()
        dbUser.email = newUser.email.trim()
        dbUser.password = hashSync(newUser.password.trim(), 10)
        dbUser.role = newUser.role

        const {id, username, email} = await this.usersRepository.save(dbUser)

        const tokenEntity = new TokenEntity()
        tokenEntity.userId = id
        tokenEntity.token = randomUUID()
        tokenEntity.type = TokenTypeEnum.EMAIL_VERIFICATION
        tokenEntity.expiresAt = new Date(Date.now() + 1000 * 60 * 10)

        await this.tokenRepository.save(tokenEntity)

        this.mailService.sendVerificationEmail(email, username, tokenEntity.token).catch(() => {});

        return {id, username}
    }

    async findAllUsers(): Promise<UserDto[] | null> {
        return await this.usersRepository.find()
    }

    async searchTeachers(query: string): Promise<{ id: string; username: string; role: string }[]> {
        const users = await this.usersRepository
            .createQueryBuilder('user')
            .where('user.role = :role', { role: 'TEACHER' })
            .andWhere('user.emailVerified = true')
            .andWhere('user.username ILIKE :query', { query: `%${query.trim()}%` })
            .select(['user.id', 'user.username', 'user.role'])
            .getMany();

        return users.map(u => ({ id: u.id, username: u.username, role: u.role }));
    }

    async getProfile(username: string, requestingUserId?: string) {
        const user = await this.usersRepository.findOne({ where: { username } });

        if (!user) {
            throw new NotFoundException(`User ${username} not found`);
        }

        const isOwner = requestingUserId === user.id;
        const subjects = await this.subjectService.findByTeacherId(user.id, isOwner);

        return {
            username: user.username,
            role: user.role,
            subjects: subjects.map(s => ({
                id: s.id,
                name: s.name,
                description: s.description,
                isPublic: s.isPublic,
            })),
        };
    }

    async findByUsername(username: string): Promise<UserDto | null> {
        const userFound = await this.usersRepository.findOne({ where: { username } })
        if (!userFound) return null
        return {
            id: userFound.id,
            username: userFound.username,
            email: userFound.email,
            password: userFound.password,
            role: userFound.role,
            emailVerified: userFound.emailVerified
        }
    }

    async findByEmail(email: string): Promise<UserDto | null> {
        const userFound = await this.usersRepository.findOne({ where: { email } })
        if (!userFound) return null
        return {
            id: userFound.id,
            username: userFound.username,
            email: userFound.email,
            password: userFound.password,
            role: userFound.role,
            emailVerified: userFound.emailVerified
        }
    }

    async verifyEmail(token: string): Promise<void> {

        const normalizedToken = token?.trim();
        if (!normalizedToken) {
            throw new BadRequestException('Token é obrigatório');
        }

        const tokenEntity = await this.tokenRepository.findOne({
            where: {
                token: normalizedToken,
                type: TokenTypeEnum.EMAIL_VERIFICATION,
            },
        });

        if (!tokenEntity) {
            throw new BadRequestException('Token inválido');
        }

        if (tokenEntity.expiresAt.getTime() < Date.now()) {
            await this.tokenRepository.delete({ id: tokenEntity.id });
            throw new BadRequestException('Token expirado');
        }

        const user = await this.usersRepository.findOne({ where: { id: tokenEntity.userId } });
        if (!user) {
            await this.tokenRepository.delete({ id: tokenEntity.id });
            throw new BadRequestException('Usuário não encontrado');
        }

        if (!user.emailVerified) {
            user.emailVerified = true;
            await this.usersRepository.save(user);
        }

        await this.tokenRepository.delete({
            userId: user.id,
            type: TokenTypeEnum.EMAIL_VERIFICATION,
        });
    }

    async requestPasswordReset(email: string): Promise<void> {
        const normalizedEmail = email?.trim();
        if (!normalizedEmail) {
            throw new BadRequestException('Email é obrigatório');
        }

        const user = await this.usersRepository.findOne({ where: { email: normalizedEmail } });

        // Não revelar se o usuário existe
        if (!user) {
            return;
        }

        // Invalida tokens antigos de redefinição
        await this.tokenRepository.delete({
            userId: user.id,
            type: TokenTypeEnum.PASSWORD_RESET,
        });

        const tokenEntity = new TokenEntity();
        tokenEntity.userId = user.id;
        tokenEntity.token = randomUUID();
        tokenEntity.type = TokenTypeEnum.PASSWORD_RESET;
        tokenEntity.expiresAt = new Date(Date.now() + 1000 * 60 * 10); // 10 minutos

        await this.tokenRepository.save(tokenEntity);
        this.mailService.sendPasswordResetEmail(user.email, user.username, tokenEntity.token).catch(() => {});
    }

    async resetPassword(token: string, newPassword: string): Promise<void> {
        const normalizedToken = token?.trim();
        const normalizedPassword = newPassword?.trim();

        if (!normalizedToken) {
            throw new BadRequestException('Token é obrigatório');
        }

        if (!normalizedPassword) {
            throw new BadRequestException('Nova senha é obrigatória');
        }

        if (normalizedPassword.length < 8) {
            throw new BadRequestException('A senha deve ter no mínimo 8 caracteres');
        }

        const tokenEntity = await this.tokenRepository.findOne({
            where: {
                token: normalizedToken,
                type: TokenTypeEnum.PASSWORD_RESET,
            },
        });

        if (!tokenEntity) {
            throw new BadRequestException('Token inválido');
        }

        if (tokenEntity.expiresAt.getTime() < Date.now()) {
            await this.tokenRepository.delete({ id: tokenEntity.id });
            throw new BadRequestException('Token expirado');
        }

        const user = await this.usersRepository.findOne({ where: { id: tokenEntity.userId } });
        if (!user) {
            await this.tokenRepository.delete({ id: tokenEntity.id });
            throw new BadRequestException('Usuário não encontrado');
        }

        user.password = hashSync(normalizedPassword, 10);
        await this.usersRepository.save(user);

        // one-time use
        await this.tokenRepository.delete({ id: tokenEntity.id });
    }
}
