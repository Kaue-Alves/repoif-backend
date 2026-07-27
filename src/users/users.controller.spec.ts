import { GUARDS_METADATA } from '@nestjs/common/constants';

import { AuthGuard } from 'src/auth/auth.guard';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { UserRoleEnum } from 'src/common/enums/user-role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UsersController } from './users.controller';

describe('UsersController - listagem geral', () => {
    it('USR-08 exige autenticação e papel ADMIN', () => {
        const handler = UsersController.prototype.findAllUsers;

        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([AuthGuard, RolesGuard]);
        expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRoleEnum.ADMIN]);
    });
});
