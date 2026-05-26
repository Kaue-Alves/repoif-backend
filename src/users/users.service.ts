import { ConflictException, Injectable } from '@nestjs/common';
import { UserDto } from './users.dto';
import { hashSync } from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from 'src/db/entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class UsersService {

    constructor(
        @InjectRepository(UserEntity)
        private readonly usersRepository: Repository<UserEntity>
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
        
        const {id, username} = await this.usersRepository.save(dbUser)
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
            role: userFound.role
        }

        
    }
}
